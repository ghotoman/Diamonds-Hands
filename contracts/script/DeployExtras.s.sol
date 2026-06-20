// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

import {DiamondHandsLens} from "../src/extras/DiamondHandsLens.sol";
import {DiamondHandsBrag} from "../src/extras/DiamondHandsBrag.sol";
import {DiamondHandsRegistry} from "../src/extras/DiamondHandsRegistry.sol";
import {IDiamondHandsFactoryView} from "../src/extras/IDiamondHandsViews.sol";

/// @title  DeployExtras
/// @notice Deploys the four post-launch extras off the same deployer that
///         shipped the core contracts, so all six show up under one
///         BaseScan / Builder profile:
///           1. DiamondHandsLens     — view aggregator over the live factory
///           2. DiamondHandsBrag     — vault-owner social-event emitter
///           3. DiamondHandsRegistry — self-sovereign profile registry
///           4. TimelockController   — OZ-stock, 48h delay, multisig proposer/
///              executor; sits idle for now and is ready to receive the
///              factory's ownership when governance moves behind it.
///
/// @dev    Env (read at run-time; sensible mainnet defaults baked in):
///           FACTORY            — Diamond Hands factory (default = live mainnet)
///           OWNER_MULTISIG     — Safe; becomes the timelock's proposer/executor
///                                (default = current factory owner)
///           TIMELOCK_DELAY_SEC — default 48h. Minimum allowed: 24h.
///
///         Signer is supplied on the CLI as with the main deploy:
///           --account <name>  --sender 0x51eEE…  (encrypted keystore), or
///           --ledger          --sender 0x51eEE…  (hardware), or
///           --private-key 0x… (not recommended for mainnet).
///
///         Verification: pass `--verify` to forge script; the factory has
///         already proven Etherscan V2 works for this project.
contract DeployExtras is Script {
    address internal constant DEFAULT_FACTORY = 0x89de426deF37Aa34c17f72d6a73229E64dd93e11;
    address internal constant DEFAULT_OWNER_MULTISIG = 0x1Cc4CB5192095E859cFF3fc1C0505Cbe210959De;

    function run()
        external
        returns (
            DiamondHandsLens lens,
            DiamondHandsBrag brag_,
            DiamondHandsRegistry registry,
            TimelockController timelock
        )
    {
        address factory = _envAddressOr("FACTORY", DEFAULT_FACTORY);
        address ownerMultisig = _envAddressOr("OWNER_MULTISIG", DEFAULT_OWNER_MULTISIG);
        uint256 timelockDelay = _envUintOr("TIMELOCK_DELAY_SEC", 48 hours);

        if (factory == address(0)) revert("FACTORY is zero");
        if (factory.code.length == 0) revert("FACTORY has no code on this chain");
        if (ownerMultisig == address(0)) revert("OWNER_MULTISIG is zero");
        if (timelockDelay < 24 hours) revert("TIMELOCK_DELAY_SEC < 24h is unsafe");

        vm.startBroadcast();

        lens = new DiamondHandsLens(IDiamondHandsFactoryView(factory));
        brag_ = new DiamondHandsBrag();
        registry = new DiamondHandsRegistry();

        // TimelockController: proposer + executor = multisig. Admin role
        // assigned to address(0) so the multisig can never bypass the delay.
        // This contract is just provisioned for future governance — until the
        // factory's ownership is transferred to it, it controls nothing.
        address[] memory proposers = new address[](1);
        proposers[0] = ownerMultisig;
        address[] memory executors = new address[](1);
        executors[0] = ownerMultisig;
        timelock = new TimelockController(timelockDelay, proposers, executors, address(0));

        vm.stopBroadcast();

        console.log("Chain ID:           ", block.chainid);
        console.log("Factory (target):   ", factory);
        console.log("Lens:               ", address(lens));
        console.log("Brag:               ", address(brag_));
        console.log("Registry:           ", address(registry));
        console.log("Timelock:           ", address(timelock));
        console.log("Timelock delay (s): ", timelockDelay);
        console.log("Timelock proposer:  ", ownerMultisig);
        console.log("");
        console.log("Suggested 'first-call' txs (one each, all from the deployer):");
        console.log("  lens.getVaults(<your address>)        // view, free");
        console.log("  registry.setProfile(\"ghotoman\", \"https://x.com/ghotoman_x\")");
        console.log("  brag.brag(<your vault>, \"first lock\")  // requires owning a vault");
        console.log("  timelock.getMinDelay()                  // view, free");
    }

    function _envAddressOr(string memory k, address d) internal view returns (address) {
        try vm.envAddress(k) returns (address v) {
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
