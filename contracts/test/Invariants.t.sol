// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";

import {DiamondHandsFactory} from "../src/DiamondHandsFactory.sol";
import {DiamondHandsVault} from "../src/DiamondHandsVault.sol";

import {MockERC20} from "./mocks/MockERC20.sol";

// =====================================================================
//                      VAULT INVARIANTS
// =====================================================================

/// @notice Handler для одного soft-mode Vault. Все мутирующие действия
///         (`topUp`, `checkIn`, `extendLock`) обёрнуты в try/catch:
///         invariant-фаззер генерирует рандомные параметры, нас интересует
///         только итоговое состояние после УСПЕШНЫХ вызовов.
/// @dev    Owner всех действий — фиксированный ALICE (vault.owner()).
contract VaultHandler is Test {
    DiamondHandsVault public vault;
    MockERC20 public token;
    address public alice;

    // Историческое максимальное значение withdrawn — нужно, чтобы
    // проверять монотонность (false → true только в одну сторону).
    bool public withdrawnEverTrue;
    // Историческое максимальное значение unlockTimestamp — должно
    // монотонно не убывать.
    uint256 public maxUnlockSeen;

    constructor(DiamondHandsVault _vault, MockERC20 _token, address _alice) {
        vault = _vault;
        token = _token;
        alice = _alice;
        maxUnlockSeen = _vault.unlockTimestamp();
    }

    function topUp(uint256 raw) external {
        uint256 amt = bound(raw, 1, 1_000_000 ether);
        // обеспечиваем что у alice есть баланс
        if (token.balanceOf(alice) < amt) {
            token.mint(alice, amt);
        }
        vm.prank(alice);
        try vault.topUp(amt) {} catch {}
        _refreshHistory();
    }

    function checkIn() external {
        vm.prank(alice);
        try vault.checkIn() {} catch {}
        _refreshHistory();
    }

    function extendLock(uint256 raw) external {
        // bound внутри допустимого окна; функция всё равно может
        // отклонить — это OK.
        uint256 current = vault.unlockTimestamp();
        uint256 maxFuture = block.timestamp + 1825 days;
        if (current >= maxFuture) return;
        uint256 newTs = bound(raw, current + 1, maxFuture);
        vm.prank(alice);
        try vault.extendLock(newTs) {} catch {}
        _refreshHistory();
    }

    function emergencyWithdraw() external {
        vm.prank(alice);
        try vault.emergencyWithdraw() {} catch {}
        _refreshHistory();
    }

    function _refreshHistory() internal {
        if (vault.withdrawn()) withdrawnEverTrue = true;
        uint256 cur = vault.unlockTimestamp();
        if (cur > maxUnlockSeen) maxUnlockSeen = cur;
    }
}

