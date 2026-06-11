// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IDiamondHandsVault} from "./interfaces/IDiamondHandsVault.sol";
import {Errors} from "./errors/Errors.sol";

/// @title  DiamondHandsFactory
/// @notice Единая точка создания персональных Vault'ов для блокировки
///         ERC-20 активов на заданный срок. Использует паттерн
///         Factory + EIP-1167 Minimal Proxy Clones: один immutable
///         `implementation` Vault'а + дешёвые клоны на каждую блокировку.
/// @dev    Наследует:
///         - Ownable2Step: двухшаговая передача владения.
///         - Pausable: пауза `createVault` при инциденте; существующие
///           Vault'ы паузой НЕ затрагиваются.
///         - ReentrancyGuard: защита createVault от reentry через
///           malicious ERC-20 (см. секцию «Защита 7» в архитектуре).
///         `renounceOwnership` ЗАБЛОКИРОВАН: см. секцию «Защита 5».
contract DiamondHandsFactory is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // -----------------------------------------------------------------
    //                            CONSTANTS
    // -----------------------------------------------------------------

    /// @notice Минимальный срок лока от момента createVault — 1 день.
    uint256 public constant MIN_LOCK_DURATION = 1 days;

    /// @notice Максимальный срок лока — 5 лет (1825 дней).
    uint256 public constant MAX_LOCK_DURATION = 1825 days;

    /// @notice Минимальный пользовательский `maxPenaltyBps` для soft-mode
    ///         Vault'ов — 5%.
    uint16 public constant MIN_USER_PENALTY_BPS = 500;

    /// @notice Абсолютный верхний предел `maxPenaltyBps` — 30%.
    ///         Защита от случайно-разрушительных значений.
    uint16 public constant ABS_MAX_PENALTY_BPS = 3000;

    /// @notice Делитель для bps-арифметики (100% = 10000).
    uint16 public constant BPS_DENOMINATOR = 10000;

    // -----------------------------------------------------------------
    //                             STORAGE
    // -----------------------------------------------------------------

    /// @notice Текущий шаблон Vault'а для НОВЫХ клонов. Может быть
    ///         обновлён `setImplementation`. Существующие клоны
    ///         навсегда привязаны к своей версии (EIP-1167 хардкодит
    ///         адрес implementation в bytecode каждого клона).
    address public implementation;

    /// @notice Текущий получатель штрафов для НОВЫХ клонов. Существующие
    ///         Vault'ы хранят свой `feeReceiver` зафиксированным
    ///         с момента `initialize`.
    address public feeReceiver;

    /// @notice Общее число созданных Vault'ов (счётчик).
    uint256 public vaultCount;

    /// @notice Все Vault'ы каждого пользователя. Заполняется в
    ///         `createVault`. Используется фронтом / индексаторами;
    ///         см. также `getVaultsByOwner`.
    mapping(address => address[]) public vaultsByOwner;

    // -----------------------------------------------------------------
    //                             EVENTS
    // -----------------------------------------------------------------

    /// @notice Эмитится при успешном создании нового Vault'а.
    /// @param owner          Владелец Vault'а (msg.sender createVault).
    /// @param vault          Адрес нового clone.
    /// @param asset          ERC-20 актив, заблокированный в Vault'е.
    /// @param amount         Фактически полученная сумма (после
    ///                       fee-on-transfer delta).
    /// @param unlockTimestamp Момент анлока.
    /// @param allowEarlyExit Режим (true = soft, false = hard).
    /// @param feeReceiver    Зафиксированный в clone получатель штрафа.
    /// @param maxPenaltyBps  Зафиксированный в clone верх penalty-кривой.
    event VaultCreated(
        address indexed owner,
        address indexed vault,
        address indexed asset,
        uint256 amount,
        uint256 unlockTimestamp,
        bool allowEarlyExit,
        address feeReceiver,
        uint16 maxPenaltyBps
    );

    /// @notice Эмитится при смене `implementation` (для БУДУЩИХ клонов).
    event ImplementationUpdated(address indexed oldImpl, address indexed newImpl);

    /// @notice Эмитится при смене `feeReceiver` (для БУДУЩИХ клонов).
    event FeeReceiverUpdated(address indexed oldReceiver, address indexed newReceiver);

    // -----------------------------------------------------------------
    //                          CONSTRUCTOR
    // -----------------------------------------------------------------

    /// @notice Деплоит Factory с указанным implementation и feeReceiver.
    /// @param _implementation Адрес уже задеплоенного, неинициализиро-
    ///                        ванного DiamondHandsVault implementation.
    ///                        Должен содержать код (`code.length > 0`).
    /// @param _feeReceiver    Стартовый получатель штрафов для будущих
    ///                        Vault'ов. Не может быть `address(0)`.
    constructor(address _implementation, address _feeReceiver) Ownable(msg.sender) {
        if (_implementation == address(0)) revert Errors.ZeroAddress();
        if (_implementation.code.length == 0) {
            revert Errors.ImplementationCodeMissing();
        }
        if (_feeReceiver == address(0)) revert Errors.ZeroAddress();

        implementation = _implementation;
        feeReceiver = _feeReceiver;

        emit ImplementationUpdated(address(0), _implementation);
        emit FeeReceiverUpdated(address(0), _feeReceiver);
    }

    // -----------------------------------------------------------------
    //                          CREATE VAULT
    // -----------------------------------------------------------------

    /// @notice Создаёт новый персональный Vault и переводит в него
    ///         средства. Функция non-payable: попытка прислать
    ///         нативный токен реверится автоматически.
    /// @dev    CEI-порядок:
    ///         1. Checks: параметры (включая `maxPenaltyBps` диапазон).
    ///         2. Effects: clone + counter + push в mapping.
    ///         3. Interactions: `safeTransferFrom(user → vault, amount)`
    ///            с balanceOf-delta измерением; затем `initialize`.
    ///         `nonReentrant` защищает от reentry через malicious ERC-20
    ///         (см. защита 7 в architecture-draft.md).
    /// @param asset           Адрес ERC-20 актива. Не может быть
    ///                        `address(0)` (revert EthNotSupported).
    /// @param amount          Заявленная сумма для блокировки. Должна
    ///                        быть > 0. Фактически в Vault попадёт
    ///                        `actualAmount` после balanceOf-delta.
    /// @param unlockTimestamp Момент анлока, в диапазоне
    ///                        `[now + MIN_LOCK_DURATION, now + MAX_LOCK_DURATION]`.
    /// @param allowEarlyExit  Режим: true = soft (с штрафом), false =
    ///                        hard (без выхода до анлока).
    /// @param maxPenaltyBps   Стартовое значение penalty-кривой в bps.
    ///                        Soft-mode: `[MIN_USER_PENALTY_BPS,
    ///                        ABS_MAX_PENALTY_BPS]`. Hard-mode: 0.
    /// @return vault          Адрес созданного Vault clone.
    function createVault(
        address asset,
        uint256 amount,
        uint256 unlockTimestamp,
        bool allowEarlyExit,
        uint16 maxPenaltyBps
    ) external whenNotPaused nonReentrant returns (address vault) {
        // ----------- Checks -----------
        if (asset == address(0)) revert Errors.EthNotSupported();
        if (asset.code.length == 0) revert Errors.InvalidAsset();
        if (amount == 0) revert Errors.AmountZero();
        if (unlockTimestamp < block.timestamp + MIN_LOCK_DURATION) {
            revert Errors.UnlockTooSoon(block.timestamp + MIN_LOCK_DURATION);
        }
        if (unlockTimestamp > block.timestamp + MAX_LOCK_DURATION) {
            revert Errors.UnlockTooFar(block.timestamp + MAX_LOCK_DURATION);
        }

        // Валидация maxPenaltyBps согласно режиму.
        if (allowEarlyExit) {
            if (maxPenaltyBps < MIN_USER_PENALTY_BPS || maxPenaltyBps > ABS_MAX_PENALTY_BPS) {
                revert Errors.InvalidPenaltyForSoftMode(MIN_USER_PENALTY_BPS, ABS_MAX_PENALTY_BPS);
            }
        } else {
            if (maxPenaltyBps != 0) revert Errors.InvalidPenaltyForHardMode();
        }

        // ----------- Effects -----------
        vault = Clones.clone(implementation);
        vaultCount++;
        vaultsByOwner[msg.sender].push(vault);

        // ----------- Interactions -----------
        // fee-on-transfer-safe перевод: меряем balanceOf на clone
        // до/после, чтобы зафиксировать actualAmount.
        IERC20 token = IERC20(asset);
        uint256 balanceBefore = token.balanceOf(vault);
        token.safeTransferFrom(msg.sender, vault, amount);
        uint256 balanceAfter = token.balanceOf(vault);
        uint256 actualAmount = balanceAfter - balanceBefore;
        if (actualAmount == 0) revert Errors.TransferReceivedZero();

        // Initialize Vault — снапшот feeReceiver на момент создания.
        IDiamondHandsVault(vault)
            .initialize(msg.sender, asset, actualAmount, unlockTimestamp, allowEarlyExit, feeReceiver, maxPenaltyBps);

        emit VaultCreated(
            msg.sender, vault, asset, actualAmount, unlockTimestamp, allowEarlyExit, feeReceiver, maxPenaltyBps
        );
    }

    // -----------------------------------------------------------------
    //                       ADMIN: setImplementation
    // -----------------------------------------------------------------

    /// @notice Обновляет `implementation` для БУДУЩИХ клонов. Не влияет
    ///         на существующие Vault'ы (EIP-1167 хардкодит адрес
    ///         в bytecode каждого клона).
    /// @param newImpl Новый адрес implementation. Должен содержать код.
    function setImplementation(address newImpl) external onlyOwner {
        if (newImpl == address(0)) revert Errors.ZeroAddress();
        if (newImpl.code.length == 0) revert Errors.ImplementationCodeMissing();
        if (newImpl == implementation) revert Errors.SameImplementation();

        address old = implementation;
        implementation = newImpl;
        emit ImplementationUpdated(old, newImpl);
    }

    // -----------------------------------------------------------------
    //                       ADMIN: setFeeReceiver
    // -----------------------------------------------------------------

    /// @notice Обновляет `feeReceiver` для БУДУЩИХ Vault'ов. Существую-
    ///         щие Vault'ы хранят свой `feeReceiver` зафиксированным.
    /// @param newReceiver Новый получатель штрафов. Не может быть
    ///                    `address(0)`.
    function setFeeReceiver(address newReceiver) external onlyOwner {
        if (newReceiver == address(0)) revert Errors.ZeroAddress();

        address old = feeReceiver;
        feeReceiver = newReceiver;
        emit FeeReceiverUpdated(old, newReceiver);
    }

    // -----------------------------------------------------------------
    //                         ADMIN: pause / unpause
    // -----------------------------------------------------------------

    /// @notice Останавливает `createVault`. Существующие Vault'ы НЕ
    ///         затрагиваются — пользователи всегда могут вывести
    ///         свои средства.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Снимает паузу `createVault`.
    function unpause() external onlyOwner {
        _unpause();
    }

    // -----------------------------------------------------------------
    //                  ADMIN: renounceOwnership (BLOCKED)
    // -----------------------------------------------------------------

    /// @notice ЗАБЛОКИРОВАНО. Всегда реверится с
    ///         `RenounceOwnershipDisabled`.
    /// @dev    Если Factory лишится owner'а, нельзя будет обновить
    ///         implementation, feeReceiver или поставить паузу. Это
    ///         не сломает существующие Vault'ы, но остановит эволюцию
    ///         протокола.
    function renounceOwnership() public view override onlyOwner {
        revert Errors.RenounceOwnershipDisabled();
    }

    // -----------------------------------------------------------------
    //                          VIEW FUNCTIONS
    // -----------------------------------------------------------------

    /// @notice Возвращает полный массив Vault'ов пользователя.
    /// @dev    Известное ограничение: для пользователей с большим
    ///         количеством Vault'ов (>100) возврат может упереться
    ///         в газовый лимит RPC. Пагинация — кандидат на Фазу 2.
    /// @param user Адрес пользователя.
    /// @return Массив адресов Vault'ов в порядке создания.
    function getVaultsByOwner(address user) external view returns (address[] memory) {
        return vaultsByOwner[user];
    }
}
