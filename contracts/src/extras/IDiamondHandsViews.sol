// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IDiamondHandsVaultView
/// @notice Read-only surface of a DiamondHandsVault clone, used by the Lens
///         aggregator. Mirrors the public storage / view functions of the
///         vault — adding fields here is non-breaking, but they MUST stay
///         in lockstep with the on-chain vault to keep the lens honest.
interface IDiamondHandsVaultView {
    function owner() external view returns (address);
    function asset() external view returns (address);
    function amount() external view returns (uint256);
    function lockStartedAt() external view returns (uint256);
    function unlockTimestamp() external view returns (uint256);
    function allowEarlyExit() external view returns (bool);
    function withdrawn() external view returns (bool);
    function maxPenaltyBps() external view returns (uint16);
    function feeReceiver() external view returns (address);
    function currentPenaltyBps() external view returns (uint256);
    function timeLeft() external view returns (uint256);
}

interface IDiamondHandsFactoryView {
    function getVaultsByOwner(address user) external view returns (address[] memory);
}
