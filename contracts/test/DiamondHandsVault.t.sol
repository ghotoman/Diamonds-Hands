// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import {DiamondHandsFactory} from "../src/DiamondHandsFactory.sol";
import {DiamondHandsVault} from "../src/DiamondHandsVault.sol";
import {Errors} from "../src/errors/Errors.sol";

import {MockERC20} from "./mocks/MockERC20.sol";
import {MockFeeOnTransferERC20} from "./mocks/MockFeeOnTransferERC20.sol";
import {MockRevertOnZeroTransferERC20} from "./mocks/MockRevertOnZeroTransferERC20.sol";
import {MockReentrantToken} from "./mocks/MockReentrantToken.sol";

contract DiamondHandsVaultTest is Test {
    DiamondHandsVault internal impl;
    DiamondHandsFactory internal factory;
    MockERC20 internal token;

    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant FEE_RECEIVER = address(0xFEE);

    uint256 internal constant INITIAL_BALANCE = 1_000_000 ether;
    uint256 internal constant DEFAULT_AMOUNT = 100 ether;
    uint256 internal constant DEFAULT_LOCK = 30 days;

    // Re-declare events to use with vm.expectEmit
    event Withdrawn(address indexed owner, uint256 amount);
    event EmergencyWithdrawn(address indexed owner, uint256 amountToOwner, uint256 penaltyAmount);
    event ToppedUp(address indexed owner, uint256 addedAmount, uint256 newTotalAmount);
    event LockExtended(uint256 oldUnlockTimestamp, uint256 newUnlockTimestamp);
    event CheckedIn(address indexed owner, uint256 timestamp);

    function setUp() public {
        // start at a non-zero timestamp so we can warp backward in checks
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

    // -----------------------------------------------------------------
    //                            HELPERS
    // -----------------------------------------------------------------

    function _createSoftVault(uint256 amount, uint256 lockSeconds, uint16 bps) internal returns (DiamondHandsVault) {
        vm.prank(ALICE);
        address v = factory.createVault(address(token), amount, block.timestamp + lockSeconds, true, bps);
        // ALICE pre-approves vault for topUp scenarios
        vm.prank(ALICE);
        token.approve(v, type(uint256).max);
        return DiamondHandsVault(v);
    }

    function _createHardVault(uint256 amount, uint256 lockSeconds) internal returns (DiamondHandsVault) {
        vm.prank(ALICE);
        address v = factory.createVault(address(token), amount, block.timestamp + lockSeconds, false, 0);
        vm.prank(ALICE);
        token.approve(v, type(uint256).max);
        return DiamondHandsVault(v);
    }

    function _createSoftVaultWithToken(address tokenAddr, uint256 amount, uint256 lockSeconds, uint16 bps)
        internal
        returns (DiamondHandsVault)
    {
        vm.prank(ALICE);
        MockERC20(tokenAddr).approve(address(factory), type(uint256).max);
        vm.prank(ALICE);
        address v = factory.createVault(tokenAddr, amount, block.timestamp + lockSeconds, true, bps);
        vm.prank(ALICE);
        MockERC20(tokenAddr).approve(v, type(uint256).max);
        return DiamondHandsVault(v);
    }

    // =================================================================
    //                CONSTRUCTOR + INITIALIZE
    // =================================================================

    function test_Constructor_DisablesInitializers_OnImplementation() public {
        // Cannot initialize the implementation directly — initializers
        // are disabled in the constructor of the impl.
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        impl.initialize(ALICE, address(token), DEFAULT_AMOUNT, block.timestamp + DEFAULT_LOCK, true, FEE_RECEIVER, 2000);
    }

    function test_Initialize_OnClone_Works() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        assertEq(v.owner(), ALICE);
        assertEq(v.asset(), address(token));
        assertEq(v.amount(), DEFAULT_AMOUNT);
        assertEq(v.unlockTimestamp(), block.timestamp + DEFAULT_LOCK);
        assertEq(v.feeReceiver(), FEE_RECEIVER);
        assertEq(v.maxPenaltyBps(), 2000);
        assertTrue(v.allowEarlyExit());
        assertFalse(v.withdrawn());
        assertEq(v.createdAt(), block.timestamp);
        assertEq(v.lockStartedAt(), block.timestamp);
    }

    function test_Initialize_RevertsOnSecondCall() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        v.initialize(ALICE, address(token), DEFAULT_AMOUNT, block.timestamp + DEFAULT_LOCK, true, FEE_RECEIVER, 2000);
    }

    function test_Initialize_DirectOnImplementation_Reverts() public {
        // same as _DisablesInitializers but using explicit assertion of
        // the design intent
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        impl.initialize(ALICE, address(token), DEFAULT_AMOUNT, block.timestamp + DEFAULT_LOCK, true, FEE_RECEIVER, 2000);
    }

    function test_Initialize_RevertsOnZeroOwner() public {
        address cloneAddr = Clones.clone(address(impl));
        DiamondHandsVault clone = DiamondHandsVault(cloneAddr);
        vm.expectRevert(Errors.ZeroAddress.selector);
        clone.initialize(
            address(0), address(token), DEFAULT_AMOUNT, block.timestamp + DEFAULT_LOCK, true, FEE_RECEIVER, 2000
        );
    }

    function test_Initialize_RevertsOnZeroAsset() public {
        address cloneAddr = Clones.clone(address(impl));
        DiamondHandsVault clone = DiamondHandsVault(cloneAddr);
        vm.expectRevert(Errors.InvalidAsset.selector);
        clone.initialize(ALICE, address(0), DEFAULT_AMOUNT, block.timestamp + DEFAULT_LOCK, true, FEE_RECEIVER, 2000);
    }

    function test_Initialize_RevertsOnZeroAmount() public {
        address cloneAddr = Clones.clone(address(impl));
        DiamondHandsVault clone = DiamondHandsVault(cloneAddr);
        vm.expectRevert(Errors.AmountZero.selector);
        clone.initialize(ALICE, address(token), 0, block.timestamp + DEFAULT_LOCK, true, FEE_RECEIVER, 2000);
    }

    function test_Initialize_RevertsOnPastUnlock() public {
        address cloneAddr = Clones.clone(address(impl));
        DiamondHandsVault clone = DiamondHandsVault(cloneAddr);
        vm.expectRevert(Errors.InvalidUnlockTimestamp.selector);
        clone.initialize(
            ALICE,
            address(token),
            DEFAULT_AMOUNT,
            block.timestamp, // not strictly greater than now
            true,
            FEE_RECEIVER,
            2000
        );
    }

    function test_Initialize_RevertsOnZeroFeeReceiver() public {
        address cloneAddr = Clones.clone(address(impl));
        DiamondHandsVault clone = DiamondHandsVault(cloneAddr);
        vm.expectRevert(Errors.ZeroAddress.selector);
        clone.initialize(ALICE, address(token), DEFAULT_AMOUNT, block.timestamp + DEFAULT_LOCK, true, address(0), 2000);
    }

    function test_Initialize_RevertsOnSoftWithZeroPenalty() public {
        address cloneAddr = Clones.clone(address(impl));
        DiamondHandsVault clone = DiamondHandsVault(cloneAddr);
        vm.expectRevert(Errors.MaxPenaltyMismatch.selector);
        clone.initialize(
            ALICE,
            address(token),
            DEFAULT_AMOUNT,
            block.timestamp + DEFAULT_LOCK,
            true, // soft
            FEE_RECEIVER,
            0 // must be != 0 for soft
        );
    }

    function test_Initialize_RevertsOnHardWithNonZeroPenalty() public {
        address cloneAddr = Clones.clone(address(impl));
        DiamondHandsVault clone = DiamondHandsVault(cloneAddr);
        vm.expectRevert(Errors.MaxPenaltyMismatch.selector);
        clone.initialize(
            ALICE,
            address(token),
            DEFAULT_AMOUNT,
            block.timestamp + DEFAULT_LOCK,
            false, // hard
            FEE_RECEIVER,
            1000 // must be 0 for hard
        );
    }

    // =================================================================
    //                          WITHDRAW
    // =================================================================

    function test_Withdraw_HappyPath() public {
        DiamondHandsVault v = _createHardVault(DEFAULT_AMOUNT, DEFAULT_LOCK);
        uint256 balBefore = token.balanceOf(ALICE);
        vm.warp(block.timestamp + DEFAULT_LOCK);
        vm.prank(ALICE);
        v.withdraw();
        uint256 balAfter = token.balanceOf(ALICE);
        assertEq(balAfter - balBefore, DEFAULT_AMOUNT);
    }

    function test_Withdraw_TransfersFullAmount() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        vm.warp(block.timestamp + DEFAULT_LOCK);
        assertEq(token.balanceOf(address(v)), DEFAULT_AMOUNT);
        vm.prank(ALICE);
        v.withdraw();
        assertEq(token.balanceOf(address(v)), 0);
    }

    function test_Withdraw_SetsWithdrawnFlag() public {
        DiamondHandsVault v = _createHardVault(DEFAULT_AMOUNT, DEFAULT_LOCK);
        vm.warp(block.timestamp + DEFAULT_LOCK);
        vm.prank(ALICE);
        v.withdraw();
        assertTrue(v.withdrawn());
    }

    function test_Withdraw_ZerosAmount() public {
        DiamondHandsVault v = _createHardVault(DEFAULT_AMOUNT, DEFAULT_LOCK);
        vm.warp(block.timestamp + DEFAULT_LOCK);
        vm.prank(ALICE);
        v.withdraw();
        assertEq(v.amount(), 0);
    }

    function test_Withdraw_EmitsEvent() public {
        DiamondHandsVault v = _createHardVault(DEFAULT_AMOUNT, DEFAULT_LOCK);
        vm.warp(block.timestamp + DEFAULT_LOCK);
        vm.expectEmit(true, false, false, true, address(v));
        emit Withdrawn(ALICE, DEFAULT_AMOUNT);
        vm.prank(ALICE);
        v.withdraw();
    }

    function test_Withdraw_RevertsBeforeUnlock() public {
        DiamondHandsVault v = _createHardVault(DEFAULT_AMOUNT, DEFAULT_LOCK);
        vm.expectRevert(Errors.NotWithdrawable.selector);
        vm.prank(ALICE);
        v.withdraw();
    }

    function test_Withdraw_RevertsIfNotOwner() public {
        DiamondHandsVault v = _createHardVault(DEFAULT_AMOUNT, DEFAULT_LOCK);
        vm.warp(block.timestamp + DEFAULT_LOCK);
        vm.expectRevert(Errors.NotOwner.selector);
        vm.prank(BOB);
        v.withdraw();
    }

    function test_Withdraw_RevertsIfAlreadyWithdrawn() public {
        DiamondHandsVault v = _createHardVault(DEFAULT_AMOUNT, DEFAULT_LOCK);
        vm.warp(block.timestamp + DEFAULT_LOCK);
        vm.prank(ALICE);
        v.withdraw();
        vm.expectRevert(Errors.AlreadyWithdrawn.selector);
        vm.prank(ALICE);
        v.withdraw();
    }

    function test_Withdraw_WorksWithFeeOnTransferToken() public {
        MockFeeOnTransferERC20 fot = new MockFeeOnTransferERC20(500); // 5%
        fot.mint(ALICE, INITIAL_BALANCE);

        DiamondHandsVault v = _createSoftVaultWithToken(address(fot), DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        // initial deposit: 5% fee taken → vault получил 95
        uint256 expectedDeposit = (DEFAULT_AMOUNT * 9500) / 10000;
        assertEq(v.amount(), expectedDeposit);

        vm.warp(block.timestamp + DEFAULT_LOCK);
        uint256 balBefore = fot.balanceOf(ALICE);
        vm.prank(ALICE);
        v.withdraw();
        // на выходе токен снова возьмёт 5% fee
        uint256 expectedReceived = (expectedDeposit * 9500) / 10000;
        assertEq(fot.balanceOf(ALICE) - balBefore, expectedReceived);
    }

    // =================================================================
    //                     EMERGENCY WITHDRAW
    // =================================================================

    function test_EmergencyWithdraw_HardMode_Reverts() public {
        DiamondHandsVault v = _createHardVault(DEFAULT_AMOUNT, DEFAULT_LOCK);
        vm.expectRevert(Errors.HardLockNoExit.selector);
        vm.prank(ALICE);
        v.emergencyWithdraw();
    }

    function test_EmergencyWithdraw_AfterUnlock_Reverts() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        vm.warp(block.timestamp + DEFAULT_LOCK);
        vm.expectRevert(Errors.UseWithdrawInstead.selector);
        vm.prank(ALICE);
        v.emergencyWithdraw();
    }

    function test_EmergencyWithdraw_BeforeUnlock_HappyPath() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        // move to midpoint
        vm.warp(block.timestamp + DEFAULT_LOCK / 2);
        uint256 expectedPenalty = (DEFAULT_AMOUNT * 1000) / 10000; // 10%
        uint256 expectedPayout = DEFAULT_AMOUNT - expectedPenalty;

        uint256 aliceBefore = token.balanceOf(ALICE);
        uint256 feeBefore = token.balanceOf(FEE_RECEIVER);

        vm.prank(ALICE);
        v.emergencyWithdraw();

        assertEq(token.balanceOf(ALICE) - aliceBefore, expectedPayout);
        assertEq(token.balanceOf(FEE_RECEIVER) - feeBefore, expectedPenalty);
        assertTrue(v.withdrawn());
        assertEq(v.amount(), 0);
    }

    function test_EmergencyWithdraw_PenaltyAtMax_AtLockStart() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 3000);
        // immediately after creation: penalty == maxPenaltyBps
        assertEq(v.currentPenaltyBps(), 3000);
    }

    function test_EmergencyWithdraw_PenaltyAtZero_NearUnlock() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        // 1 second before unlock; penaltyBps ~ 2000 * 1 / lockSeconds ≈ 0
        vm.warp(block.timestamp + DEFAULT_LOCK - 1);
        // 2000 * 1 / (30 days) = 2000 / 2592000 < 1 → integer div = 0
        assertEq(v.currentPenaltyBps(), 0);
    }

    function test_EmergencyWithdraw_PenaltyLinearlyDecreases() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        // at t = 0: 2000
        assertEq(v.currentPenaltyBps(), 2000);
        // at t = lock/4: 1500
        vm.warp(block.timestamp + DEFAULT_LOCK / 4);
        assertEq(v.currentPenaltyBps(), 1500);
        // at t = lock/2: 1000
        vm.warp(block.timestamp + DEFAULT_LOCK / 4);
        assertEq(v.currentPenaltyBps(), 1000);
        // at t = 3*lock/4: 500
        vm.warp(block.timestamp + DEFAULT_LOCK / 4);
        assertEq(v.currentPenaltyBps(), 500);
    }

    function test_EmergencyWithdraw_SkipsTransferOnZeroPenalty() public {
        // Token that reverts on transfer of 0; we must NOT attempt to
        // send zero-penalty to feeReceiver, otherwise emergencyWithdraw
        // would revert.
        MockRevertOnZeroTransferERC20 zToken = new MockRevertOnZeroTransferERC20();
        zToken.mint(ALICE, INITIAL_BALANCE);
        vm.prank(ALICE);
        zToken.approve(address(factory), type(uint256).max);

        // amount = 1 wei → penaltyAmount = 1 * bps / 10000; for bps < 10000 → 0
        vm.prank(ALICE);
        address vAddr = factory.createVault(
            address(zToken),
            1, // 1 wei
            block.timestamp + DEFAULT_LOCK,
            true,
            2000
        );
        DiamondHandsVault v = DiamondHandsVault(vAddr);

        // currentPenaltyAmount = 1 * 2000 / 10000 = 0
        assertEq(v.currentPenaltyAmount(), 0);

        uint256 aliceBefore = zToken.balanceOf(ALICE);
        vm.prank(ALICE);
        v.emergencyWithdraw(); // должно пройти — fee transfer пропущен

        assertEq(zToken.balanceOf(ALICE) - aliceBefore, 1);
        assertTrue(v.withdrawn());
    }

    function test_EmergencyWithdraw_RevertsIfNotOwner() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        vm.expectRevert(Errors.NotOwner.selector);
        vm.prank(BOB);
        v.emergencyWithdraw();
    }

    function test_EmergencyWithdraw_RevertsIfAlreadyWithdrawn() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        vm.warp(block.timestamp + 1 days);
        vm.prank(ALICE);
        v.emergencyWithdraw();
        vm.expectRevert(Errors.AlreadyWithdrawn.selector);
        vm.prank(ALICE);
        v.emergencyWithdraw();
    }

    function test_EmergencyWithdraw_EmitsEvent() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        vm.warp(block.timestamp + DEFAULT_LOCK / 2);
        uint256 expectedPenalty = (DEFAULT_AMOUNT * 1000) / 10000;
        uint256 expectedPayout = DEFAULT_AMOUNT - expectedPenalty;
        vm.expectEmit(true, false, false, true, address(v));
        emit EmergencyWithdrawn(ALICE, expectedPayout, expectedPenalty);
        vm.prank(ALICE);
        v.emergencyWithdraw();
    }

    // =================================================================
    //                            TOP UP
    // =================================================================

    function test_TopUp_HappyPath_IncreasesAmount() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        uint256 addAmount = 50 ether;
        vm.prank(ALICE);
        v.topUp(addAmount);
        assertEq(v.amount(), DEFAULT_AMOUNT + addAmount);
    }

    function test_TopUp_RevertsIfNotOwner() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        vm.prank(BOB);
        token.approve(address(v), type(uint256).max);
        vm.expectRevert(Errors.NotOwner.selector);
        vm.prank(BOB);
        v.topUp(10 ether);
    }

    function test_TopUp_RevertsAfterUnlock() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        vm.warp(block.timestamp + DEFAULT_LOCK);
        vm.expectRevert(Errors.TopUpAfterUnlock.selector);
        vm.prank(ALICE);
        v.topUp(10 ether);
    }

    function test_TopUp_RevertsAfterWithdrawn() public {
        DiamondHandsVault v = _createHardVault(DEFAULT_AMOUNT, DEFAULT_LOCK);
        vm.warp(block.timestamp + DEFAULT_LOCK);
        vm.prank(ALICE);
        v.withdraw();
        // now < unlock would be false, so reaching topUpAfterUnlock first;
        // we want AlreadyWithdrawn — that requires warping back, but
        // can't. Instead, create a vault, but withdraw after unlock —
        // топап после unlock и так упадёт. Тестируем сценарий:
        // создаём, дожидаемся unlock, withdraw → топ-ап теперь
        // ожидаемо упадёт на проверке времени, не withdrawn флага.
        // Поэтому тест переделаем: проверяем, что после withdrawn
        // нельзя топ-апить ДО unlock — через soft+emergency.
        DiamondHandsVault v2 = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        vm.warp(block.timestamp + 1 days);
        vm.prank(ALICE);
        v2.emergencyWithdraw();
        vm.expectRevert(Errors.AlreadyWithdrawn.selector);
        vm.prank(ALICE);
        v2.topUp(10 ether);
    }

    function test_TopUp_RevertsOnZero() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        vm.expectRevert(Errors.AmountZero.selector);
        vm.prank(ALICE);
        v.topUp(0);
    }

    function test_TopUp_HandlesFeeOnTransferToken() public {
        MockFeeOnTransferERC20 fot = new MockFeeOnTransferERC20(500); // 5%
        fot.mint(ALICE, INITIAL_BALANCE);

        DiamondHandsVault v = _createSoftVaultWithToken(address(fot), DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        uint256 amountBefore = v.amount();
        uint256 addAmount = 100 ether;
        uint256 expectedDelta = (addAmount * 9500) / 10000;

        vm.prank(ALICE);
        v.topUp(addAmount);
        assertEq(v.amount(), amountBefore + expectedDelta);
    }

    function test_TopUp_RevertsOnZeroActualReceived() public {
        MockFeeOnTransferERC20 fot = new MockFeeOnTransferERC20(0); // no fee
        fot.mint(ALICE, INITIAL_BALANCE);

        DiamondHandsVault v = _createSoftVaultWithToken(address(fot), DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        // включаем 100% fee → delta = 0
        fot.setFeeBps(10000);
        vm.expectRevert(Errors.TransferReceivedZero.selector);
        vm.prank(ALICE);
        v.topUp(10 ether);
    }

    function test_TopUp_EmitsEvent() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        uint256 addAmount = 50 ether;
        vm.expectEmit(true, false, false, true, address(v));
        emit ToppedUp(ALICE, addAmount, DEFAULT_AMOUNT + addAmount);
        vm.prank(ALICE);
        v.topUp(addAmount);
    }

    // =================================================================
    //                         EXTEND LOCK
    // =================================================================

    function test_ExtendLock_HappyPath() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        uint256 oldUnlock = v.unlockTimestamp();
        uint256 newUnlock = oldUnlock + 30 days;
        vm.prank(ALICE);
        v.extendLock(newUnlock);
        assertEq(v.unlockTimestamp(), newUnlock);
    }

    function test_ExtendLock_UpdatesLockStartedAt() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        vm.warp(block.timestamp + 10 days);
        uint256 oldStart = v.lockStartedAt();
        vm.prank(ALICE);
        v.extendLock(block.timestamp + 60 days);
        assertEq(v.lockStartedAt(), block.timestamp);
        assertGt(v.lockStartedAt(), oldStart);
    }

    function test_ExtendLock_PenaltyCurveResetsToMax() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        // half-way through original lock: penaltyBps == 1000
        vm.warp(block.timestamp + DEFAULT_LOCK / 2);
        assertEq(v.currentPenaltyBps(), 1000);
        // extend by 30 days more
        vm.prank(ALICE);
        v.extendLock(block.timestamp + 30 days);
        // immediately after extend: penaltyBps == max == 2000
        assertEq(v.currentPenaltyBps(), 2000);
    }

    function test_ExtendLock_RevertsIfNotOwner() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        vm.expectRevert(Errors.NotOwner.selector);
        vm.prank(BOB);
        v.extendLock(block.timestamp + 60 days);
    }

    function test_ExtendLock_RevertsAfterUnlock() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        vm.warp(block.timestamp + DEFAULT_LOCK);
        vm.expectRevert(Errors.ExtendAfterUnlock.selector);
        vm.prank(ALICE);
        v.extendLock(block.timestamp + 60 days);
    }

    function test_ExtendLock_RevertsIfNewTsNotIncreased() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        uint256 unlock = v.unlockTimestamp(); // compute outside prank
        vm.expectRevert(Errors.ExtendMustIncrease.selector);
        vm.prank(ALICE);
        v.extendLock(unlock);
    }

    function test_ExtendLock_RevertsAfterWithdrawn() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        vm.warp(block.timestamp + 1 days);
        vm.prank(ALICE);
        v.emergencyWithdraw();
        vm.expectRevert(Errors.AlreadyWithdrawn.selector);
        vm.prank(ALICE);
        v.extendLock(block.timestamp + 60 days);
    }

    function test_ExtendLock_RevertsOnTooFarFuture() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        uint256 tooFar = block.timestamp + 1825 days + 1;
        vm.expectRevert(); // UnlockTooFar with payload
        vm.prank(ALICE);
        v.extendLock(tooFar);
    }

    function test_ExtendLock_EmitsEvent() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        uint256 oldUnlock = v.unlockTimestamp();
        uint256 newUnlock = oldUnlock + 30 days;
        vm.expectEmit(false, false, false, true, address(v));
        emit LockExtended(oldUnlock, newUnlock);
        vm.prank(ALICE);
        v.extendLock(newUnlock);
    }

    // =================================================================
    //                          CHECK IN
    // =================================================================

    function test_CheckIn_HappyPath_EmitsEvent() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        vm.expectEmit(true, false, false, true, address(v));
        emit CheckedIn(ALICE, block.timestamp);
        vm.prank(ALICE);
        v.checkIn();
    }

    function test_CheckIn_RevertsIfNotOwner() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        vm.expectRevert(Errors.NotOwner.selector);
        vm.prank(BOB);
        v.checkIn();
    }

    function test_CheckIn_RevertsIfWithdrawn() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        vm.warp(block.timestamp + 1 days);
        vm.prank(ALICE);
        v.emergencyWithdraw();
        vm.expectRevert(Errors.AlreadyWithdrawn.selector);
        vm.prank(ALICE);
        v.checkIn();
    }

    function test_CheckIn_DoesNotChangeState() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        uint256 amountBefore = v.amount();
        uint256 unlockBefore = v.unlockTimestamp();
        uint256 startBefore = v.lockStartedAt();
        bool withdrawnBefore = v.withdrawn();

        vm.prank(ALICE);
        v.checkIn();

        assertEq(v.amount(), amountBefore);
        assertEq(v.unlockTimestamp(), unlockBefore);
        assertEq(v.lockStartedAt(), startBefore);
        assertEq(v.withdrawn(), withdrawnBefore);
    }

    // =================================================================
    //                          REENTRANCY
    // =================================================================

    function test_NoReentrancy_Withdraw() public {
        MockReentrantToken rt = new MockReentrantToken();
        rt.mint(ALICE, INITIAL_BALANCE);

        // create vault: mock token does no attack during creation
        DiamondHandsVault v = _createSoftVaultWithToken(address(rt), DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);

        // arm attack: during transfer, try to call withdraw() again
        rt.setAttack(
            address(v),
            abi.encodeWithSelector(v.withdraw.selector),
            true, // on transfer
            false
        );

        vm.warp(block.timestamp + DEFAULT_LOCK);
        vm.prank(ALICE);
        v.withdraw(); // should succeed; reentry attempt is silently blocked
        assertTrue(v.withdrawn());
    }

    function test_NoReentrancy_EmergencyWithdraw() public {
        MockReentrantToken rt = new MockReentrantToken();
        rt.mint(ALICE, INITIAL_BALANCE);

        DiamondHandsVault v = _createSoftVaultWithToken(address(rt), DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);

        rt.setAttack(address(v), abi.encodeWithSelector(v.emergencyWithdraw.selector), true, false);

        vm.warp(block.timestamp + 1 days);
        vm.prank(ALICE);
        v.emergencyWithdraw();
        assertTrue(v.withdrawn());
    }

    function test_NoReentrancy_TopUp() public {
        MockReentrantToken rt = new MockReentrantToken();
        rt.mint(ALICE, INITIAL_BALANCE);

        DiamondHandsVault v = _createSoftVaultWithToken(address(rt), DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);

        // attack on transferFrom: try to call topUp again
        rt.setAttack(address(v), abi.encodeWithSelector(v.topUp.selector, uint256(1)), false, true);

        uint256 amountBefore = v.amount();
        vm.prank(ALICE);
        v.topUp(10 ether);
        assertEq(v.amount(), amountBefore + 10 ether);
    }

    // =================================================================
    //                          VIEW FUNCTIONS
    // =================================================================

    function test_CurrentPenaltyBps_HardMode_ReturnsZero() public {
        DiamondHandsVault v = _createHardVault(DEFAULT_AMOUNT, DEFAULT_LOCK);
        assertEq(v.currentPenaltyBps(), 0);
    }

    function test_CurrentPenaltyBps_AfterUnlock_ReturnsZero() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        vm.warp(block.timestamp + DEFAULT_LOCK);
        assertEq(v.currentPenaltyBps(), 0);
    }

    function test_CurrentPenaltyBps_AtStart_ReturnsMax() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 3000);
        assertEq(v.currentPenaltyBps(), 3000);
    }

    function test_CurrentPenaltyBps_AtMidpoint_ReturnsHalf() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        vm.warp(block.timestamp + DEFAULT_LOCK / 2);
        assertEq(v.currentPenaltyBps(), 1000);
    }

    function test_CurrentPenaltyAmount_ScalesWithAmount() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        // at start, penaltyBps = 2000 → penaltyAmount = 100 * 0.2 = 20
        assertEq(v.currentPenaltyAmount(), (DEFAULT_AMOUNT * 2000) / 10000);

        // top up by 50 → amount = 150 → penaltyAmount = 150 * 0.2 = 30
        vm.prank(ALICE);
        v.topUp(50 ether);
        assertEq(v.currentPenaltyAmount(), ((DEFAULT_AMOUNT + 50 ether) * 2000) / 10000);
    }

    function test_TimeLeft_BeforeUnlock() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        assertEq(v.timeLeft(), DEFAULT_LOCK);
        vm.warp(block.timestamp + 5 days);
        assertEq(v.timeLeft(), DEFAULT_LOCK - 5 days);
    }

    function test_TimeLeft_AfterUnlock_ReturnsZero() public {
        DiamondHandsVault v = _createSoftVault(DEFAULT_AMOUNT, DEFAULT_LOCK, 2000);
        vm.warp(block.timestamp + DEFAULT_LOCK + 1);
        assertEq(v.timeLeft(), 0);
    }
}
