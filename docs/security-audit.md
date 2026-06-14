# Diamond Hands — Security Audit & Mainnet Readiness

**Scope:** `contracts/src/` — `DiamondHandsFactory.sol`, `DiamondHandsVault.sol`,
`errors/Errors.sol`, `interfaces/IDiamondHandsVault.sol`
**Compiler:** Solidity `0.8.24` (checked arithmetic) · OpenZeppelin Contracts 5.x
**Date:** 2026-06-13 · **Branch:** `claude/sweet-heisenberg-Lq8T5`
**Reviewer:** internal pre-mainnet review (manual + static analysis)

> This is an internal review to harden the protocol before a Base **mainnet**
> deploy. It is **not** a substitute for a third-party audit — see the
> recommendation in §7 before holding material value.

---

## 1. Summary

| Severity | Count | Status |
| --- | --- | --- |
| Critical | 0 | — |
| High | 0 | — |
| Medium | 0 | — |
| Low | 2 | 1 fixed, 1 documented |
| Informational | 4 | documented |

**Verdict:** the contracts are well-architected and no fund-loss vector was
found. Every token-moving function is `nonReentrant`, follows checks-effects-
interactions, and uses `SafeERC20` with `balanceOf`-delta accounting. Owner
powers cannot touch funds already locked in existing vaults. The remaining
items are hardening/operational, concentrated in the **mainnet ownership model**
(§5) and **token compatibility** (§6).

## 2. Architecture & invariants reviewed

- **Factory + EIP-1167 minimal-proxy clones.** One immutable `implementation`;
  each lock is a cheap clone. Clones hard-code their implementation in bytecode,
  so `setImplementation` only affects **future** vaults — an owner cannot swap
  the logic under existing locked funds. ✓
- **Per-vault snapshot.** `feeReceiver`, `maxPenaltyBps`, `allowEarlyExit` are
  frozen at `initialize`; the vault never reads them back from the factory. ✓
- **Penalty curve.** Linear decay `maxPenaltyBps · timeLeft / (unlock −
  lockStartedAt)`, 0 at/after unlock, 0 in hard mode. No division-by-zero: when
  reachable, `lockStartedAt ≤ now < unlock` ⇒ denominator > 0. Integer division
  rounds the penalty **down** (user-favourable). ✓
- **Lifecycle flags.** `withdrawn` is set before any transfer; all mutators
  revert on `withdrawn`. ✓

## 3. Tooling results

**`forge lint`** — 10 × `block-timestamp` warnings only. Accepted: locks are
measured in days–years, so a validator's ±seconds timestamp influence is
economically irrelevant (see L-finding below).

**Slither 0.11.5** — 13 results, all reviewed as non-issues:

- `reentrancy-balance` / `reentrancy-benign` on `createVault` / `topUp`:
  **false positive** — both functions are `nonReentrant`; the `balanceOf`-delta
  read-after-call is the intended fee-on-transfer pattern and reentry is blocked.
- `incorrect-equality` (`actualAmount == 0`, `delta == 0`): **intended** —
  these are exact "received zero tokens" guards.
- `timestamp` (×8): same as the lint note; acceptable for this time scale.
- `missing-inheritance`: **fixed** — `DiamondHandsVault` now formally
  `is IDiamondHandsVault` (compile-time guarantee the `initialize` signature
  matches what the factory calls).

## 4. Findings

### L-01 — Vault did not formally implement its interface  · FIXED
`DiamondHandsVault` implemented `initialize` matching `IDiamondHandsVault` by
convention only. A future signature drift would compile but break the
factory→vault call at runtime. **Fix applied:** `contract DiamondHandsVault is
IDiamondHandsVault …` + `override`. Behaviour and ABI unchanged.

### L-02 — Rebasing / blocklist / non-standard tokens unsupported · DOCUMENTED
Vault accounting fixes `amount` at deposit. For **rebasing** tokens the held
balance can drift below `amount`, making `withdraw` revert (funds effectively
stuck for that vault owner). For **blocklist** tokens (e.g. USDC) a blocklisted
`owner`/`feeReceiver` makes transfers revert. This only affects the user who
chose such a token — no cross-user impact. Now that the UI supports locking an
**arbitrary token by address**, surface a "unsupported token type" warning and
keep the curated list as the default. Fee-on-transfer **is** handled (delta
accounting). *Recommendation: frontend warning + a note in user docs.*

