// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

import {DeployMainnet, DeployParams} from "../script/DeployMainnet.s.sol";
import {DiamondHandsVault} from "../src/DiamondHandsVault.sol";
import {DiamondHandsFactory} from "../src/DiamondHandsFactory.sol";

/// Tiny stub that satisfies `code.length > 0` so the deploy script accepts
/// it as a "multisig" (the script doesn't distinguish Safe from any contract).
contract MockMultisig {
    function execute(address target, bytes calldata data) external returns (bytes memory) {
        (bool ok, bytes memory ret) = target.call(data);
        require(ok, "MOCK_MULTISIG: call failed");
        return ret;
    }
}

/// Verifies the mainnet deploy script end-to-end:
/// - validates preconditions (zero / EOA multisig / short timelock);
/// - with timelock: owner = Timelock, pendingOwner = Timelock, multisig
///   schedules+executes a Timelock tx that calls acceptOwnership() on the
///   Factory. After acceptance the multisig can drive setImplementation
///   through the timelock with the required delay.
/// - without timelock: ownership goes straight to the multisig (two-step).
contract DeployMainnetTest is Test {
    DeployMainnet internal deployer;
    MockMultisig internal multisig;
    address internal constant FEE_RECEIVER = address(0xFEE);

    function setUp() public {
        deployer = new DeployMainnet();
        multisig = new MockMultisig();
    }

    function _defaultParams() internal view returns (DeployParams memory) {
        return DeployParams({
            feeReceiver: FEE_RECEIVER,
            ownerMultisig: address(multisig),
            useTimelock: true,
            timelockDelay: 48 hours,
            broadcast: false
        });
    }

    // ---------- preconditions ----------

    function test_Reverts_OnZeroFeeReceiver() public {
        DeployParams memory p = _defaultParams();
        p.feeReceiver = address(0);
        vm.expectRevert(bytes("FEE_RECEIVER is zero"));
        deployer._run(p);
    }

    function test_Reverts_OnZeroMultisig() public {
        DeployParams memory p = _defaultParams();
        p.ownerMultisig = address(0);
        vm.expectRevert(bytes("OWNER_MULTISIG is zero"));
        deployer._run(p);
    }

    function test_Reverts_OnEOAMultisig() public {
        DeployParams memory p = _defaultParams();
        p.ownerMultisig = makeAddr("eoa");
        vm.expectRevert(bytes("OWNER_MULTISIG must be a contract (multisig)"));
        deployer._run(p);
    }

    function test_Reverts_OnShortTimelockDelay() public {
        DeployParams memory p = _defaultParams();
        p.timelockDelay = 1 hours;
        vm.expectRevert(bytes("TIMELOCK_DELAY_SEC < 24h is unsafe"));
        deployer._run(p);
    }

    function test_Reverts_OnShortDelay_OnlyWhenTimelockEnabled() public {
        // Without timelock the delay value is ignored entirely.
        DeployParams memory p = _defaultParams();
        p.useTimelock = false;
        p.timelockDelay = 1 hours;
        deployer._run(p);
    }

    // ---------- direct multisig ownership (no timelock) ----------

    function test_NoTimelock_TransfersOwnershipToMultisigTwoStep() public {
        DeployParams memory p = _defaultParams();
        p.useTimelock = false;
        (, DiamondHandsFactory factory, TimelockController timelock) = deployer._run(p);

        // Owner is still the deployer until acceptance; multisig is pending.
        assertEq(address(timelock), address(0), "no timelock expected");
        assertEq(factory.pendingOwner(), address(multisig), "multisig must be pendingOwner");
        assertTrue(factory.owner() != address(multisig), "multisig must not be owner yet");

        // Multisig accepts → becomes owner.
        multisig.execute(address(factory), abi.encodeWithSignature("acceptOwnership()"));
        assertEq(factory.owner(), address(multisig), "multisig must be owner after accept");
        assertEq(factory.pendingOwner(), address(0), "pendingOwner cleared");
    }

    // ---------- timelock-gated ownership ----------

    function test_WithTimelock_OwnerIsTimelock_AndAcceptanceFlows() public {
        (, DiamondHandsFactory factory, TimelockController timelock) = deployer._run(_defaultParams());

        assertTrue(address(timelock) != address(0), "timelock expected");
        assertEq(factory.pendingOwner(), address(timelock), "timelock must be pendingOwner");

        _scheduleAndExecute(timelock, address(factory), abi.encodeWithSignature("acceptOwnership()"), bytes32(0));

        assertEq(factory.owner(), address(timelock), "timelock must be owner after accept");
    }

    function test_WithTimelock_GovernanceAction_Requires_Delay() public {
        (, DiamondHandsFactory factory, TimelockController timelock) = deployer._run(_defaultParams());
        _scheduleAndExecute(timelock, address(factory), abi.encodeWithSignature("acceptOwnership()"), bytes32(0));
        assertEq(factory.owner(), address(timelock), "setup: timelock owner");

        // Multisig wants to set a NEW implementation — must go through Timelock.
        DiamondHandsVault newImpl = new DiamondHandsVault();
        bytes memory setImpl = abi.encodeWithSignature("setImplementation(address)", address(newImpl));

        // Cannot bypass the timelock: direct call from multisig reverts (not owner).
        vm.expectRevert();
        multisig.execute(address(factory), setImpl);

        // Schedule the operation.
        bytes32 salt = bytes32(uint256(1));
        multisig.execute(
            address(timelock),
            abi.encodeWithSignature(
                "schedule(address,uint256,bytes,bytes32,bytes32,uint256)",
                address(factory),
                0,
                setImpl,
                bytes32(0),
                salt,
                timelock.getMinDelay()
            )
        );

        // Before delay: execute reverts.
        vm.expectRevert();
        multisig.execute(
            address(timelock),
            abi.encodeWithSignature(
                "execute(address,uint256,bytes,bytes32,bytes32)", address(factory), 0, setImpl, bytes32(0), salt
            )
        );

        // After delay: succeeds.
        vm.warp(block.timestamp + timelock.getMinDelay() + 1);
        multisig.execute(
            address(timelock),
            abi.encodeWithSignature(
                "execute(address,uint256,bytes,bytes32,bytes32)", address(factory), 0, setImpl, bytes32(0), salt
            )
        );
        assertEq(factory.implementation(), address(newImpl), "impl updated through timelock");
    }

    // ---------- helpers ----------

    function _scheduleAndExecute(TimelockController tl, address target, bytes memory data, bytes32 salt) internal {
        multisig.execute(
            address(tl),
            abi.encodeWithSignature(
                "schedule(address,uint256,bytes,bytes32,bytes32,uint256)",
                target,
                0,
                data,
                bytes32(0),
                salt,
                tl.getMinDelay()
            )
        );
        vm.warp(block.timestamp + tl.getMinDelay() + 1);
        multisig.execute(
            address(tl),
            abi.encodeWithSignature("execute(address,uint256,bytes,bytes32,bytes32)", target, 0, data, bytes32(0), salt)
        );
    }
}
