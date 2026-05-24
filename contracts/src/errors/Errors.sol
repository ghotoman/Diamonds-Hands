// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title Errors
/// @notice Общая библиотека custom errors для DiamondHandsFactory
///         и DiamondHandsVault. Custom errors дешевле строковых
///         require по газу и дают однозначный селектор в трейсах.
library Errors {
    // -------- Factory --------

    /// @dev Передан нулевой адрес там, где он недопустим
    ///      (implementation, feeReceiver, owner).
    error ZeroAddress();

    /// @dev Попытка создать Vault с `asset == address(0)`.
    ///      Нативный ETH не поддерживается — оборачивай в WETH на фронте.
    error EthNotSupported();

    /// @dev Адрес `asset` не является контрактом (нет кода).
    error InvalidAsset();

    /// @dev Передана нулевая сумма там, где она недопустима
    ///      (createVault.amount, topUp.addAmount).
    error AmountZero();

    /// @dev Срок лока меньше MIN_LOCK_DURATION (7 дней).
    ///      `minUnlock` — минимальный допустимый unlockTimestamp.
    error UnlockTooSoon(uint256 minUnlock);

    /// @dev Срок лока больше MAX_LOCK_DURATION (1825 дней).
    ///      `maxUnlock` — максимальный допустимый unlockTimestamp.
    error UnlockTooFar(uint256 maxUnlock);

    /// @dev Для soft-mode (`allowEarlyExit == true`) `maxPenaltyBps`
    ///      должен быть в диапазоне [min, max].
    error InvalidPenaltyForSoftMode(uint16 min, uint16 max);

    /// @dev Для hard-mode (`allowEarlyExit == false`) `maxPenaltyBps`
    ///      обязан быть == 0.
    error InvalidPenaltyForHardMode();

    /// @dev После `safeTransferFrom` фактически получено 0 токенов
    ///      (fee-on-transfer или нестандартный ERC-20).
    error TransferReceivedZero();

    /// @dev Новый implementation Vault'а не содержит кода.
    error ImplementationCodeMissing();

    /// @dev Попытка вызвать `renounceOwnership()` на Factory —
    ///      это сознательно заблокировано.
    error RenounceOwnershipDisabled();

    /// @dev Попытка установить тот же implementation, что уже стоит.
    error SameImplementation();

    // -------- Vault --------

    /// @dev Функция должна вызываться только владельцем Vault'а.
    error NotOwner();

    /// @dev Попытка повторной инициализации Vault clone.
    ///      (На уровне OZ Initializable также сработает свой ревёрт;
    ///       этот error может пригодиться для собственных проверок.)
    error AlreadyInitialized();

    /// @dev Vault ещё не разлочен (`block.timestamp < unlockTimestamp`).
    error NotWithdrawable();

    /// @dev Vault уже выведен — повторный withdraw / emergencyWithdraw
    ///      / topUp / extendLock невозможны.
    error AlreadyWithdrawn();

    /// @dev `emergencyWithdraw` вызван на hard-lock Vault
    ///      (`allowEarlyExit == false`).
    error HardLockNoExit();

    /// @dev `emergencyWithdraw` вызван после `unlockTimestamp` —
    ///      нужно звать обычный `withdraw`, без штрафа.
    error UseWithdrawInstead();

    /// @dev `extendLock` с `newUnlockTimestamp <= unlockTimestamp`.
    error ExtendMustIncrease();

    /// @dev `extendLock` вызван после `unlockTimestamp` — лок истёк,
    ///      продлевать нечего.
    error ExtendAfterUnlock();

    /// @dev `topUp` вызван после `unlockTimestamp` — добавлять
    ///      средства в разлоченный Vault бессмысленно.
    error TopUpAfterUnlock();

    /// @dev `_unlockTimestamp` в `initialize` <= `block.timestamp`.
    error InvalidUnlockTimestamp();

    /// @dev Несоответствие инварианта (`allowEarlyExit`, `maxPenaltyBps`)
    ///      на уровне Vault. Soft-mode требует `maxPenaltyBps != 0`,
    ///      hard-mode — `maxPenaltyBps == 0`.
    error MaxPenaltyMismatch();
}
