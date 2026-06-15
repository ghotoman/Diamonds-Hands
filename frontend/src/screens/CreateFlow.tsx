import { useState } from "react";
import { isAddress, type Address } from "viem";
import type { Token, VaultMode } from "../types";
import { cx, DAY, fmtNum, fmtUsd, fmtUsdPrecise, formatGrouped, PRESETS } from "../lib/helpers";
import { MOCK_TOKENS } from "../lib/mock";
import { useCustomToken } from "../web3/useTokens";
import { useFactoryLimits } from "../web3/useFactoryLimits";
import { useTokenPrice } from "../web3/usePrices";
import { Icon } from "../components/Icon";
import { TokenBadge } from "../components/TokenBadge";
import { ModeBadge } from "../components/Badge";
import { Button } from "../components/Button";
import { Label } from "../components/Label";
import { Spinner } from "../components/Spinner";
import { PenaltyCurve } from "../components/PenaltyCurve";

export type CreateForm = {
  token: Token;
  amount: number;
  days: number;
  mode: VaultMode;
  penalty?: number;
  needsApprove: boolean;
};

const TITLES = ["", "Pick a token", "How much to lock", "For how long", "Lock mode", "Confirm"];

export function CreateFlow({
  onCancel,
  onSubmit,
  tokens = MOCK_TOKENS,
  allowCustom = false,
}: {
  onCancel: () => void;
  onSubmit: (f: CreateForm) => void;
  tokens?: Token[];
  /// live mode: let the user paste any ERC-20 contract address
  allowCustom?: boolean;
}) {
  const [step, setStep] = useState(1);
  const [token, setToken] = useState<Token | null>(null);
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState(30);
  const [customDate, setCustomDate] = useState("");
  const [mode, setMode] = useState<VaultMode | null>(null);
  const [penalty, setPenalty] = useState(15);
  const [query, setQuery] = useState("");
  // live lock-term bounds of the active factory (fallback constants offline)
  const { minLockDays, maxLockDays } = useFactoryLimits();

  const t = token;
  const amt = parseFloat(amount) || 0;
  // block amounts above the (known) wallet balance — treat unknown/0 as 0 so a
  // token you don't actually hold can't reach Lock and revert in the wallet.
  const overBalance = !!t && amt > (t.balance ?? 0);
  const needsApprove = true; // mock: first lock of a token always needs approve

  const canNext =
    (step === 1 && !!token) ||
    (step === 2 && amt > 0 && !overBalance) ||
    (step === 3 && days >= minLockDays && days <= maxLockDays) ||
    (step === 4 && (mode === "hard" || mode === "soft")) ||
    step === 5;

  const next = () => {
    if (step < 5) {
      setStep(step + 1);
    } else if (t && mode) {
      onSubmit({ token: t, amount: amt, days, mode, penalty: mode === "soft" ? penalty : undefined, needsApprove });
    }
  };
  const back = () => (step > 1 ? setStep(step - 1) : onCancel());

  const ACTION = step === 5 ? "Lock" : "Next";

  return (
    <div className="flex flex-col h-full">
      {/* header + step progress */}
      <div className="px-5 pt-3 pb-2">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={back}
            className="grid place-items-center w-11 h-11 -ml-2 rounded-xl text-ink active:bg-surface"
          >
            <Icon name="chevronLeft" size={22} />
          </button>
          <div className="flex-1 flex gap-1.5">
            {[1, 2, 3, 4, 5].map((s) => (
              <div
                key={s}
                className="h-1.5 flex-1 rounded-full transition-colors"
                style={{ background: s <= step ? "#0000FF" : "#EBECF0" }}
              />
            ))}
          </div>
        </div>
        <div className="text-[12px] font-semibold text-sub">STEP {step} OF 5</div>
        <h1 className="mt-1 text-[28px] font-bold text-ink leading-tight tracking-tight">{TITLES[step]}</h1>
      </div>

      {/* body */}
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {step === 1 && (
          <StepToken
            token={token}
            setToken={setToken}
            query={query}
            setQuery={setQuery}
            tokens={tokens}
            allowCustom={allowCustom}
          />
        )}
        {step === 2 && t && <StepAmount t={t} amount={amount} setAmount={setAmount} amt={amt} over={overBalance} needsApprove={needsApprove} />}
        {step === 3 && (
          <StepTerm
            days={days}
            setDays={setDays}
            customDate={customDate}
            setCustomDate={setCustomDate}
            minDays={minLockDays}
            maxDays={maxLockDays}
          />
        )}
        {step === 4 && <StepMode mode={mode} setMode={setMode} penalty={penalty} setPenalty={setPenalty} />}
        {step === 5 && t && mode && <StepConfirm t={t} amt={amt} days={days} mode={mode} penalty={penalty} needsApprove={needsApprove} />}
      </div>

      {/* sticky action */}
      <div className="px-5 pt-3 pb-5 bg-white border-t border-line">
        <Button className="w-full" disabled={!canNext} onClick={next}>
          {step === 5 && <Icon name="lock" size={18} stroke={2.4} />}
          {ACTION}
        </Button>
      </div>
    </div>
  );
}

