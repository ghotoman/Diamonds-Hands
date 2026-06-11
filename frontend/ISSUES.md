# Frontend — open items / decisions

Notes accumulated while porting the design prototype to a production Vite app.

## Decisions

- **Copy language: English.** The prototype copy is Russian, but the project
  owner asked for an English-only frontend. The visual layout, colors,
  spacing, and structure are ported 1:1; only the text strings are translated
  to English. (Visual fidelity preserved; language per owner request.)

- **Tailwind v4 instead of a v3 `tailwind.config.js`.** The existing project
  is on Tailwind v4 (`@tailwindcss/vite`). The prototype's config tokens
  (colors `baseblue/ink/sub/line/surface/success/danger/warning`, Inter font,
  `shadow-cta` / `shadow-modal`) are ported verbatim into `@theme` in
  `src/index.css`. `h-13` (3.25rem) already resolves natively in v4's spacing
  scale, so no custom spacing token is needed. Output is visually identical.

- **Base App SDK is present.** `@coinbase/onchainkit` (incl. MiniKit) and
  `@farcaster/miniapp-wagmi-connector` are installed and wired in `main.tsx`
  (OnchainKitProvider + MiniKitProvider) and `web3/config.ts` (farcaster
  connector). No separate task-5 add needed.

- **Real writes (Stage 4).** All actions use wagmi `useWriteContract` +
  viem `waitForTransactionReceipt`, driving the same overlay as the demo
  (wallet → pending → success | error) and refetching reads on success.
  - **Approve targets (from the contracts):** `createVault` pulls the asset
    via `safeTransferFrom(msg.sender → vault)`, so the user approves the
    **Factory**; `topUp` pulls via `safeTransferFrom(msg.sender → vault clone)`,
    so the user approves the **Vault**. Approval is for the **exact amount**
    (a fresh approve each lock/top-up) — simpler and safer than max-approve.
  - **extendLock** takes an absolute `newUnlockTimestamp` = current unlock +
    chosen days (contract requires strictly-increasing, ≤ 5y from now).
  - **Error copy:** `web3/tx.ts#parseTxError` maps user-rejection, gas, and
    every Factory/Vault/ERC-20 custom error to friendly English text.
  - **checkIn** is now a real signed tx (emits `CheckedIn`); routed through
    the overlay like other actions.

- **Live create token list.** The picker uses `KNOWN_TOKENS` (Base Sepolia
  WETH + optional `DHT` via `VITE_TEST_TOKEN_ADDRESS`) with live wallet
  balances (`web3/useTokens.ts`); demo mode keeps the 7 mock tokens. Minor
  cosmetics in live mode: balances show `$0` (no price oracle), and the
  "Approve + Lock" hint is static (the real flow skips approve when allowance
  already covers the amount). Functional, not visual-critical.

## To verify before Mini App publish (task 5)

- Fill `HOST` + `accountAssociation` in `public/.well-known/farcaster.json`
  and the `fc:miniapp` meta in `index.html` (needs a deployed domain + signed
  association from the Base/Warpcast manifest tool).
- Add the Base Dev dashboard verification meta tag (placeholder TODO).

## Known gaps vs prototype (need contract/indexer support)

- **Check-in streak count — ✅ solved (client-side indexer).** On-chain
  `checkIn()` only emits a `CheckedIn` event; `web3/useVaultEvents.ts` reads
  those via `eth_getLogs` with an adaptive probe (whole window → 9000 → 1900
  → 450 blocks) so it works across providers with different range caps, then
  derives the streak (consecutive UTC days ending today/yesterday). When the
  RPC can't serve logs at all the UI says "Streak unavailable" instead of a
  false "0". Verified live on Base Sepolia and end-to-end against anvil.

- **USD valuation.** No on-chain price oracle in V1. `token.price` is optional;
  USD figures are shown only when a price is available (otherwise hidden /
  "—"), rather than faking a value.

- **Token registry.** Prototype hardcodes a token list (sym/name/color/price).
  On Base Sepolia these are arbitrary test ERC-20s. `web3/tokenRegistry.ts`
  (Stage 3) resolves known addresses → {sym,name,color,decimals}; unknown
  tokens fall back to symbol/decimals read on-chain + a default color +
  shortened address (never breaks on an unknown token).
