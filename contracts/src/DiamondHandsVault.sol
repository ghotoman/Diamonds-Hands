// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {Errors} from "./errors/Errors.sol";

/// @title  DiamondHandsVault
/// @notice Персональное on-chain хранилище для блокировки ERC-20 актива
///         на заданный срок. Один Vault = один актив + один период + один
///         пользователь. Soft-mode позволяет досрочный выход с линейно
///         убывающим штрафом; hard-mode жёстко лочит до анлока.
/// @dev    Этот контракт деплоится как implementation для EIP-1167 клонов.
///         Сам implementation НИКОГДА не используется напрямую: storage
///         персонален у каждого клона, а код общий через delegatecall.
///         Конструктор вызывает `_disableInitializers()`, что блокирует
///         любой прямой `initialize` на этом адресе.
contract DiamondHandsVault is Initializable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // -----------------------------------------------------------------
    //                            STORAGE
    // -----------------------------------------------------------------

    // Slot N+0: упаковка 20 + 1 + 1 + 2 = 24 байта ≤ 32 байт.
    /// @notice Владелец Vault'а — единственный, кто может withdraw /
    ///         emergencyWithdraw / topUp / extendLock / checkIn.
    address public owner;

    /// @notice Режим выхода: true = soft (penalty), false = hard.
    ///         Фиксируется навсегда при `initialize`.
    bool public allowEarlyExit;

    /// @notice Финальный статус. После withdraw / emergencyWithdraw
    ///         становится true. Повторный вывод и любые мутации
    ///         блокируются.
    bool public withdrawn;

    /// @notice Стартовое значение penalty-кривой в bps.
    ///         Soft: [500, 3000]. Hard: всегда 0.
    ///         Фиксируется навсегда при `initialize`.
    uint16 public maxPenaltyBps;

    // Slot N+1
    /// @notice Адрес ERC-20 актива. Не может быть `address(0)`.
    address public asset;

    // Slot N+2
    /// @notice Получатель штрафа при emergencyWithdraw.
    ///         Фиксируется навсегда при `initialize`. Vault НЕ читает
    ///         feeReceiver динамически из Factory — это гарантия
    ///         пользователю.
    address public feeReceiver;

    // Slot N+3
    /// @notice Текущая суммарная заблокированная сумма (с учётом topUp).
    uint256 public amount;

    // Slot N+4
    /// @notice Timestamp создания Vault'а (метаинфо для UI).
    uint256 public createdAt;

    // Slot N+5
    /// @notice Точка отсчёта текущей penalty-кривой. Обновляется при
    ///         `extendLock` (penalty-кривая рестартится с MAX).
    uint256 public lockStartedAt;

    // Slot N+6
    /// @notice Момент анлока. После него withdraw возвращает 100%.
    uint256 public unlockTimestamp;

    // -----------------------------------------------------------------
    //                            CONSTANTS
    // -----------------------------------------------------------------

    /// @notice Делитель для bps-арифметики (100% = 10000).
    uint256 internal constant BPS_DENOMINATOR = 10000;

    /// @notice Жёсткий хардкод-предел для `extendLock`: новый
    ///         `unlockTimestamp` не может уходить более чем на 5 лет
    ///         от текущего момента. Совпадает с `MAX_LOCK_DURATION`
    ///         в Factory.
    uint256 internal constant MAX_LOCK_DURATION = 1825 days;

    // -----------------------------------------------------------------
    //                             EVENTS
    // -----------------------------------------------------------------

    /// @notice Эмитится при успешном `withdraw` после анлока.
    event Withdrawn(address indexed owner, uint256 amount);

    /// @notice Эмитится при `emergencyWithdraw` до анлока.
    /// @param amountToOwner Сумма, которая пошла владельцу
    ///                      (`amount - penaltyAmount`).
    /// @param penaltyAmount Сумма штрафа, которая пошла на `feeReceiver`
    ///                     (или 0, тогда отправка пропущена).
    event EmergencyWithdrawn(address indexed owner, uint256 amountToOwner, uint256 penaltyAmount);

    /// @notice Эмитится при `topUp`. `addedAmount` — фактически
    ///         полученная дельта (для fee-on-transfer < заявленного).
    event ToppedUp(address indexed owner, uint256 addedAmount, uint256 newTotalAmount);

    /// @notice Эмитится при `extendLock`. Параллельно сбрасывается
    ///         `lockStartedAt` (penalty-кривая рестартится).
    event LockExtended(uint256 oldUnlockTimestamp, uint256 newUnlockTimestamp);

    /// @notice Эмитится при `checkIn` — no-op для будущих бэйджей
    ///         стрика. Существование events позволяет считать
    ///         регулярность off-chain без затрат на on-chain state.
    event CheckedIn(address indexed owner, uint256 timestamp);

    // -----------------------------------------------------------------
    //                          CONSTRUCTOR
    // -----------------------------------------------------------------

    /// @dev Implementation deploys with initializers disabled — это
    ///      исключает любой `initialize` на самом implementation, оставляя
    ///      инициализируемыми только клоны через `Clones.clone()`.
    constructor() {
        _disableInitializers();
    }

    // -----------------------------------------------------------------
    //                           INITIALIZE
    // -----------------------------------------------------------------

    /// @notice Инициализирует свежий clone параметрами Vault'а.
    /// @dev    Вызывается из `DiamondHandsFactory.createVault` ровно
    ///         один раз сразу после `Clones.clone`. Внутри атомарной
    ///         транзакции Factory переводит средства до initialize
    ///         и передаёт `actualAmount` (с учётом fee-on-transfer).
    /// @param owner_           Адрес владельца Vault'а.
    /// @param asset_           Адрес ERC-20 актива.
    /// @param amount_          Фактически полученная сумма.
    /// @param unlockTimestamp_ Момент анлока (всегда > block.timestamp).
    /// @param allowEarlyExit_  Режим: true → soft, false → hard.
    /// @param feeReceiver_     Получатель штрафа. Фиксируется навсегда.
    /// @param maxPenaltyBps_   Верх penalty-кривой. Soft: [500, 3000].
    ///                         Hard: строго 0.
    function initialize(
        address owner_,
        address asset_,
        uint256 amount_,
        uint256 unlockTimestamp_,
        bool allowEarlyExit_,
        address feeReceiver_,
        uint16 maxPenaltyBps_
    ) external initializer {
        if (owner_ == address(0)) revert Errors.ZeroAddress();
        if (asset_ == address(0)) revert Errors.InvalidAsset();
        if (amount_ == 0) revert Errors.AmountZero();
        if (unlockTimestamp_ <= block.timestamp) {
            revert Errors.InvalidUnlockTimestamp();
        }
        if (feeReceiver_ == address(0)) revert Errors.ZeroAddress();

        // Двойная страховка инварианта режима / штрафа. Factory уже
        // проверил полный диапазон; здесь только бинарная проверка
        // совместимости (soft → нужен штраф, hard → штраф запрещён).
        if (allowEarlyExit_) {
            if (maxPenaltyBps_ == 0) revert Errors.MaxPenaltyMismatch();
        } else {
            if (maxPenaltyBps_ != 0) revert Errors.MaxPenaltyMismatch();
        }

        owner = owner_;
        asset = asset_;
        amount = amount_;
        createdAt = block.timestamp;
        lockStartedAt = block.timestamp;
        unlockTimestamp = unlockTimestamp_;
        allowEarlyExit = allowEarlyExit_;
        feeReceiver = feeReceiver_;
        maxPenaltyBps = maxPenaltyBps_;
    }

    // -----------------------------------------------------------------
    //                            WITHDRAW
    // -----------------------------------------------------------------

    /// @notice Полный вывод средств после `unlockTimestamp`.
    /// @dev    Checks → Effects (withdrawn = true, amount = 0) →
    ///         Interactions (safeTransfer). `nonReentrant` страхует
    ///         от reentry через malicious ERC-20.
    function withdraw() external nonReentrant {
        if (msg.sender != owner) revert Errors.NotOwner();
        if (block.timestamp < unlockTimestamp) {
            revert Errors.NotWithdrawable();
        }
        if (withdrawn) revert Errors.AlreadyWithdrawn();

        withdrawn = true;
        uint256 payout = amount;
        amount = 0;

        emit Withdrawn(owner, payout);
        IERC20(asset).safeTransfer(owner, payout);
    }

    // -----------------------------------------------------------------
    //                        EMERGENCY WITHDRAW
    // -----------------------------------------------------------------

    /// @notice Досрочный выход с штрафом. Доступен только для soft-mode
    ///         Vault'ов и только ДО `unlockTimestamp`.
    /// @dev    Penalty считается от `currentPenaltyBps()` (линейно
    ///         убывает к 0). Перевод на `feeReceiver` происходит только
    ///         при `penaltyAmt > 0` — защита от ERC-20, реверящих
    ///         на `transfer(_, 0)`.
    function emergencyWithdraw() external nonReentrant {
        if (msg.sender != owner) revert Errors.NotOwner();
        if (!allowEarlyExit) revert Errors.HardLockNoExit();
        if (withdrawn) revert Errors.AlreadyWithdrawn();
        if (block.timestamp >= unlockTimestamp) {
            revert Errors.UseWithdrawInstead();
        }

        uint256 penaltyAmt = currentPenaltyAmount();
        uint256 payout = amount - penaltyAmt;

        withdrawn = true;
        amount = 0;

        emit EmergencyWithdrawn(owner, payout, penaltyAmt);

        IERC20 token = IERC20(asset);
        token.safeTransfer(owner, payout);
        if (penaltyAmt > 0) {
            token.safeTransfer(feeReceiver, penaltyAmt);
        }
    }

    // -----------------------------------------------------------------
    //                              TOP UP
    // -----------------------------------------------------------------

    /// @notice Увеличивает заблокированную позицию тем же ERC-20 активом.
    ///         Срок анлока НЕ меняется. Функция non-payable — попытка
    ///         отправить нативный токен реверится автоматически.
    /// @dev    Использует `balanceOf` delta для совместимости
    ///         с fee-on-transfer токенами.
    /// @param addAmount Сумма для добавления. Реально может быть
    ///                  получено меньше (для fee-on-transfer).
    function topUp(uint256 addAmount) external nonReentrant {
        if (msg.sender != owner) revert Errors.NotOwner();
        if (withdrawn) revert Errors.AlreadyWithdrawn();
        if (block.timestamp >= unlockTimestamp) {
            revert Errors.TopUpAfterUnlock();
        }
        if (addAmount == 0) revert Errors.AmountZero();

        IERC20 token = IERC20(asset);
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), addAmount);
        uint256 balanceAfter = token.balanceOf(address(this));
        uint256 delta = balanceAfter - balanceBefore;
        if (delta == 0) revert Errors.TransferReceivedZero();

        amount += delta;
        emit ToppedUp(owner, delta, amount);
    }

    // -----------------------------------------------------------------
    //                           EXTEND LOCK
    // -----------------------------------------------------------------

    /// @notice Продлевает срок лока. `lockStartedAt` сбрасывается
    ///         на `block.timestamp` — penalty-кривая стартует заново
    ///         с `maxPenaltyBps`.
    /// @dev    Лимит «не более 5 лет от текущего момента» считается
    ///         хардкодом, синхронизированным с Factory.MAX_LOCK_DURATION.
    /// @param newUnlockTimestamp Новый момент анлока, строго больше
    ///                           текущего `unlockTimestamp`.
    function extendLock(uint256 newUnlockTimestamp) external {
        if (msg.sender != owner) revert Errors.NotOwner();
        if (withdrawn) revert Errors.AlreadyWithdrawn();
        if (block.timestamp >= unlockTimestamp) {
            revert Errors.ExtendAfterUnlock();
        }
        if (newUnlockTimestamp <= unlockTimestamp) {
            revert Errors.ExtendMustIncrease();
        }
        if (newUnlockTimestamp - block.timestamp > MAX_LOCK_DURATION) {
            revert Errors.UnlockTooFar(block.timestamp + MAX_LOCK_DURATION);
        }

        uint256 oldUnlockTimestamp = unlockTimestamp;
        unlockTimestamp = newUnlockTimestamp;
        lockStartedAt = block.timestamp; // penalty curve restart

        emit LockExtended(oldUnlockTimestamp, newUnlockTimestamp);
    }

    // -----------------------------------------------------------------
    //                            CHECK IN
    // -----------------------------------------------------------------

    /// @notice No-op действие, эмитящее событие `CheckedIn`. Полезно
    ///         для будущей badge-системы стрика (считается off-chain).
    /// @dev    State не меняется, газ только на base + событие.
    function checkIn() external {
        if (msg.sender != owner) revert Errors.NotOwner();
        if (withdrawn) revert Errors.AlreadyWithdrawn();
        emit CheckedIn(owner, block.timestamp);
    }

    // -----------------------------------------------------------------
    //                          VIEW FUNCTIONS
    // -----------------------------------------------------------------

    /// @notice Текущий штраф в bps. 0 после анлока, 0 в hard-mode.
    /// @return Bps в диапазоне `[0, maxPenaltyBps]`, линейно убывает
    ///         от `maxPenaltyBps` на `lockStartedAt` до 0 на
    ///         `unlockTimestamp`.
    function currentPenaltyBps() public view returns (uint256) {
        if (block.timestamp >= unlockTimestamp) return 0;
        if (!allowEarlyExit) return 0;
        uint256 timeLeft_ = unlockTimestamp - block.timestamp;
        uint256 totalDuration = unlockTimestamp - lockStartedAt;
        return (uint256(maxPenaltyBps) * timeLeft_) / totalDuration;
    }

    /// @notice Абсолютная сумма штрафа в единицах `asset`,
    ///         рассчитанная от текущего `amount` по текущей кривой.
    function currentPenaltyAmount() public view returns (uint256) {
        return (amount * currentPenaltyBps()) / BPS_DENOMINATOR;
    }

    /// @notice Сколько секунд осталось до анлока. 0 после анлока.
    function timeLeft() external view returns (uint256) {
        if (block.timestamp >= unlockTimestamp) return 0;
        return unlockTimestamp - block.timestamp;
    }
}