### I-01 — `block.timestamp` comparisons · ACCEPTED
Used for lock start/unlock checks. Manipulation window (seconds) is negligible
against a 1-day…5-year lock. No action.

### I-02 — `emergencyWithdraw` liveness depends on `feeReceiver` · ACCEPTED
If the penalty transfer to `feeReceiver` reverts, the whole early-exit reverts.
`feeReceiver` is protocol-controlled and snapshotted per vault; ERC-20
`transfer` does not invoke the recipient, so a normal address (EOA or simple
contract) is always safe. *Operational: keep `feeReceiver` a plain receiver.*

### I-03 — Unbounded `vaultsByOwner` array (`getVaultsByOwner` DoS) · ACCEPTED
A power user with very many vaults could make the view exceed an RPC gas cap.
View-only, no fund risk; the frontend already reads per-factory. Pagination is a
phase-2 item.

### I-04 — Self-cloned, unfunded vaults · ACCEPTED (no impact)
`Clones.clone` is permissionless, so anyone can clone the implementation and
`initialize` a vault outside the factory. Such a vault has no real backing
(the factory funds *before* `initialize`); its `withdraw` reverts on
insufficient balance. It is not in the factory registry and harms only its
creator. No protocol impact.

## 5. Trust model & centralization (key for mainnet)

The factory `owner` can **only**:
1. `setImplementation` — change logic for **future** vaults (most powerful);
2. `setFeeReceiver` — change the penalty recipient for **future** vaults;
3. `pause` / `unpause` — gate **new** `createVault` (existing vaults keep
   withdraw/exit fully available).

The owner **cannot** withdraw, freeze, or reparametrize funds already locked.
`renounceOwnership` is disabled; ownership transfer is two-step (`Ownable2Step`).

> **Mainnet requirement:** move `owner` to a **multisig** (e.g. Safe), and put
> `setImplementation` behind a **timelock** so users can observe and exit ahead
> of any logic change to future vaults. This is the single most important
> mainnet hardening step.

## 6. Token compatibility

| Token trait | Status |
| --- | --- |
| Standard ERC-20 | ✅ supported |
| Missing-return (USDT-style) | ✅ via `SafeERC20` |
| Fee-on-transfer | ✅ via `balanceOf`-delta |
| Reverts on zero-value transfer | ✅ guarded (`penaltyAmt > 0`; payout > 0) |
| Rebasing | ❌ unsupported (L-02) |
| Blocklist (USDC) | ⚠️ owner/feeReceiver must not be blocklisted (L-02) |
| ERC-777 / transfer hooks | ✅ neutralized by `nonReentrant` + CEI |

## 7. Mainnet readiness checklist

**Contracts**
- [x] L-01 fixed; Slither/lint reviewed; 114 tests green (104 unit/integration + 10 invariants).
- [ ] **Third-party audit** before holding material TVL (this review is internal).
- [ ] Deploy with `owner = multisig`; add a timelock for `setImplementation`.
- [ ] Decide `feeReceiver` (multisig/treasury) — it is per-vault permanent.
- [ ] Re-run full suite + Slither on the exact mainnet commit; verify on Sourcify + Etherscan.

**Frontend / infra**
- [ ] Multichain config: Base mainnet (chainId 8453) + real WETH `0x4200…0006`
      (same address on mainnet), mainnet factory address, mainnet RPC.
- [ ] Keep testnet reachable for QA (env-driven chain switch).
- [ ] Production RPC with `getLogs` support (Alchemy/QuickNode) for the streak indexer.
- [ ] Builder Code attribution already wired; it starts counting on mainnet.

**Ops**
- [ ] Monitoring/alerts on factory events (`VaultCreated`, `ImplementationUpdated`,
      `FeeReceiverUpdated`, `Paused`) and ownership-transfer events.
- [ ] Incident runbook: when to `pause`, multisig signer coordination.
- [ ] User docs: supported token types (no rebasing), hard vs soft, penalty curve.

## 8. Appendix — what was NOT changed and why

No logic changes were made beyond L-01 (interface inheritance, behaviourally
inert). The penalty math, CEI ordering, reentrancy guards, and the clone
immutability model were reviewed and left intact — they are the protocol's core
safety properties and already hold.
