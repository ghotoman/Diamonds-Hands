# Diamond Hands — frontend

Web3 mini-app for Base. Lock ERC-20 tokens in a personal on-chain vault for a
fixed term to beat paper hands: **soft mode** (early exit with a decaying
penalty) or **hard mode** (no exit until the unlock date). Runs standalone in a
browser and as a **Base App Mini App**.

The UI is a 1:1 port of the design prototype; copy is English. Mock data drives a
`demo` toggle for offline preview, while real wallets read/write the deployed
Base Sepolia contracts.

## Stack

Vite 6 · React 19 · TypeScript (strict) · Tailwind v4 (`@theme` tokens) ·
wagmi v2 · viem 2 · @tanstack/react-query · @coinbase/onchainkit (MiniKit) ·
@farcaster/miniapp-wagmi-connector.

## Setup

```bash
cp .env.example .env.local   # fill VITE_* (factory addr is pre-filled)
npm install
npm run dev                  # http://localhost:5173
npm run build                # tsc -b && vite build  → dist/
npm run preview              # serve dist/ locally
```

`.env.local` is gitignored — never commit secrets. Variables:

| Var | Purpose |
| --- | --- |
| `VITE_FACTORY_ADDRESS` | DiamondHandsFactory on Base Sepolia (pre-filled). |
| `VITE_BASE_SEPOLIA_RPC_URL` | RPC for reads/receipts. A private RPC is more reliable than the public default. |
| `VITE_ONCHAINKIT_API_KEY` | Optional — OnchainKit/MiniKit (Coinbase Developer Platform). |
| `VITE_TEST_TOKEN_ADDRESS` | Optional — a test ERC-20 (DHT) shown in the create picker. |

Deployed addresses and the contract deploy runbook live in `../docs/deploy.md`.

## Architecture

```
src/
  web3/
    config.ts          wagmi config (Base Sepolia; farcaster + injected + coinbase)
    contracts.ts       addresses, limits, ABIs, BaseScan helpers
    abi/               factory / vault (generated from contracts/out) + erc20
    tokenRegistry.ts   asset address → UI Token (known + on-chain fallback)
    mapVault.ts        on-chain Vault view fields → UI Vault (pure)
    useVaults.ts       reads: getVaultsByOwner → multicall vault + asset meta
    useTokens.ts       create picker: known tokens + live balances
    useVaultActions.ts writes: create/withdraw/emergency/topUp/extend/checkIn
    useVaultEvents.ts  check-in streak: adaptive getLogs scan of CheckedIn events
    tx.ts              tx overlay types + parseTxError (friendly error copy)
  screens/             Dashboard, CreateFlow (5-step), VaultDetail (+ modals)
  components/          Button, Icon, Modal, ProgressBar, ErrorBoundary, …
  App.tsx              routing, wallet/network gating, tx overlay, demo toggle
  main.tsx             providers (ErrorBoundary > Wagmi > Query > OnchainKit > MiniKit)
```

**Reads** go through a fixed RPC transport, so they work regardless of the
wallet's current network. **Writes** require the wallet on Base Sepolia.
`createVault` approves the **Factory**; `topUp` approves the **Vault** (they pull
the asset via `transferFrom`). After a write settles, reads refetch.

**Demo vs live.** A small `◍ live / ◍ demo data` toggle switches the data
source. `demo` shows the mock prototype with simulated transactions (no wallet
needed — handy for previews/CI). `live` reads/writes the chain when a wallet is
connected on Base Sepolia; it handles connect / wrong-network / loading
(skeleton) / error / empty states.

## Deploy

The repo ships host configs that build this subdir automatically:

- **Vercel** — import the repo, set **Root Directory = `frontend`** (picks up
  `frontend/vercel.json`). Build/output are pre-set; the production domain is
  auto-injected (see below).
- **Netlify** — `netlify.toml` (repo root) sets `base = frontend`,
  `publish = dist`, and an SPA fallback. Just connect the repo.

Set the contract env vars (`VITE_FACTORY_ADDRESS`, `VITE_BASE_SEPOLIA_RPC_URL`,
…) in the host dashboard. `dist/` is gitignored — the host builds it.

### Mini App embed/manifest domain

The Mini App embed meta (`index.html`) and `public/.well-known/farcaster.json`
use an `__APP_URL__` token that `vite.config.ts` fills **at build time** from:

`VITE_APP_URL` → Vercel (`VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL`) →
Netlify (`URL` / `DEPLOY_PRIME_URL`).

On Vercel/Netlify it's auto-detected; for other hosts set `VITE_APP_URL` to the
canonical `https://…` origin. Brand assets (`icon` / `splash` / `embed` 3:2 /
`og`) live in `public/` — regenerate with `node scripts/gen-brand-assets.mjs`
(renders the gem + cards in headless Chromium; set `CHROME_PATH` if needed).

## Base App (Mini App)

`main.tsx` wraps the app in `OnchainKitProvider` + `MiniKitProvider`; `App.tsx`
calls `setMiniAppReady()` to dismiss the host splash and **auto-connects the
Farcaster Mini App connector** when running inside the Base App (detected via
`useMiniKit().context`). On standalone web it connects an injected extension,
falling back to the Coinbase smart-wallet.

To publish:

1. Deploy (above) so the embed meta + manifest carry the real domain.
2. Generate `accountAssociation` for that domain with the Base/Warpcast manifest
   tool and paste it into `public/.well-known/farcaster.json`.
3. Validate the embed in the Base App / Warpcast embed tools, then open it.

> The Mini App wallet only exists **inside the Base App** loaded from the public
> URL — it can't be tested in a plain browser on `localhost`. For local dev, use
> a browser wallet extension on Base Sepolia, or the `◍ demo` toggle (no wallet).

Open items and known gaps vs. the prototype are tracked in [`ISSUES.md`](./ISSUES.md).