/// @notice Инварианты, которые должны соблюдаться на любой последователь-
///         ности валидных действий над одним soft-mode Vault'ом.
contract DiamondHandsVaultInvariantsTest is StdInvariant, Test {
    DiamondHandsVault internal impl;
    DiamondHandsFactory internal factory;
    MockERC20 internal token;
    DiamondHandsVault internal vault;
    VaultHandler internal handler;

    address internal constant ALICE = address(0xA11CE);
    address internal constant FEE_RECEIVER = address(0xFEE);

    uint256 internal createdAtSnapshot;
    uint16 internal maxPenaltyBpsSnapshot;

    function setUp() public {
        vm.warp(1_700_000_000);

        token = new MockERC20("Test", "TST");
        impl = new DiamondHandsVault();
        factory = new DiamondHandsFactory(address(impl), FEE_RECEIVER);

        // ALICE стартует с большим балансом и approve на factory
        token.mint(ALICE, 1_000_000 ether);
        vm.prank(ALICE);
        token.approve(address(factory), type(uint256).max);

        // Soft-mode Vault: 30 дней, 20% штраф
        vm.prank(ALICE);
        address vAddr = factory.createVault(address(token), 100 ether, block.timestamp + 30 days, true, 2000);
        vault = DiamondHandsVault(vAddr);

        // ALICE даёт approve на Vault — нужно для topUp
        vm.prank(ALICE);
        token.approve(vAddr, type(uint256).max);

        createdAtSnapshot = vault.createdAt();
        maxPenaltyBpsSnapshot = vault.maxPenaltyBps();

        handler = new VaultHandler(vault, token, ALICE);
        targetContract(address(handler));
    }

    /// INV-V-1: Если Vault ещё не выведен, его реальный баланс ERC-20
    ///          совпадает с внутренним учётом (`amount`). Используем
    ///          чистый ERC-20 (не fee-on-transfer), поэтому равенство.
    function invariant_V1_BalanceMatchesAmountWhileActive() public view {
        if (vault.withdrawn()) return;
        assertEq(token.balanceOf(address(vault)), vault.amount(), "balance != amount while active");
    }

    /// INV-V-2: После withdraw / emergencyWithdraw amount всегда == 0.
    function invariant_V2_AmountZeroAfterWithdrawn() public view {
        if (vault.withdrawn()) {
            assertEq(vault.amount(), 0, "amount must be 0 after withdraw");
        }
    }

    /// INV-V-3: Флаг `withdrawn` монотонен: раз стал true, никогда не
    ///          возвращается обратно. Handler отслеживает исторический
    ///          максимум — если он был true, текущий обязан быть true.
    function invariant_V3_WithdrawnIsMonotonic() public view {
        if (handler.withdrawnEverTrue()) {
            assertTrue(vault.withdrawn(), "withdrawn flipped back to false");
        }
    }

    /// INV-V-4: `currentPenaltyBps()` всегда ∈ [0, maxPenaltyBps].
    function invariant_V4_PenaltyWithinBounds() public view {
        uint256 bps = vault.currentPenaltyBps();
        assertLe(bps, maxPenaltyBpsSnapshot, "penaltyBps > maxPenaltyBps");
    }

    /// INV-V-5: `lockStartedAt` всегда >= `createdAt` (extendLock только
    ///          двигает вперёд).
    function invariant_V5_LockStartedAfterCreated() public view {
        assertGe(vault.lockStartedAt(), createdAtSnapshot, "lockStartedAt < createdAt");
    }

    /// INV-V-6: `lockStartedAt` <= `unlockTimestamp`. extendLock
    ///          поддерживает этот инвариант, потому что разрешает только
    ///          newUnlockTimestamp > old (и проверяет, что лок ещё активен).
    function invariant_V6_LockStartBeforeUnlock() public view {
        assertLe(vault.lockStartedAt(), vault.unlockTimestamp(), "lockStartedAt > unlockTimestamp");
    }

    /// INV-V-7: `unlockTimestamp` монотонно не убывает.
    function invariant_V7_UnlockTimestampNonDecreasing() public view {
        assertGe(vault.unlockTimestamp(), handler.maxUnlockSeen(), "unlockTimestamp decreased");
    }
}

// =====================================================================
//                     FACTORY INVARIANTS
// =====================================================================

