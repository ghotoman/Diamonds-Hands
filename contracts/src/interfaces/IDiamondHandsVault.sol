// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IDiamondHandsVault
/// @notice Интерфейс DiamondHandsVault для типобезопасного вызова
///         из DiamondHandsFactory. Содержит только `initialize`,
///         потому что это единственная функция, которую Factory
///         вызывает на свеже-склонированном Vault'е в той же транзакции.
interface IDiamondHandsVault {
    /// @notice Инициализирует свежий clone параметрами Vault'а.
    /// @dev Должна вызываться РОВНО ОДИН РАЗ, сразу после `Clones.clone`,
    ///      в той же транзакции. Защищено `initializer` modifier OZ.
    /// @param owner_           Владелец позиции (обычно `msg.sender`
    ///                         createVault'а).
    /// @param asset_           Адрес ERC-20 актива. Не может быть
    ///                         `address(0)`.
    /// @param amount_          Фактически полученная сумма (после
    ///                         `balanceOf` delta для fee-on-transfer).
    /// @param unlockTimestamp_ Момент анлока, всегда > block.timestamp.
    /// @param allowEarlyExit_  Режим: true → soft (penalty), false → hard.
    /// @param feeReceiver_     Получатель штрафа, фиксируется навсегда.
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
    ) external;
}
