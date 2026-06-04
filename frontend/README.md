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

## Base App (Mini App)

`main.tsx` wraps the app in `OnchainKitProvider` + `MiniKitProvider`; `App.tsx`
calls `setMiniAppReady()` to dismiss the host splash; `web3/config.ts` includes
the Farcaster Mini App connector (auto-connects inside the Base App).

To publish (needs a deployed HTTPS domain):

1. Deploy `dist/` to a host; set the canonical domain.
2. Replace every `HOST` placeholder in `index.html` (`fc:miniapp`) and
   `public/.well-known/farcaster.json` with that domain; add `icon.png`,
   `splash.png`, `og.png`.
3. Generate `accountAssociation` with the Base/Warpcast manifest tool and paste
   it into `farcaster.json`.
4. Validate the embed in the Base App / Warpcast embed tools.

Open items and known gaps vs. the prototype are tracked in [`ISSUES.md`](./ISSUES.md).
