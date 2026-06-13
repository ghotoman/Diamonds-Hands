// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

import {DiamondHandsVault} from "../src/DiamondHandsVault.sol";
import {DiamondHandsFactory} from "../src/DiamondHandsFactory.sol";

/// @title  DeployMainnet
/// @notice Mainnet-grade deploy: Vault implementation + Factory + optional
///         TimelockController in front of `setImplementation`. Ownership is
///         transferred to either the Timelock (default) or directly to a
///         multisig — two-step via Ownable2Step, so the receiver MUST call
///         `acceptOwnership()` afterwards.
///
/// @dev    Required env:
///           FEE_RECEIVER         — recipient of soft-mode penalties (snapshotted
///                                  per vault; public address, not secret).
///           OWNER_MULTISIG       — Safe (or other) multisig address. Becomes
///                                  either the final owner directly (no timelock)
///                                  or the timelock's proposer/executor.
///         Optional env:
///           USE_TIMELOCK         — "true" (default) puts a TimelockController
///                                  in front of `setImplementation`; the
///                                  multisig must propose → wait → execute any
///                                  owner action. "false" hands the owner role
///                                  straight to the multisig.
///           TIMELOCK_DELAY_SEC   — default 172800 (48h). Recommended ≥ 24h
///                                  so users can observe and exit before any
///                                  logic change to FUTURE vaults.
///
/// @dev    Signer is supplied on the CLI:
///           --ledger              — hardware wallet (recommended for mainnet);
///           --account <name>      — encrypted keystore (good alternative);
///           --private-key 0x…     — raw key (NOT recommended for mainnet).
///         The deployer address only needs gas — it gives up ownership in the
///         same transaction by calling `transferOwnership`, so any compromise
///         after the deploy has no protocol impact.
struct DeployParams {
    address feeReceiver;
    address ownerMultisig;
    bool useTimelock;
    uint256 timelockDelay;
    bool broadcast;
}

contract DeployMainnet is Script {
    /// CLI entry: reads env, then runs the deploy with `broadcast=true`.
    function run() external returns (DiamondHandsVault impl, DiamondHandsFactory factory, TimelockController timelock) {
        DeployParams memory p = DeployParams({
            feeReceiver: vm.envAddress("FEE_RECEIVER"),
            ownerMultisig: vm.envAddress("OWNER_MULTISIG"),
            useTimelock: _envBoolOr("USE_TIMELOCK", true),
            timelockDelay: _envUintOr("TIMELOCK_DELAY_SEC", 48 hours),
            broadcast: true
        });
        return _run(p);
    }

    /// Internal deploy logic. Tests call this directly with explicit params,
    /// so the env-based wrapper above doesn't race with parallel test
    /// execution (vm.setEnv is process-global).
    function _run(DeployParams memory p)
        public
        returns (DiamondHandsVault impl, DiamondHandsFactory factory, TimelockController timelock)
    {
        if (p.feeReceiver == address(0)) revert("FEE_RECEIVER is zero");
        if (p.ownerMultisig == address(0)) revert("OWNER_MULTISIG is zero");
        if (p.ownerMultisig.code.length == 0) revert("OWNER_MULTISIG must be a contract (multisig)");
        if (p.useTimelock && p.timelockDelay < 24 hours) revert("TIMELOCK_DELAY_SEC < 24h is unsafe");

        if (p.broadcast) vm.startBroadcast();

        // 1) Vault implementation — immutable; clones hardcode this address.
        impl = new DiamondHandsVault();

        // 2) Factory — deployer is the initial owner so it can hand ownership
        //    to the Timelock/multisig within the same broadcast.
        factory = new DiamondHandsFactory(address(impl), p.feeReceiver);

        address finalOwner;
        if (p.useTimelock) {
            // 3a) TimelockController: proposer & executor = multisig (cancellers
            //     same as proposers). Admin role = address(0): no admin, so
            //     even the multisig can't bypass the timelock — only propose
            //     and execute after the delay.
            address[] memory proposers = new address[](1);
            proposers[0] = p.ownerMultisig;
            address[] memory executors = new address[](1);
            executors[0] = p.ownerMultisig;

            timelock = new TimelockController(p.timelockDelay, proposers, executors, address(0));
            finalOwner = address(timelock);
        } else {
            timelock = TimelockController(payable(address(0)));
            finalOwner = p.ownerMultisig;
        }

        // 4) Two-step transfer (Ownable2Step). The receiver must call
        //    `acceptOwnership()` from the multisig (and from the timelock
        //    when useTimelock=true) before they actually become owner.
        factory.transferOwnership(finalOwner);

        if (p.broadcast) vm.stopBroadcast();

        console.log("Chain ID:             ", block.chainid);
        console.log("Vault implementation: ", address(impl));
        console.log("Factory:              ", address(factory));
        console.log("Fee receiver:         ", p.feeReceiver);
        console.log("Current owner:        ", factory.owner());
        console.log("Pending owner:        ", factory.pendingOwner());
        if (p.useTimelock) {
            console.log("Timelock:             ", address(timelock));
            console.log("Timelock delay (sec): ", p.timelockDelay);
            console.log("Multisig (proposer):  ", p.ownerMultisig);
        } else {
            console.log("Multisig (pending owner):", p.ownerMultisig);
        }
        console.log("");
        console.log("NEXT: from the pending owner, call acceptOwnership() on the Factory.");
        if (p.useTimelock) {
            console.log("      (the multisig schedules + executes a tx targeting the Timelock,");
            console.log("       which then calls acceptOwnership() on the Factory).");
        }
    }

    function _envBoolOr(string memory k, bool d) internal view returns (bool) {
        try vm.envBool(k) returns (bool v) {
            return v;
        } catch {
            return d;
        }
    }

    function _envUintOr(string memory k, uint256 d) internal view returns (uint256) {
        try vm.envUint(k) returns (uint256 v) {
            return v;
        } catch {
            return d;
        }
    }
}
