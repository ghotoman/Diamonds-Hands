# 💎 Diamond Hands

Lock your ERC-20 on-chain for a fixed term and beat paper hands. A Web3
mini-app for **Base** (Base App / Farcaster Mini App + standalone web).

You deposit an ERC-20 into a personal, immutable vault for a chosen period to
physically remove your own ability to sell early.

- **Hard mode** — a pure time-lock. No exit until unlock. Real commitment.
- **Soft mode** — early exit allowed, but with a penalty that **decays
  linearly to zero** at unlock. You pick the starting penalty (5–30%).

Non-custodial: each vault is a per-user EIP-1167 clone; nobody — not even the
factory owner — can touch your funds.

**🚀 Live on Base mainnet** — soft-launch (TVL-capped):
- Open in Base App / Farcaster: <https://farcaster.xyz/miniapps/eAC5uX9rFXVs/diamond-hands>
- Web: <https://diamonds-hands.vercel.app>

---

## How it works

```
                ┌─────────────────────────┐
   user ──────► │   DiamondHandsFactory   │  one per network
   createVault  │  (Ownable2Step,         │
                │   Pausable,             │
                │   ReentrancyGuard)      │
                └───────────┬─────────────┘
                            │ Clones.clone(implementation)  (EIP-1167)
                            ▼
                ┌─────────────────────────┐
                │  DiamondHandsVault clone │  one per lock (asset × term × user)
                │  owner, asset, amount,   │
                │  unlock, penalty curve…  │
                └─────────────────────────┘
```

- **Factory** deploys cheap minimal-proxy clones, one per lock, forwards the
  ERC-20 in (fee-on-transfer-safe via `balanceOf` delta), and snapshots the
  `feeReceiver` + `maxPenaltyBps` into each clone.
- **Vault** is immutable after `initialize`. Actions: `withdraw` (after
  unlock), `emergencyWithdraw` (soft, with penalty), `topUp`, `extendLock`,
  `checkIn`.
- ERC-20 only (no native ETH — wrap to WETH). Penalty decays from
  `maxPenaltyBps` at `lockStartedAt` to 0 at `unlockTimestamp`.

Full design: [`docs/context-brief.md`](docs/context-brief.md) ·
[`docs/architecture-draft.md`](docs/architecture-draft.md).

---

## Repository layout

| Path | What |
|------|------|
| `contracts/` | Foundry project — Solidity 0.8.24, OpenZeppelin 5, tests, deploy scripts |
| `frontend/`  | Vite + React 19 + TS + Tailwind v4 + wagmi/viem + OnchainKit MiniKit |
| `docs/`      | Phase-0 spec, architecture, deployment runbook + addresses |
| `.github/`   | CI (contracts unit + invariants, frontend build) |

---

## Deployed (Base mainnet, chainId 8453)

| Contract | Address |
|----------|---------|
| DiamondHandsFactory | [`0x89de426deF37Aa34c17f72d6a73229E64dd93e11`](https://basescan.org/address/0x89de426def37aa34c17f72d6a73229e64dd93e11#code) |
| DiamondHandsVault (impl) | [`0x2391CDBAC7Be38FC72E7bA7609157a3e2e6B823e`](https://basescan.org/address/0x2391cdbac7be38fc72e7ba7609157a3e2e6b823e#code) |

Owner + fee receiver: 2/2 Safe `0x1Cc4CB5192095E859cFF3fc1C0505Cbe210959De`.
Verified on BaseScan. Soft-launch with a $1M TVL cap enforced off-chain
(`monitoring/`). Full runbook: [`docs/deploy.md`](docs/deploy.md) §11.

> Mainnet addresses equal the Base Sepolia v1 ones by deterministic CREATE
> (same deployer + nonce) — different chains, no collision.

## Deployed (Base Sepolia, chainId 84532)

| Contract | Address |
|----------|---------|
| DiamondHandsFactory (v2) | [`0xE0a0836f19d604e3aEEf1c55a59e50e1cE806cC3`](https://sepolia.basescan.org/address/0xe0a0836f19d604e3aeef1c55a59e50e1ce806cc3#code) |
| DiamondHandsVault (impl v2) | [`0xD41FA9D180187C79E220A1C5968Da8E145646f07`](https://sepolia.basescan.org/address/0xd41fa9d180187c79e220a1c5968da8e145646f07#code) |

Verified on Sourcify. See [`docs/deploy.md`](docs/deploy.md) for the full
deployment runbook.

---

## Contracts

```bash
cd contracts
forge build
forge test                                            # 104 unit + 10 invariant
forge test --no-match-path 'test/Invariants.t.sol'    # fast unit only
forge coverage --report summary                       # Vault 100% / Factory 98%
```

Deploy (from your own machine — see `docs/deploy.md`):

```bash
forge script script/Deploy.s.sol:Deploy \
  --rpc-url base_sepolia --account dh-deployer --broadcast -vvv
```

A mintable test token for end-to-end testing:

```bash
forge script script/DeployMockToken.s.sol:DeployMockToken \
  --rpc-url base_sepolia --account dh-deployer --broadcast -vvv
```

## Frontend

```bash
cd frontend
cp .env.example .env        # VITE_FACTORY_ADDRESS is prefilled
npm install
npm run dev                 # http://localhost:5173
npm run build               # tsc -b + vite build
```

Connect a wallet on Base Sepolia, paste an ERC-20 address, and create /
manage vaults. Runs standalone in the browser and as a Base App Mini App
(MiniKit auto-connects inside the Base App). To publish as a Mini App, fill
the `HOST` placeholders and `accountAssociation` in
`frontend/public/.well-known/farcaster.json` + the `fc:miniapp` meta in
`frontend/index.html`.

---

## CI

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

- **unit** (push/PR) — `forge fmt --check` + `forge build --sizes` + unit tests.
- **frontend** (push/PR) — `npm ci` + `npm run build` (typecheck + bundle).
- **invariant** (nightly on `main` + manual dispatch) — the stateful
  invariant suite (~1.3M randomized calls/property), kept off the hot path.

---

## Status

- ✅ Phase 0 — spec & architecture (`docs/`)
- ✅ Phase 1 — contracts (Foundry, 100%/98% coverage, invariants, security review)
- ✅ Phase 3 — frontend (full create + manage flow, Base App MiniKit)
- ✅ Deployed + verified on Base Sepolia and **Base mainnet**
- ✅ Mainnet soft-launch — Safe-owned, $1M TVL cap (`monitoring/`), verified Mini App

## Security

Live on Base mainnet as a **soft-launch**. The contracts hold user funds: a
focused internal review (`docs/security-audit.md`) found no high/medium issues,
but **no external audit has been done**. Risk is bounded for launch by:

- a **$1M TVL cap** watched off-chain (`monitoring/`) with multisig `pause()`;
- **2/2 Safe** ownership (`0x1Cc4…59De`) — `renounceOwnership` is disabled, the
  factory owner still cannot touch user funds (each vault is an isolated clone).

Until an external audit, treat deposits accordingly. Key invariants and the
threat model are in `docs/`.

## License

MIT.
