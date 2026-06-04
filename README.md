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

## Deployed (Base Sepolia, chainId 84532)

| Contract | Address |
|----------|---------|
| DiamondHandsFactory | [`0x89de426deF37Aa34c17f72d6a73229E64dd93e11`](https://sepolia.basescan.org/address/0x89de426def37aa34c17f72d6a73229e64dd93e11#code) |
| DiamondHandsVault (impl) | [`0x2391CDBAC7Be38FC72E7bA7609157a3e2e6B823e`](https://sepolia.basescan.org/address/0x2391cdbac7be38fc72e7ba7609157a3e2e6b823e#code) |

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
- ✅ Deployed + verified on Base Sepolia
- ✅ Phase 3 — frontend (full create + manage flow, Base App MiniKit)

## Security

V1 is a testnet release. The contracts hold user funds: a focused security
review found no high/medium issues, but **no external audit has been done** —
do not use on mainnet with real funds without one. Key invariants and the
threat model are documented in `docs/`.

## License

MIT.
