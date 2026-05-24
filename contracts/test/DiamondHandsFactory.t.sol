// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {DiamondHandsFactory} from "../src/DiamondHandsFactory.sol";
import {DiamondHandsVault} from "../src/DiamondHandsVault.sol";
import {Errors} from "../src/errors/Errors.sol";

import {MockERC20} from "./mocks/MockERC20.sol";
import {MockFeeOnTransferERC20} from "./mocks/MockFeeOnTransferERC20.sol";

contract DiamondHandsFactoryTest is Test {
    DiamondHandsVault internal impl;
    DiamondHandsFactory internal factory;
    MockERC20 internal token;

    address internal immutable DEPLOYER = address(this); // factory owner
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant FEE_RECEIVER = address(0xFEE);
    address internal constant ALT_FEE = address(0xFEE2);

    uint256 internal constant INITIAL_BALANCE = 1_000_000 ether;
    uint256 internal constant DEFAULT_AMOUNT = 100 ether;
    uint256 internal constant DEFAULT_LOCK = 30 days;

    // Re-declare events for vm.expectEmit
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
    event ImplementationUpdated(
        address indexed oldImpl,
        address indexed newImpl
    );
    event FeeReceiverUpdated(
        address indexed oldReceiver,
        address indexed newReceiver
    );

    function setUp() public {
        vm.warp(1_700_000_000);

        token = new MockERC20("Test Token", "TST");
        impl = new DiamondHandsVault();
        factory = new DiamondHandsFactory(address(impl), FEE_RECEIVER);

        token.mint(ALICE, INITIAL_BALANCE);
        token.mint(BOB, INITIAL_BALANCE);

        vm.prank(ALICE);
        token.approve(address(factory), type(uint256).max);
        vm.prank(BOB);
        token.approve(address(factory), type(uint256).max);
    }

    function _createSoftVault(uint256 amount, uint256 lockSeconds, uint16 bps)
        internal
        returns (address)
    {
        vm.prank(ALICE);
        return factory.createVault(
            address(token),
            amount,
            block.timestamp + lockSeconds,
            true,
            bps
        );
    }

    // =================================================================
    //                          CONSTRUCTOR
    // =================================================================

    function test_Constructor_RevertsOnZeroImpl() public {
        vm.expectRevert(Errors.ZeroAddress.selector);
        new DiamondHandsFactory(address(0), FEE_RECEIVER);
    }

    function test_Constructor_RevertsOnImplWithoutCode() public {
        // EOA-like address: no code at this address
        vm.expectRevert(Errors.ImplementationCodeMissing.selector);
        new DiamondHandsFactory(address(0xDEAD), FEE_RECEIVER);
    }

    function test_Constructor_RevertsOnZeroFeeReceiver() public {
        vm.expectRevert(Errors.ZeroAddress.selector);
        new DiamondHandsFactory(address(impl), address(0));
    }

    function test_Constructor_SetsState() public view {
        assertEq(factory.implementation(), address(impl));
        assertEq(factory.feeReceiver(), FEE_RECEIVER);
        assertEq(factory.vaultCount(), 0);
        assertEq(factory.owner(), DEPLOYER);
    }

    function test_Constructor_EmitsEvents() public {
        // Deploy a fresh factory and check both events are emitted.
        DiamondHandsVault newImpl = new DiamondHandsVault();
        vm.expectEmit(true, true, false, false);
        emit ImplementationUpdated(address(0), address(newImpl));
        vm.expectEmit(true, true, false, false);
        emit FeeReceiverUpdated(address(0), FEE_RECEIVER);
        new DiamondHandsFactory(address(newImpl), FEE_RECEIVER);
    }

    // =================================================================
    //                  CREATE VAULT — HAPPY PATH
    // =================================================================

    function test_CreateVault_SoftMode_DeploysClone() public {
        address vault = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        assertTrue(vault != address(0));
        assertTrue(vault.code.length > 0);
        assertTrue(DiamondHandsVault(vault).allowEarlyExit());
    }

    function test_CreateVault_HardMode_DeploysClone() public {
        vm.prank(ALICE);
        address vault = factory.createVault(
            address(token),
            DEFAULT_AMOUNT,
            block.timestamp + DEFAULT_LOCK,
            false,
            0
        );
        assertTrue(vault != address(0));
        assertFalse(DiamondHandsVault(vault).allowEarlyExit());
        assertEq(DiamondHandsVault(vault).maxPenaltyBps(), 0);
    }

    function test_CreateVault_TransfersTokensToClone() public {
        uint256 aliceBefore = token.balanceOf(ALICE);
        address vault = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        assertEq(token.balanceOf(vault), DEFAULT_AMOUNT);
        assertEq(token.balanceOf(ALICE), aliceBefore - DEFAULT_AMOUNT);
    }

    function test_CreateVault_InitializesCloneCorrectly() public {
        uint256 unlockTs = block.timestamp + DEFAULT_LOCK;
        vm.prank(ALICE);
        address vault = factory.createVault(
            address(token),
            DEFAULT_AMOUNT,
            unlockTs,
            true,
            2500
        );
        DiamondHandsVault v = DiamondHandsVault(vault);
        assertEq(v.owner(), ALICE);
        assertEq(v.asset(), address(token));
        assertEq(v.amount(), DEFAULT_AMOUNT);
        assertEq(v.unlockTimestamp(), unlockTs);
        assertTrue(v.allowEarlyExit());
        assertEq(v.maxPenaltyBps(), 2500);
        assertEq(v.feeReceiver(), FEE_RECEIVER);
        assertFalse(v.withdrawn());
        assertEq(v.createdAt(), block.timestamp);
        assertEq(v.lockStartedAt(), block.timestamp);
    }

    function test_CreateVault_IncrementsCounter() public {
        assertEq(factory.vaultCount(), 0);
        _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        assertEq(factory.vaultCount(), 1);
        _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        assertEq(factory.vaultCount(), 2);
    }

    function test_CreateVault_PushesToMapping() public {
        address v1 = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        address v2 = _createSoftVault(50 ether, DEFAULT_LOCK, 2000);
        address[] memory list = factory.getVaultsByOwner(ALICE);
        assertEq(list.length, 2);
        assertEq(list[0], v1);
        assertEq(list[1], v2);
    }

    function test_CreateVault_EmitsEventWithAllFields() public {
        uint256 unlockTs = block.timestamp + DEFAULT_LOCK;
        // We can't predict the clone address before the call without
        // simulating Clones.cloneDeterministic. We check the non-vault
        // fields using `false` checkData and let the vault field
        // be present without strict address match.
        vm.recordLogs();
        vm.prank(ALICE);
        address vault = factory.createVault(
            address(token),
            DEFAULT_AMOUNT,
            unlockTs,
            true,
            2000
        );
        // Now we have the actual vault address — assert event payload manually
        // via decoded logs.
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool found = false;
        bytes32 sig = keccak256(
            "VaultCreated(address,address,address,uint256,uint256,bool,address,uint16)"
        );
        for (uint256 i = 0; i < logs.length; i++) {
            if (
                logs[i].emitter == address(factory) &&
                logs[i].topics[0] == sig &&
                address(uint160(uint256(logs[i].topics[1]))) == ALICE &&
                address(uint160(uint256(logs[i].topics[2]))) == vault &&
                address(uint160(uint256(logs[i].topics[3]))) == address(token)
            ) {
                (
                    uint256 amt,
                    uint256 unlock,
                    bool early,
                    address fr,
                    uint16 bps
                ) = abi.decode(logs[i].data, (uint256, uint256, bool, address, uint16));
                assertEq(amt, DEFAULT_AMOUNT);
                assertEq(unlock, unlockTs);
                assertTrue(early);
                assertEq(fr, FEE_RECEIVER);
                assertEq(bps, 2000);
                found = true;
                break;
            }
        }
        assertTrue(found, "VaultCreated event not found");
    }

    function test_CreateVault_HandlesFeeOnTransferToken() public {
        MockFeeOnTransferERC20 fot = new MockFeeOnTransferERC20(500); // 5%
        fot.mint(ALICE, INITIAL_BALANCE);
        vm.prank(ALICE);
        fot.approve(address(factory), type(uint256).max);

        vm.prank(ALICE);
        address vault = factory.createVault(
            address(fot),
            DEFAULT_AMOUNT,
            block.timestamp + DEFAULT_LOCK,
            true,
            2000
        );
        uint256 expected = (DEFAULT_AMOUNT * 9500) / 10000;
        // vault stored actualAmount = expected, not DEFAULT_AMOUNT
        assertEq(DiamondHandsVault(vault).amount(), expected);
        assertEq(fot.balanceOf(vault), expected);
    }

    function test_CreateVault_MultipleVaultsSameOwner() public {
        address v1 = _createSoftVault(10 ether, DEFAULT_LOCK, 1000);
        address v2 = _createSoftVault(20 ether, DEFAULT_LOCK, 2000);
        address v3 = _createSoftVault(30 ether, DEFAULT_LOCK, 3000);
        assertTrue(v1 != v2);
        assertTrue(v2 != v3);
        assertTrue(v1 != v3);
        address[] memory list = factory.getVaultsByOwner(ALICE);
        assertEq(list.length, 3);
    }

    // =================================================================
    //                  CREATE VAULT — REVERTS
    // =================================================================

    function test_CreateVault_RevertsOnZeroAsset() public {
        vm.expectRevert(Errors.EthNotSupported.selector);
        vm.prank(ALICE);
        factory.createVault(
            address(0),
            DEFAULT_AMOUNT,
            block.timestamp + DEFAULT_LOCK,
            true,
            2000
        );
    }

    function test_CreateVault_RevertsOnAssetWithoutCode() public {
        vm.expectRevert(Errors.InvalidAsset.selector);
        vm.prank(ALICE);
        factory.createVault(
            address(0xDEAD),
            DEFAULT_AMOUNT,
            block.timestamp + DEFAULT_LOCK,
            true,
            2000
        );
    }

    function test_CreateVault_RevertsOnZeroAmount() public {
        vm.expectRevert(Errors.AmountZero.selector);
        vm.prank(ALICE);
        factory.createVault(
            address(token),
            0,
            block.timestamp + DEFAULT_LOCK,
            true,
            2000
        );
    }

    function test_CreateVault_RevertsOnUnlockTooSoon() public {
        // less than MIN_LOCK_DURATION = 7 days
        vm.expectRevert();
        vm.prank(ALICE);
        factory.createVault(
            address(token),
            DEFAULT_AMOUNT,
            block.timestamp + 6 days,
            true,
            2000
        );
    }

    function test_CreateVault_RevertsOnUnlockTooFar() public {
        vm.expectRevert();
        vm.prank(ALICE);
        factory.createVault(
            address(token),
            DEFAULT_AMOUNT,
            block.timestamp + 1826 days, // > 1825
            true,
            2000
        );
    }

    function test_CreateVault_RevertsOnUnlockInPast() public {
        vm.expectRevert();
        vm.prank(ALICE);
        factory.createVault(
            address(token),
            DEFAULT_AMOUNT,
            block.timestamp - 1,
            true,
            2000
        );
    }

    function test_CreateVault_SoftMode_RevertsOnPenaltyTooLow() public {
        vm.expectRevert();
        vm.prank(ALICE);
        factory.createVault(
            address(token),
            DEFAULT_AMOUNT,
            block.timestamp + DEFAULT_LOCK,
            true,
            499 // < MIN_USER_PENALTY_BPS = 500
        );
    }

    function test_CreateVault_SoftMode_RevertsOnPenaltyTooHigh() public {
        vm.expectRevert();
        vm.prank(ALICE);
        factory.createVault(
            address(token),
            DEFAULT_AMOUNT,
            block.timestamp + DEFAULT_LOCK,
            true,
            3001 // > ABS_MAX_PENALTY_BPS = 3000
        );
    }

    function test_CreateVault_HardMode_RevertsOnNonZeroPenalty() public {
        vm.expectRevert(Errors.InvalidPenaltyForHardMode.selector);
        vm.prank(ALICE);
        factory.createVault(
            address(token),
            DEFAULT_AMOUNT,
            block.timestamp + DEFAULT_LOCK,
            false,
            500
        );
    }

    function test_CreateVault_RevertsWhenPaused() public {
        factory.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(ALICE);
        factory.createVault(
            address(token),
            DEFAULT_AMOUNT,
            block.timestamp + DEFAULT_LOCK,
            true,
            2000
        );
    }

    function test_CreateVault_RevertsOnZeroActualReceived() public {
        MockFeeOnTransferERC20 fot = new MockFeeOnTransferERC20(10000); // 100% fee
        fot.mint(ALICE, INITIAL_BALANCE);
        vm.prank(ALICE);
        fot.approve(address(factory), type(uint256).max);

        vm.expectRevert(Errors.TransferReceivedZero.selector);
        vm.prank(ALICE);
        factory.createVault(
            address(fot),
            DEFAULT_AMOUNT,
            block.timestamp + DEFAULT_LOCK,
            true,
            2000
        );
    }

    function test_CreateVault_RevertsWithoutApproval() public {
        // BOB has tokens but did not approve factory for this vault scenario:
        // we revoke approval first.
        vm.prank(BOB);
        token.approve(address(factory), 0);

        vm.expectRevert(); // ERC20InsufficientAllowance from OZ
        vm.prank(BOB);
        factory.createVault(
            address(token),
            DEFAULT_AMOUNT,
            block.timestamp + DEFAULT_LOCK,
            true,
            2000
        );
    }

    // =================================================================
    //                      SET IMPLEMENTATION
    // =================================================================

    function test_SetImplementation_Updates() public {
        DiamondHandsVault newImpl = new DiamondHandsVault();
        factory.setImplementation(address(newImpl));
        assertEq(factory.implementation(), address(newImpl));
    }

    function test_SetImplementation_OnlyOwner() public {
        DiamondHandsVault newImpl = new DiamondHandsVault();
        vm.expectRevert(
            abi.encodeWithSelector(
                Ownable.OwnableUnauthorizedAccount.selector,
                ALICE
            )
        );
        vm.prank(ALICE);
        factory.setImplementation(address(newImpl));
    }

    function test_SetImplementation_RevertsOnZero() public {
        vm.expectRevert(Errors.ZeroAddress.selector);
        factory.setImplementation(address(0));
    }

    function test_SetImplementation_RevertsOnNoCode() public {
        vm.expectRevert(Errors.ImplementationCodeMissing.selector);
        factory.setImplementation(address(0xDEAD));
    }

    function test_SetImplementation_RevertsOnSame() public {
        vm.expectRevert(Errors.SameImplementation.selector);
        factory.setImplementation(address(impl));
    }

    function test_SetImplementation_DoesNotAffectExistingClones() public {
        address vault1 = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        DiamondHandsVault newImpl = new DiamondHandsVault();
        factory.setImplementation(address(newImpl));
        // Existing vault still functional with original code (its bytecode
        // hardcodes the original impl address). We just verify it still
        // reports same owner/asset/etc. after impl swap.
        DiamondHandsVault v = DiamondHandsVault(vault1);
        assertEq(v.owner(), ALICE);
        assertEq(v.asset(), address(token));
        assertEq(v.amount(), DEFAULT_AMOUNT);
    }

    // =================================================================
    //                       SET FEE RECEIVER
    // =================================================================

    function test_SetFeeReceiver_Updates() public {
        factory.setFeeReceiver(ALT_FEE);
        assertEq(factory.feeReceiver(), ALT_FEE);
    }

    function test_SetFeeReceiver_OnlyOwner() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                Ownable.OwnableUnauthorizedAccount.selector,
                ALICE
            )
        );
        vm.prank(ALICE);
        factory.setFeeReceiver(ALT_FEE);
    }

    function test_SetFeeReceiver_RevertsOnZero() public {
        vm.expectRevert(Errors.ZeroAddress.selector);
        factory.setFeeReceiver(address(0));
    }

    function test_SetFeeReceiver_DoesNotAffectExistingClones() public {
        address vault1 = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        factory.setFeeReceiver(ALT_FEE);
        // Existing vault must keep its original feeReceiver snapshot.
        assertEq(DiamondHandsVault(vault1).feeReceiver(), FEE_RECEIVER);
        // New vault gets the new feeReceiver.
        address vault2 = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        assertEq(DiamondHandsVault(vault2).feeReceiver(), ALT_FEE);
    }

    // =================================================================
    //                         PAUSE / UNPAUSE
    // =================================================================

    function test_Pause_OnlyOwner() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                Ownable.OwnableUnauthorizedAccount.selector,
                ALICE
            )
        );
        vm.prank(ALICE);
        factory.pause();
    }

    function test_Unpause_OnlyOwner() public {
        factory.pause();
        vm.expectRevert(
            abi.encodeWithSelector(
                Ownable.OwnableUnauthorizedAccount.selector,
                ALICE
            )
        );
        vm.prank(ALICE);
        factory.unpause();
    }

    function test_Pause_BlocksCreateVault() public {
        factory.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(ALICE);
        factory.createVault(
            address(token),
            DEFAULT_AMOUNT,
            block.timestamp + DEFAULT_LOCK,
            true,
            2000
        );
    }

    function test_Pause_DoesNotBlockExistingVaults() public {
        address vault = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        factory.pause();
        // existing vault should still work — emergency withdraw works
        vm.warp(block.timestamp + 1 days);
        vm.prank(ALICE);
        DiamondHandsVault(vault).emergencyWithdraw();
        assertTrue(DiamondHandsVault(vault).withdrawn());
    }

    // =================================================================
    //                    RENOUNCE OWNERSHIP (BLOCKED)
    // =================================================================

    function test_RenounceOwnership_AlwaysReverts() public {
        // Even owner cannot renounce.
        vm.expectRevert(Errors.RenounceOwnershipDisabled.selector);
        factory.renounceOwnership();
    }

    // =================================================================
    //                       GET VAULTS BY OWNER
    // =================================================================

    function test_GetVaultsByOwner_EmptyForNew() public view {
        address[] memory list = factory.getVaultsByOwner(BOB);
        assertEq(list.length, 0);
    }

    function test_GetVaultsByOwner_ReturnsAll() public {
        address v1 = _createSoftVault(10 ether, DEFAULT_LOCK, 1000);
        address v2 = _createSoftVault(20 ether, DEFAULT_LOCK, 2000);
        address v3 = _createSoftVault(30 ether, DEFAULT_LOCK, 3000);
        address[] memory list = factory.getVaultsByOwner(ALICE);
        assertEq(list.length, 3);
        assertEq(list[0], v1);
        assertEq(list[1], v2);
        assertEq(list[2], v3);
    }
}