// a selectable token row (shared by the known list + the custom-address result)
function TokenRow({
  t,
  selected,
  onSelect,
  badge,
}: {
  t: Token;
  selected: boolean;
  onSelect: () => void;
  badge?: string;
}) {
  return (
    <button
      onClick={onSelect}
      className={cx(
        "flex items-center gap-3 rounded-xl p-3 min-h-[60px] transition active:scale-[.99]",
        selected ? "bg-[#0000FF0A] ring-2 ring-baseblue" : "hover:bg-surface",
      )}
    >
      <TokenBadge sym={t.sym} color={t.color} size={40} />
      <div className="flex-1 text-left min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-ink truncate">{t.sym}</span>
          {badge && (
            <span className="shrink-0 rounded-md bg-[#0000FF12] text-baseblue text-[10px] font-bold px-1.5 py-0.5 uppercase tracking-wide">
              {badge}
            </span>
          )}
        </div>
        <div className="text-[13px] text-sub truncate">{t.name}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[15px] font-semibold text-ink tabular-nums">{fmtNum(t.balance ?? 0)}</div>
        <div className="text-[12px] text-sub">
          {t.price === undefined ? "—" : fmtUsd((t.balance ?? 0) * t.price)}
        </div>
      </div>
    </button>
  );
}

// ── Step 1 — token picker (search, or paste any ERC-20 address in live mode) ──
function StepToken({
  token,
  setToken,
  query,
  setQuery,
  tokens,
  allowCustom,
}: {
  token: Token | null;
  setToken: (t: Token) => void;
  query: string;
  setQuery: (q: string) => void;
  tokens: Token[];
  allowCustom: boolean;
}) {
  const q = query.trim();
  const isAddr = allowCustom && isAddress(q);
  const custom = useCustomToken(isAddr ? (q as Address) : undefined);
  const list = tokens.filter((t) => (t.sym + t.name).toLowerCase().includes(query.toLowerCase()));
  const isSel = (t: Token) => !!token && token.address.toLowerCase() === t.address.toLowerCase();

  return (
    <div>
      <div className="flex items-center gap-2 rounded-xl bg-surface border border-line px-3 h-12 mb-3">
        <Icon name="search" size={18} className="text-sub" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={allowCustom ? "Search or paste token address" : "Search token"}
          spellCheck={false}
          className="flex-1 bg-transparent outline-none text-[15px] text-ink placeholder:text-sub"
        />
      </div>

      {isAddr ? (
        <div className="flex flex-col gap-1">
          {custom.isLoading ? (
            <div className="flex items-center gap-3 p-3 min-h-[60px] text-sub text-[14px]">
              <Spinner size={20} /> Looking up token…
            </div>
          ) : custom.token ? (
            <TokenRow
              t={custom.token}
              selected={isSel(custom.token)}
              onSelect={() => setToken(custom.token!)}
              badge="custom"
            />
          ) : (
            <div className="flex gap-2 rounded-xl bg-[#E11D4808] border border-[#E11D4833] p-3 text-[13px] text-danger">
              <Icon name="info" size={16} className="shrink-0 mt-0.5" />
              <span>No ERC-20 found at this address on this network. Check the address and the network.</span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {list.map((t) => (
            <TokenRow key={t.address} t={t} selected={isSel(t)} onSelect={() => setToken(t)} />
          ))}
          {list.length === 0 && (
            <div className="text-center text-sub text-[14px] py-8">
              {allowCustom ? "Nothing found — paste a token contract address to add it." : "Nothing found"}
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex gap-2 rounded-xl bg-surface border border-line p-3 text-[13px] text-sub">
        <Icon name="info" size={16} className="shrink-0 mt-0.5 text-baseblue" />
        <span>
          {allowCustom ? (
            <>
              Paste any <b className="text-ink">ERC-20 contract address</b> to lock it. Want ETH? Wrap to{" "}
              <b className="text-ink">WETH</b> first.
            </>
          ) : (
            <>
              Want to lock ETH? Wrap it to <b className="text-ink">WETH</b> — the app does this automatically. The
              contract only works with ERC-20.
            </>
          )}
        </span>
      </div>
    </div>
  );
}

// ── Step 2 — amount ──
function StepAmount({
  t,
  amount,
  setAmount,
  amt,
  over,
  needsApprove,
}: {
  t: Token;
  amount: string;
  setAmount: (s: string) => void;
  amt: number;
  over: boolean;
  needsApprove: boolean;
}) {
  // Live USD via DefiLlama. Falls back to any preset `t.price` (mock list);
  // when both are missing we render an em-dash so it never lies about $0.
  const { price: livePrice, isLoading: priceLoading } = useTokenPrice(t.address);
  const price = livePrice ?? t.price;
  const usdValue = price !== undefined ? amt * price : undefined;
  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <TokenBadge sym={t.sym} color={t.color} size={36} />
        <div className="flex-1">
          <div className="text-[15px] font-semibold text-ink">{t.sym}</div>
          <div className="text-[12px] text-sub">Balance: {fmtNum(t.balance ?? 0)}</div>
        </div>
      </div>
      <div className={cx("rounded-2xl border p-5 transition-colors", over ? "border-danger bg-[#E11D4808]" : "border-line bg-surface")}>
        <div className="flex items-baseline gap-2">
          <input
            value={formatGrouped(amount)}
            onChange={(e) => {
              // Keep state RAW (no commas); the displayed value is grouped on
              // every render via formatGrouped. Strip everything but digits and
              // dots, then collapse multiple dots into the first one (so a
              // pasted "1,234.56.78" still parses as 1234.56).
              let v = e.target.value.replace(/[^0-9.]/g, "");
              const firstDot = v.indexOf(".");
              if (firstDot !== -1) {
                v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
              }
              setAmount(v);
            }}
            inputMode="decimal"
            placeholder="0"
            className="w-full bg-transparent outline-none text-[40px] font-bold text-ink tracking-tight tabular-nums placeholder:text-line"
          />
          <span className="text-[18px] font-semibold text-sub shrink-0">{t.sym}</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[14px] text-sub tabular-nums">
            ≈ {usdValue !== undefined ? fmtUsdPrecise(usdValue) : priceLoading ? "—" : "no price"}
          </span>
          <button
            onClick={() => setAmount(String(t.balance ?? 0))}
            className="rounded-lg bg-[#0000FF0F] text-baseblue text-[13px] font-bold px-3 h-8 active:scale-95"
          >
            MAX
          </button>
        </div>
      </div>
      {over && (
        <div className="mt-3 flex items-center gap-2 text-[14px] text-danger">
          <Icon name="info" size={16} />
          Not enough balance
        </div>
      )}
      {!over && amt > 0 && needsApprove && (
        <div className="mt-3 flex gap-2 rounded-xl bg-[#F59E0B12] border border-[#F59E0B33] p-3 text-[13px]">
          <Icon name="info" size={16} className="shrink-0 mt-0.5 text-warning" />
          <span className="text-ink">
            First you need to <b>approve</b> access to {t.sym}. That's the first of two transactions — shown before signing.
          </span>
        </div>
      )}
    </div>
  );
}

// ── Step 3 — term ──
function StepTerm({
  days,
  setDays,
  customDate,
  setCustomDate,
  minDays,
  maxDays,
}: {
  days: number;
  setDays: (d: number) => void;
  customDate: string;
  setCustomDate: (s: string) => void;
  minDays: number;
  maxDays: number;
}) {
  const unlockDate = new Date(Date.now() + days * DAY);
  const minLabel = minDays === 1 ? "1 day" : `${minDays} days`;
  return (
    <div>
      <div className="grid grid-cols-4 gap-2">
        {PRESETS.map((p) => {
          const tooShort = p.days < minDays;
          return (
            <button
              key={p.days}
              disabled={tooShort}
              onClick={() => {
                setDays(p.days);
                setCustomDate("");
              }}
              className={cx(
                "h-14 rounded-xl text-[15px] font-bold transition active:scale-95",
                days === p.days && !customDate
                  ? "bg-baseblue text-white shadow-cta"
                  : "bg-surface border border-line text-ink",
                tooShort && "opacity-40 pointer-events-none",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="mt-4">
        <Label className="mb-2">Or a custom date</Label>
        <label className="flex items-center gap-3 rounded-xl bg-surface border border-line px-4 h-13 min-h-[52px] cursor-pointer">
          <Icon name="calendar" size={20} className="text-sub" />
          <input
            type="date"
            value={customDate}
            min={new Date(Date.now() + minDays * DAY).toISOString().slice(0, 10)}
            max={new Date(Date.now() + maxDays * DAY).toISOString().slice(0, 10)}
            onChange={(e) => {
              setCustomDate(e.target.value);
              const d = Math.round((new Date(e.target.value).getTime() - Date.now()) / DAY);
              if (d >= minDays) setDays(d);
            }}
            className="flex-1 bg-transparent outline-none text-[15px] text-ink"
          />
        </label>
      </div>
      <div className="mt-5 rounded-2xl bg-[#0000FF0A] p-5 text-center">
        <div className="text-[13px] text-sub">Unlock</div>
        <div className="mt-1 text-[24px] font-bold text-ink">
          {unlockDate.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}
        </div>
        <div className="mt-1 text-[14px] text-baseblue font-semibold">in {days} {days === 1 ? "day" : "days"}</div>
      </div>
      <div className="mt-3 text-center text-[12px] text-sub">Min {minLabel} · max 5 years</div>
    </div>
  );
}

// ── Step 4 — mode ──
function StepMode({
  mode,
  setMode,
  penalty,
  setPenalty,
}: {
  mode: VaultMode | null;
  setMode: (m: VaultMode) => void;
  penalty: number;
  setPenalty: (p: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => setMode("hard")}
        className={cx(
          "text-left rounded-2xl border p-5 transition active:scale-[.99]",
          mode === "hard" ? "border-baseblue bg-[#0000FF0A] ring-2 ring-baseblue" : "border-line bg-white",
        )}
      >
        <div className="flex items-center gap-2">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-[#0000FF12] text-baseblue">
            <Icon name="lock" size={20} stroke={2.2} />
          </span>
          <div className="flex-1">
            <div className="text-[17px] font-bold text-ink">Hard mode</div>
            <div className="text-[13px] text-baseblue font-semibold">Real Diamond Hands</div>
          </div>
          {mode === "hard" && <Icon name="check" size={20} className="text-baseblue" stroke={2.6} />}
        </div>
        <p className="mt-3 text-[14px] text-sub leading-snug">
          You <b className="text-ink">can't</b> exit before the unlock date. No mercy, no penalties — because there's no exit.
        </p>
      </button>

      <button
        onClick={() => setMode("soft")}
        className={cx(
          "text-left rounded-2xl border p-5 transition active:scale-[.99]",
          mode === "soft" ? "border-baseblue bg-[#0000FF0A] ring-2 ring-baseblue" : "border-line bg-white",
        )}
      >
        <div className="flex items-center gap-2">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-surface border border-line text-ink">
            <Icon name="shield" size={20} stroke={2} />
          </span>
          <div className="flex-1">
            <div className="text-[17px] font-bold text-ink">Soft mode</div>
            <div className="text-[13px] text-sub font-semibold">Exit allowed, with a penalty</div>
          </div>
          {mode === "soft" && <Icon name="check" size={20} className="text-baseblue" stroke={2.6} />}
        </div>
        <p className="mt-3 text-[14px] text-sub leading-snug">
          Insurance, not a prison. Early exit is possible but penalized — and the penalty decays linearly to the unlock date.
        </p>
      </button>

      {mode === "soft" && (
        <div className="rounded-2xl bg-surface border border-line p-5 animate-[fade_.2s_ease-out]">
          <div className="flex items-center justify-between">
            <Label>Starting penalty</Label>
            <span className="text-[20px] font-bold text-ink tabular-nums">{penalty}%</span>
          </div>
          <input
            type="range"
            min="5"
            max="30"
            step="1"
            value={penalty}
            onChange={(e) => setPenalty(+e.target.value)}
            className="dh-range w-full mt-3"
            style={{ ["--p" as string]: ((penalty - 5) / 25) * 100 + "%" }}
          />
          <div className="flex justify-between text-[12px] text-sub mt-1">
            <span>5%</span>
            <span>30%</span>
          </div>
          <div className="mt-4">
            <PenaltyCurve startPenalty={penalty} progress={0} />
          </div>
          <p className="mt-1 text-[12px] text-sub text-center">Today {penalty}% · 0% at unlock</p>
        </div>
      )}
    </div>
  );
}

// ── Step 5 — confirm ──
function StepConfirm({
  t,
  amt,
  days,
  mode,
  penalty,
  needsApprove,
}: {
  t: Token;
  amt: number;
  days: number;
  mode: VaultMode;
  penalty: number;
  needsApprove: boolean;
}) {
  const unlock = new Date(Date.now() + days * DAY);
  const { price: livePrice } = useTokenPrice(t.address);
  const price = livePrice ?? t.price;
  const usdValue = price !== undefined ? amt * price : undefined;
  const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between py-3 border-b border-line last:border-0">
      <span className="text-[14px] text-sub">{k}</span>
      <span className="text-[15px] font-semibold text-ink text-right">{children}</span>
    </div>
  );
  return (
    <div>
      <div className="rounded-2xl bg-surface border border-line px-5 py-1">
        <div className="flex items-center gap-3 py-4 border-b border-line">
          <TokenBadge sym={t.sym} color={t.color} size={44} />
          <div className="flex-1">
            <div className="text-[24px] font-bold text-ink tabular-nums leading-none">
              {fmtNum(amt)} {t.sym}
            </div>
            <div className="mt-1 text-[13px] text-sub">≈ {fmtUsdPrecise(usdValue)}</div>
          </div>
        </div>
        <Row k="Term">{days} days</Row>
        <Row k="Unlock">{unlock.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}</Row>
        <Row k="Mode">{mode === "hard" ? <ModeBadge mode="hard" /> : <ModeBadge mode="soft" />}</Row>
        {mode === "soft" && <Row k="Starting penalty">{penalty}% → 0%</Row>}
        {needsApprove && <Row k="Transactions">Approve + Lock</Row>}
      </div>
      <div className="mt-3 flex gap-2 rounded-xl bg-[#F59E0B12] border border-[#F59E0B33] p-3 text-[13px]">
        <Icon name="info" size={16} className="shrink-0 mt-0.5 text-warning" />
        <span className="text-ink">
          After creation the <b>mode and penalty can't be changed</b>. The term can only be extended.
          This is an on-chain transaction on Base.
        </span>
      </div>
    </div>
  );
}
