// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IDiamondHandsVaultView, IDiamondHandsFactoryView} from "./IDiamondHandsViews.sol";

/// @title  DiamondHandsLens
/// @notice View-only aggregator: bundles a user's vault list + every per-vault
///         field into ONE on-chain read. Frontends that previously had to fan
///         out N+1 multicalls (one to the factory, one per vault) can call
///         `getVaults(user)` instead.
/// @dev    Stateless and ownerless. The factory address is bound at deploy
///         time so a caller can't trick the lens into reading from a fake
///         registry; for a different factory, deploy another lens.
contract DiamondHandsLens {
    /// Snapshot of one vault as the dashboard sees it. Field order kept in
    /// sync with the on-chain vault — packed into a single struct so a single
    /// `getVaults` return reads as one ABI tuple per vault.
    struct VaultView {
        address vault;
        address owner;
        address asset;
        uint256 amount;
        uint256 lockStartedAt;
        uint256 unlockTimestamp;
        bool allowEarlyExit;
        bool withdrawn;
        uint16 maxPenaltyBps;
        address feeReceiver;
        uint256 currentPenaltyBps;
        uint256 timeLeft;
    }

    /// The DiamondHandsFactory this lens reads from. Immutable so callers can
    /// audit the binding once via on-chain config.
    IDiamondHandsFactoryView public immutable factory;

    constructor(IDiamondHandsFactoryView _factory) {
        require(address(_factory) != address(0), "factory zero");
        factory = _factory;
    }

    /// @notice Every vault `user` owns, with live view fields filled in.
    /// @dev    Caller is responsible for any pagination if the user has an
    ///         unreasonably long list — the on-chain factory itself returns
    ///         the full array (see DiamondHandsFactory.getVaultsByOwner).
    function getVaults(address user) external view returns (VaultView[] memory out) {
        address[] memory list = factory.getVaultsByOwner(user);
        out = new VaultView[](list.length);
        for (uint256 i = 0; i < list.length; ++i) {
            out[i] = _viewOf(list[i]);
        }
    }

    /// @notice View one vault by address (e.g. for the detail screen). Pass
    ///         an empty array to skip; this function is the per-vault read.
    function getVault(address vault) external view returns (VaultView memory) {
        return _viewOf(vault);
    }

    function _viewOf(address vault) internal view returns (VaultView memory v) {
        IDiamondHandsVaultView w = IDiamondHandsVaultView(vault);
        v.vault = vault;
        v.owner = w.owner();
        v.asset = w.asset();
        v.amount = w.amount();
        v.lockStartedAt = w.lockStartedAt();
        v.unlockTimestamp = w.unlockTimestamp();
        v.allowEarlyExit = w.allowEarlyExit();
        v.withdrawn = w.withdrawn();
        v.maxPenaltyBps = w.maxPenaltyBps();
        v.feeReceiver = w.feeReceiver();
        v.currentPenaltyBps = w.currentPenaltyBps();
        v.timeLeft = w.timeLeft();
    }
}
