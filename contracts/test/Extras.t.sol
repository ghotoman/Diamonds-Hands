// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {DiamondHandsFactory} from "../src/DiamondHandsFactory.sol";
import {DiamondHandsVault} from "../src/DiamondHandsVault.sol";
import {DiamondHandsLens} from "../src/extras/DiamondHandsLens.sol";
import {DiamondHandsBrag} from "../src/extras/DiamondHandsBrag.sol";
import {DiamondHandsRegistry} from "../src/extras/DiamondHandsRegistry.sol";
import {IDiamondHandsFactoryView} from "../src/extras/IDiamondHandsViews.sol";

contract _Token is ERC20 {
    constructor() ERC20("Test", "T") {
        _mint(msg.sender, 1_000_000 ether);
    }
}

/// End-to-end coverage for the three on-chain extras (Lens / Brag / Registry).
/// Each shares one helper contract setup (real factory + a real vault) so the
/// reads/auth checks fire against the production code path, not stubs.
contract ExtrasTest is Test {
    DiamondHandsFactory internal factory;
    DiamondHandsVault internal impl;
    _Token internal token;
    DiamondHandsLens internal lens;
    DiamondHandsBrag internal brag;
    DiamondHandsRegistry internal registry;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal feeReceiver = makeAddr("fees");

    function setUp() public {
        impl = new DiamondHandsVault();
        factory = new DiamondHandsFactory(address(impl), feeReceiver);
        token = new _Token();

        lens = new DiamondHandsLens(IDiamondHandsFactoryView(address(factory)));
        brag = new DiamondHandsBrag();
        registry = new DiamondHandsRegistry();

        // Fund Alice and approve the factory so she can lock.
        token.transfer(alice, 1000 ether);
        vm.prank(alice);
        token.approve(address(factory), type(uint256).max);
    }

    function _alicesVault(uint256 amount, uint256 days_, bool soft, uint16 maxPenaltyBps)
        internal
        returns (address vault)
    {
        vm.prank(alice);
        vault = factory.createVault(address(token), amount, block.timestamp + days_ * 1 days, soft, maxPenaltyBps);
    }

    // ---------- Lens ----------

    function test_Lens_RevertsOnZeroFactory() public {
        vm.expectRevert(bytes("factory zero"));
        new DiamondHandsLens(IDiamondHandsFactoryView(address(0)));
    }

    function test_Lens_ReturnsEmptyForUserWithoutVaults() public view {
        DiamondHandsLens.VaultView[] memory views = lens.getVaults(bob);
        assertEq(views.length, 0);
    }

    function test_Lens_AggregatesAllVaultFields() public {
        address v1 = _alicesVault(100 ether, 7, false, 0); // hard
        address v2 = _alicesVault(50 ether, 30, true, 1500); // soft, 15% start

        DiamondHandsLens.VaultView[] memory views = lens.getVaults(alice);
        assertEq(views.length, 2);

        // index 0: v1 (hard)
        assertEq(views[0].vault, v1);
        assertEq(views[0].owner, alice);
        assertEq(views[0].asset, address(token));
        assertEq(views[0].amount, 100 ether);
        assertEq(views[0].allowEarlyExit, false);
        assertEq(views[0].withdrawn, false);
        assertEq(views[0].maxPenaltyBps, 0);
        assertEq(views[0].feeReceiver, feeReceiver);

        // index 1: v2 (soft)
        assertEq(views[1].vault, v2);
        assertEq(views[1].allowEarlyExit, true);
        assertEq(views[1].maxPenaltyBps, 1500);
        // a fresh soft vault has the FULL penalty until time elapses
        assertEq(views[1].currentPenaltyBps, 1500);
        assertGt(views[1].timeLeft, 0);
    }

    function test_Lens_GetVault_MatchesAggregatedRow() public {
        address v = _alicesVault(10 ether, 7, true, 500);
        DiamondHandsLens.VaultView memory single = lens.getVault(v);
        DiamondHandsLens.VaultView memory inList = lens.getVaults(alice)[0];
        assertEq(single.vault, inList.vault);
        assertEq(single.amount, inList.amount);
        assertEq(single.currentPenaltyBps, inList.currentPenaltyBps);
    }

    // ---------- Brag ----------

    function test_Brag_OwnerCanBragWithMemo() public {
        address v = _alicesVault(1 ether, 7, false, 0);
        vm.expectEmit(true, true, false, true);
        emit DiamondHandsBrag.Bragged(alice, v, "I'm in for 7 days, see you on the other side");
        vm.prank(alice);
        brag.brag(v, "I'm in for 7 days, see you on the other side");
    }

    function test_Brag_NonOwnerReverts() public {
        address v = _alicesVault(1 ether, 7, false, 0);
        vm.prank(bob);
        vm.expectRevert(DiamondHandsBrag.NotVaultOwner.selector);
        brag.brag(v, "stealing your brag");
    }

    function test_Brag_EmptyMemoIsAllowed() public {
        address v = _alicesVault(1 ether, 7, false, 0);
        vm.prank(alice);
        brag.brag(v, "");
    }

    function test_Brag_LongMemoReverts() public {
        address v = _alicesVault(1 ether, 7, false, 0);
        bytes memory tooLong = new bytes(281);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(DiamondHandsBrag.MemoTooLong.selector, 281, 280));
        brag.brag(v, string(tooLong));
    }

    function test_Brag_ExactMaxMemoIsAllowed() public {
        address v = _alicesVault(1 ether, 7, false, 0);
        bytes memory exact = new bytes(280);
        vm.prank(alice);
        brag.brag(v, string(exact));
    }

    // ---------- Registry ----------

    function test_Registry_RoundTripsProfile() public {
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit DiamondHandsRegistry.ProfileUpdated(alice, "ghotoman", "https://x.com/ghotoman_x");
        registry.setProfile("ghotoman", "https://x.com/ghotoman_x");

        DiamondHandsRegistry.Profile memory p = registry.getProfile(alice);
        assertEq(p.name, "ghotoman");
        assertEq(p.link, "https://x.com/ghotoman_x");
        assertEq(p.updatedAt, uint64(block.timestamp));
    }

    function test_Registry_EmptyForUnsetUser() public view {
        DiamondHandsRegistry.Profile memory p = registry.getProfile(bob);
        assertEq(bytes(p.name).length, 0);
        assertEq(bytes(p.link).length, 0);
        assertEq(p.updatedAt, 0);
    }

    function test_Registry_OverwritesPreviousEntry() public {
        vm.startPrank(alice);
        registry.setProfile("first", "https://a.example");
        vm.warp(block.timestamp + 1 hours);
        registry.setProfile("second", "https://b.example");
        vm.stopPrank();

        DiamondHandsRegistry.Profile memory p = registry.getProfile(alice);
        assertEq(p.name, "second");
        assertEq(p.link, "https://b.example");
    }

    function test_Registry_EmptyStringsClearTheEntry() public {
        vm.startPrank(alice);
        registry.setProfile("ghotoman", "https://x.com/ghotoman_x");
        registry.setProfile("", "");
        vm.stopPrank();
        DiamondHandsRegistry.Profile memory p = registry.getProfile(alice);
        assertEq(bytes(p.name).length, 0);
        assertEq(bytes(p.link).length, 0);
    }

    function test_Registry_RevertsOnNameTooLong() public {
        bytes memory n = new bytes(33);
        vm.expectRevert(abi.encodeWithSelector(DiamondHandsRegistry.NameTooLong.selector, 33, 32));
        registry.setProfile(string(n), "");
    }

    function test_Registry_RevertsOnLinkTooLong() public {
        bytes memory l = new bytes(201);
        vm.expectRevert(abi.encodeWithSelector(DiamondHandsRegistry.LinkTooLong.selector, 201, 200));
        registry.setProfile("ok", string(l));
    }

    function test_Registry_PerUserIsolation() public {
        vm.prank(alice);
        registry.setProfile("alice.eth", "");
        vm.prank(bob);
        registry.setProfile("bob.eth", "");
        assertEq(registry.getProfile(alice).name, "alice.eth");
        assertEq(registry.getProfile(bob).name, "bob.eth");
    }
}