/// @notice Handler для Factory. Создаёт vault'ы от двух фиксированных
///         actor'ов (ALICE и BOB), чтобы можно было сверить
///         `vaultCount` с суммой длин `vaultsByOwner`.
contract FactoryHandler is Test {
    DiamondHandsFactory public factory;
    MockERC20 public token;
    address public alice;
    address public bob;

    constructor(DiamondHandsFactory _factory, MockERC20 _token, address _alice, address _bob) {
        factory = _factory;
        token = _token;
        alice = _alice;
        bob = _bob;
    }

    function createSoft(uint256 rawAmount, uint256 rawDuration, uint16 rawBps, bool useAlice) external {
        address actor = useAlice ? alice : bob;
        uint256 amount = bound(rawAmount, 1, 1_000_000 ether);
        uint256 duration = bound(rawDuration, 1 days, 1825 days);
        uint16 bps = uint16(bound(rawBps, 500, 3000));

        // обеспечиваем баланс actor'а
        if (token.balanceOf(actor) < amount) token.mint(actor, amount);

        vm.prank(actor);
        try factory.createVault(address(token), amount, block.timestamp + duration, true, bps) {} catch {}
    }

    function createHard(uint256 rawAmount, uint256 rawDuration, bool useAlice) external {
        address actor = useAlice ? alice : bob;
        uint256 amount = bound(rawAmount, 1, 1_000_000 ether);
        uint256 duration = bound(rawDuration, 1 days, 1825 days);

        if (token.balanceOf(actor) < amount) token.mint(actor, amount);

        vm.prank(actor);
        try factory.createVault(address(token), amount, block.timestamp + duration, false, 0) {} catch {}
    }
}

/// @notice Инварианты Factory: соответствие vaultCount и vaultsByOwner,
///         корректность каждого созданного clone.
contract DiamondHandsFactoryInvariantsTest is StdInvariant, Test {
    DiamondHandsVault internal impl;
    DiamondHandsFactory internal factory;
    MockERC20 internal token;
    FactoryHandler internal handler;

    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant FEE_RECEIVER = address(0xFEE);

    function setUp() public {
        vm.warp(1_700_000_000);

        token = new MockERC20("Test", "TST");
        impl = new DiamondHandsVault();
        factory = new DiamondHandsFactory(address(impl), FEE_RECEIVER);

        token.mint(ALICE, 10_000_000 ether);
        token.mint(BOB, 10_000_000 ether);
        vm.prank(ALICE);
        token.approve(address(factory), type(uint256).max);
        vm.prank(BOB);
        token.approve(address(factory), type(uint256).max);

        handler = new FactoryHandler(factory, token, ALICE, BOB);
        targetContract(address(handler));
    }

    /// INV-F-1: `vaultCount` точно равен сумме длин массивов
    ///          `vaultsByOwner` для обоих actor'ов (других в setUp нет).
    function invariant_F1_VaultCountEqualsSumOfMappings() public view {
        uint256 aliceLen = factory.getVaultsByOwner(ALICE).length;
        uint256 bobLen = factory.getVaultsByOwner(BOB).length;
        assertEq(factory.vaultCount(), aliceLen + bobLen, "vaultCount mismatch");
    }

    /// INV-F-2: Каждый адрес в `vaultsByOwner[ALICE]` имеет
    ///          `owner() == ALICE`. Аналогично для BOB.
    ///          Защищает от ошибки «owner записан не той записью».
    function invariant_F2_OwnerStoredCorrectly() public view {
        address[] memory aliceVaults = factory.getVaultsByOwner(ALICE);
        for (uint256 i = 0; i < aliceVaults.length; i++) {
            assertEq(DiamondHandsVault(aliceVaults[i]).owner(), ALICE, "Alice's vault owner != ALICE");
        }
        address[] memory bobVaults = factory.getVaultsByOwner(BOB);
        for (uint256 i = 0; i < bobVaults.length; i++) {
            assertEq(DiamondHandsVault(bobVaults[i]).owner(), BOB, "Bob's vault owner != BOB");
        }
    }

    /// INV-F-3: Каждый созданный clone содержит код (deploy успешен).
    function invariant_F3_AllClonesHaveCode() public view {
        address[] memory aliceVaults = factory.getVaultsByOwner(ALICE);
        for (uint256 i = 0; i < aliceVaults.length; i++) {
            assertGt(aliceVaults[i].code.length, 0, "Alice's clone has no code");
        }
        address[] memory bobVaults = factory.getVaultsByOwner(BOB);
        for (uint256 i = 0; i < bobVaults.length; i++) {
            assertGt(bobVaults[i].code.length, 0, "Bob's clone has no code");
        }
    }
}
