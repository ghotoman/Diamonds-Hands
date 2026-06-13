# Diamond Hands — TVL Monitor

Off-chain guardrail for the **soft-launch TVL cap** (default **$1,000,000**).

The protocol contracts have **no on-chain cap** (vaults can lock any ERC-20, and
there is no universal on-chain USD oracle for arbitrary tokens — see
`docs/deploy.md` §11). This monitor enforces the cap the pragmatic way:

1. Scans `VaultCreated` events across the factory (and legacy factories).
2. Reads each vault's **current** asset balance on-chain (withdrawn vaults drop
   to zero automatically — this is live TVL, not cumulative inflow).
3. Prices each asset in USD (DefiLlama).
4. Compares total TVL to the cap and **alerts** at a warning level (80% by
   default) and at the cap, so the **multisig can `pause()` the factory**.

> **Why alert, not auto-pause?** Ownership is the multisig (no separate guardian
> role — that was the deliberate launch choice). `pause()` therefore needs
> multisig signatures; a single bot key cannot pause unilaterally. The monitor's
> job is to give the signers enough lead time. If you later want *unattended*
> auto-pause, add a guardian/pauser role to the factory (a contract change) and
> wire a key into this monitor.

## Run locally

```bash
cd monitoring
npm ci
cp .env.example .env   # fill BASE_RPC_URL, FACTORY_ADDRESSES, START_BLOCK
npm run monitor
```

Output is a JSON report. Exit codes: **0** = OK/WARN, **1** = CRITICAL (cap
breached), **2** = fatal error. On WARN/CRITICAL it also POSTs to
`ALERT_WEBHOOK_URL` if set.

```bash
npm test        # unit tests for the TVL math (offline, no RPC needed)
npm run typecheck
```

## Scheduled (GitHub Actions)

`.github/workflows/tvl-monitor.yml` runs this on a cron. It is **opt-in**: set
the repo variable `TVL_MONITOR_ENABLED=true` and these secrets:

| Secret | Notes |
| --- | --- |
| `BASE_RPC_URL` | private Base mainnet RPC |
| `FACTORY_ADDRESSES` | comma-separated; include legacy factories |
| `START_BLOCK` | factory creation block |
| `ALERT_WEBHOOK_URL` | optional Slack/Discord/Telegram webhook |

A CRITICAL result fails the job, so GitHub notifies watchers even without a
webhook.

## ⚠️ Limitations (read before relying on this as your only control)

- **Soft cap, not a hard guarantee.** TVL can overshoot between checks. Run it
  frequently and keep the warning buffer (80%) so the multisig can pause in
  time.
- **GitHub Actions cron is not real-time** — scheduled runs can be delayed
  5–30 min and (on private repos) consume Actions minutes. For a real $1M
  guardrail, run this on a **dedicated 1-minute cron / always-on watcher**, not
  only on GHA.
- **Price coverage.** Tokens DefiLlama doesn't price are **excluded** from the
  TVL number and listed under `unknownPriceAssets` — review them manually. A
  WETH/USDC-dominated soft-launch is well covered.
- **The actual stop is `pause()`** by the multisig. This tool only tells you
  *when*. Keep signers on standby during the soft-launch.
