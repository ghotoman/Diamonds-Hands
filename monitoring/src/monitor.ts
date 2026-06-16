import {
  createPublicClient,
  http,
  parseAbi,
  parseAbiItem,
  getAddress,
  type Address,
  type PublicClient,
} from "viem";
import { base } from "viem/chains";

import {
  aggregateByAsset,
  computeTvl,
  evaluateLevel,
  makeThresholds,
  type AssetMeta,
  type VaultRef,
} from "./tvl.ts";

// ----------------------------------------------------------------------------
// Config (env). Only BASE_RPC_URL + FACTORY_ADDRESSES are required.
// ----------------------------------------------------------------------------

function reqEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env: ${key}`);
  return v;
}

const RPC_URL = reqEnv("BASE_RPC_URL");
const FACTORY_ADDRESSES = reqEnv("FACTORY_ADDRESSES")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((a) => getAddress(a));

/// First block to scan for VaultCreated (the earliest factory's deploy block).
/// Defaults to 0 but SET THIS — scanning from genesis is slow/expensive.
const START_BLOCK = BigInt(process.env.START_BLOCK ?? "0");
/// eth_getLogs range chunk. Conservative default — Ankr's Base endpoint caps
/// at ~3k blocks per request, Alchemy is fine with much larger, etc. If the
/// RPC complains "range too large", `fetchVaults` halves the step on the fly
/// (down to MIN_LOG_STEP) so any provider works without manual tuning.
const LOG_STEP = BigInt(process.env.LOG_STEP ?? "2000");
const MIN_LOG_STEP = 100n;

const HARD_USD = Number(process.env.THRESHOLD_USD ?? "1000000");
const WARN_RATIO = Number(process.env.WARN_RATIO ?? "0.8");
const THRESHOLDS = makeThresholds(HARD_USD, WARN_RATIO);

/// Optional: POST the report JSON here on WARN/CRITICAL (Slack/Discord/Telegram
/// bridge / any webhook). When unset, the monitor only prints + sets exit code.
const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL;
/// DefiLlama price API base (free, no key, covers most Base tokens).
const PRICE_API = process.env.PRICE_API ?? "https://coins.llama.fi";

// ----------------------------------------------------------------------------
// ABIs (minimal, inline — keeps this package self-contained)
// ----------------------------------------------------------------------------

const VAULT_CREATED = parseAbiItem(
  "event VaultCreated(address indexed owner, address indexed vault, address indexed asset, uint256 amount, uint256 unlockTimestamp, bool allowEarlyExit, address feeReceiver, uint16 maxPenaltyBps)",
);

const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

const factoryAbi = parseAbi(["function paused() view returns (bool)"]);

// ----------------------------------------------------------------------------
// Chain reads
// ----------------------------------------------------------------------------

/// Scan VaultCreated across all factories, chunked by LOG_STEP. Returns the
/// unique (vault, asset) pairs ever created.
async function fetchVaults(client: PublicClient, latest: bigint): Promise<VaultRef[]> {
  const refs: VaultRef[] = [];
  for (const factory of FACTORY_ADDRESSES) {
    // Adaptive chunk: start at LOG_STEP, halve on "range too large" (per-call
    // window, not global state — different providers may agree at different
    // sizes; we don't want to permanently shrink for everyone).
    let step = LOG_STEP;
    for (let from = START_BLOCK; from <= latest; ) {
      const to = from + step - 1n > latest ? latest : from + step - 1n;
      try {
        const logs = await client.getLogs({ address: factory, event: VAULT_CREATED, fromBlock: from, toBlock: to });
        for (const log of logs) {
          const vault = log.args.vault;
          const asset = log.args.asset;
          if (vault && asset) refs.push({ vault, asset });
        }
        from = to + 1n;
      } catch (e) {
        // Ankr's -32062 is overloaded: "Block range is too large" AND "Batch
        // size too large" share the code, so match on the message — only the
        // block-range variant should trigger halving. Other providers spell
        // it differently (Alchemy: "exceeds the maximum block range") so we
        // accept a few wordings, but always anchored to "block" or "range".
        const msg = String((e as Error)?.message ?? e).toLowerCase();
        const rangeTooLarge =
          (msg.includes("block range") && msg.includes("too large")) ||
          msg.includes("exceeds the maximum block range") ||
          msg.includes("query returned more than") ||
          msg.includes("range is too large");
        if (rangeTooLarge && step > MIN_LOG_STEP) {
          step = step / 2n < MIN_LOG_STEP ? MIN_LOG_STEP : step / 2n;
          console.error(`[info] RPC capped log range — retrying with step=${step}`);
          continue;
        }
        throw e;
      }
    }
  }
  return refs;
}

/// Read the current asset balance held by each vault (multicall).
async function fetchBalances(client: PublicClient, vaults: VaultRef[]): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>();
  if (vaults.length === 0) return out;
  const results = await client.multicall({
    allowFailure: true,
    contracts: vaults.map((v) => ({
      address: v.asset as Address,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [v.vault as Address],
    })),
  });
  results.forEach((r, i) => {
    const vault = vaults[i]!.vault.toLowerCase();
    out.set(vault, r.status === "success" ? (r.result as bigint) : 0n);
  });
  return out;
}

/// Read decimals + symbol for each unique asset (multicall).
async function fetchTokenMeta(
  client: PublicClient,
  assets: string[],
): Promise<Map<string, { decimals: number; symbol: string }>> {
  const out = new Map<string, { decimals: number; symbol: string }>();
  if (assets.length === 0) return out;
  const results = await client.multicall({
    allowFailure: true,
    contracts: assets.flatMap((a) => [
      { address: a as Address, abi: erc20Abi, functionName: "decimals" as const },
      { address: a as Address, abi: erc20Abi, functionName: "symbol" as const },
    ]),
  });
  assets.forEach((asset, i) => {
    const dec = results[i * 2];
    const sym = results[i * 2 + 1];
    out.set(asset.toLowerCase(), {
      decimals: dec?.status === "success" ? Number(dec.result as number) : 18,
      symbol: sym?.status === "success" ? String(sym.result as string) : "?",
    });
  });
  return out;
}

// ----------------------------------------------------------------------------
// Prices (DefiLlama)
// ----------------------------------------------------------------------------

type LlamaResponse = { coins?: Record<string, { price?: number }> };

/// Fetch USD prices for the given Base token addresses. Missing tokens map to
/// null (excluded from TVL, surfaced for manual review).
async function fetchPrices(assets: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  for (const a of assets) out.set(a.toLowerCase(), null);
  if (assets.length === 0) return out;

  const ids = assets.map((a) => `base:${a}`).join(",");
  const res = await fetch(`${PRICE_API}/prices/current/${ids}`);
  if (!res.ok) {
    console.error(`[warn] price API ${res.status} — treating all prices as unknown`);
    return out;
  }
  const data = (await res.json()) as LlamaResponse;
  for (const [id, v] of Object.entries(data.coins ?? {})) {
    const addr = id.split(":")[1]?.toLowerCase();
    if (addr && typeof v.price === "number") out.set(addr, v.price);
  }
  return out;
}

// ----------------------------------------------------------------------------
// Alerting
// ----------------------------------------------------------------------------

async function sendWebhook(payload: unknown): Promise<void> {
  if (!ALERT_WEBHOOK_URL) return;
  try {
    const res = await fetch(ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error(`[warn] webhook returned ${res.status}`);
  } catch (e) {
    console.error("[warn] webhook failed:", e);
  }
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function main(): Promise<void> {
  const client = createPublicClient({ chain: base, transport: http(RPC_URL) }) as PublicClient;

  const latest = await client.getBlockNumber();
  const vaults = await fetchVaults(client, latest);
  const balances = await fetchBalances(client, vaults);

  const lockedByAsset = aggregateByAsset(vaults, balances);
  const assets = [...lockedByAsset.keys()];

  const [chainMeta, prices] = await Promise.all([fetchTokenMeta(client, assets), fetchPrices(assets)]);

  const metaByAsset = new Map<string, AssetMeta>();
  for (const a of assets) {
    const m = chainMeta.get(a) ?? { decimals: 18, symbol: "?" };
    metaByAsset.set(a, { decimals: m.decimals, symbol: m.symbol, priceUsd: prices.get(a) ?? null });
  }

  const report = computeTvl(lockedByAsset, metaByAsset);
  const level = evaluateLevel(report.tvlUsd, THRESHOLDS);

  // paused() status per factory (context for the alert).
  const paused = await Promise.all(
    FACTORY_ADDRESSES.map(async (f) => {
      try {
        return { factory: f, paused: await client.readContract({ address: f, abi: factoryAbi, functionName: "paused" }) };
      } catch {
        return { factory: f, paused: null };
      }
    }),
  );

  const summary = {
    timestamp: new Date().toISOString(),
    chainId: base.id,
    block: latest.toString(),
    level,
    tvlUsd: Math.round(report.tvlUsd),
    cap: THRESHOLDS.hardUsd,
    warnAt: THRESHOLDS.warnUsd,
    pctOfCap: Number(((report.tvlUsd / THRESHOLDS.hardUsd) * 100).toFixed(1)),
    vaultCount: vaults.length,
    factories: paused,
    assets: report.assets.map((a) => ({
      symbol: a.symbol,
      asset: a.asset,
      locked: a.locked,
      priceUsd: a.priceUsd,
      valueUsd: Math.round(a.valueUsd),
    })),
    unknownPriceAssets: report.unknownPriceAssets.map((a) => ({ symbol: a.symbol, asset: a.asset, locked: a.locked })),
  };

  console.log(JSON.stringify(summary, null, 2));

  if (report.unknownPriceAssets.length > 0) {
    console.error(
      `[warn] ${report.unknownPriceAssets.length} asset(s) with locked balance have NO price and are excluded from TVL — review manually.`,
    );
  }

  if (level !== "OK") {
    const emoji = level === "CRITICAL" ? "🚨" : "⚠️";
    const text =
      `${emoji} Diamond Hands TVL ${level}: $${summary.tvlUsd.toLocaleString()} ` +
      `(${summary.pctOfCap}% of $${THRESHOLDS.hardUsd.toLocaleString()} cap). ` +
      (level === "CRITICAL"
        ? "Cap breached — multisig should PAUSE the factory now."
        : "Approaching cap — prepare to pause.");
    // `content` → Discord, `text` → Slack; structured fields for custom sinks.
    // Sending all three keys makes one webhook URL work across the common channels.
    await sendWebhook({ content: text, text, level, summary });
    console.error(text);
  }

  // Exit codes: OK=0, WARN=0 (logged), CRITICAL=1 (fail the job → notify).
  process.exit(level === "CRITICAL" ? 1 : 0);
}

main().catch((e) => {
  console.error("[fatal]", e);
  process.exit(2);
});
