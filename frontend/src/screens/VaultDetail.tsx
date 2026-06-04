import { useEffect, useState } from "react";
import type { Vault } from "../types";
import {
  countdown,
  currentPenaltyPct,
  DAY,
  daysHeld,
  daysTotal,
  fmtNum,
  fmtUsd,
  isUnlocked,
  usd,
  vaultProgress,
} from "../lib/helpers";
import { explorerAddress } from "../web3/contracts";
import { Icon } from "../components/Icon";
import { TokenBadge } from "../components/TokenBadge";
import { ModeBadge } from "../components/Badge";
import { ProgressBar } from "../components/ProgressBar";
import { Button } from "../components/Button";
import { Label } from "../components/Label";
import { Modal } from "../components/Modal";
import { PenaltyCurve } from "../components/PenaltyCurve";

export type ActionKind = "withdraw" | "emergency" | "topup" | "extend" | "checkin";

export function VaultDetail({
  v,
  now,
  onBack,
  onAction,
}: {
  v: Vault;
  now: number;
  onBack: () => void;
  onAction: (kind: ActionKind, v: Vault) => void;
}) {
  const unlocked = isUnlocked(v, now);
  const prog = vaultProgress(v, now);
  const held = daysHeld(v, now);
  const total = daysTotal(v);
  const remain = Math.max(0, total - held);
  const cd = countdown(v.unlock, now);
  const pen = currentPenaltyPct(v, now);
  const closeSoon = !unlocked && cd.days <= 3;
  const checkedToday = v.lastCheckIn !== undefined && now - v.lastCheckIn < DAY;

  const TimeBox = ({ n, l }: { n: number; l: string }) => (
    <div className="flex-1 rounded-xl bg-surface py-3 text-center">
      <div className="text-[28px] font-bold text-ink tabular-nums leading-none">{String(n).padStart(2, "0")}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-sub font-semibold">{l}</div>
    </div>
  );

  return (
    <div className="pb-8">
      <div className="px-5 pt-3 flex items-center">
        <button onClick={onBack} className="grid place-items-center w-11 h-11 -ml-2 rounded-xl text-ink active:bg-surface">
          <Icon name="chevronLeft" size={22} />
        </button>
        <span className="text-[15px] font-semibold text-ink">Vault</span>
      </div>

      {/* primary accent — amount + token */}
      <div className="px-6 pt-4 text-center">
        <div className="mx-auto mb-3 inline-block">
          <TokenBadge sym={v.token.sym} color={v.token.color} size={56} />
        </div>
        <div className="flex items-center justify-center gap-2 text-[15px] text-sub mb-1">
          {v.token.sym} · <ModeBadge mode={v.mode} />
        </div>
        <div className="text-[44px] font-bold text-ink leading-none tracking-tight tabular-nums">{fmtNum(v.amount)}</div>
        <div className="mt-2 text-[15px] text-sub">≈ {fmtUsd(usd(v))} locked</div>
      </div>

      {/* status block */}
      {v.status === "withdrawn" ? (
        <div className="mx-5 mt-6 rounded-2xl bg-surface border border-line p-5 text-center text-sub text-[14px]">
          Vault closed · tokens withdrawn
        </div>
      ) : unlocked ? (
        <div className="mx-5 mt-6 rounded-2xl bg-[#00B3410F] border border-[#00B34133] p-5 text-center">
          <div className="grid place-items-center w-12 h-12 rounded-full bg-success text-white mx-auto mb-2">
            <Icon name="check" size={26} stroke={2.6} />
          </div>
          <div className="text-[18px] font-bold text-ink">Unlocked 🎉</div>
          <div className="mt-1 text-[14px] text-sub">You held the full {total} days. Withdraw 100%.</div>
        </div>
      ) : (
        <div className="mx-5 mt-6">
          <Label className="text-center mb-2">{closeSoon ? "Almost there" : "Until unlock"}</Label>
          <div className="flex gap-2">
            <TimeBox n={cd.days} l="days" />
            <TimeBox n={cd.hrs} l="hours" />
            <TimeBox n={cd.mins} l="mins" />
            <TimeBox n={cd.secs} l="secs" />
          </div>
          <div className="mt-4">
            <ProgressBar value={prog} tone={closeSoon ? "warning" : "blue"} height={10} />
            <div className="mt-2 flex justify-between text-[13px]">
              <span className="text-sub">
                Held <b className="text-ink">{held}</b>d
              </span>
              <span className="text-sub">
                <b className="text-ink">{remain}</b>d left
              </span>
            </div>
          </div>
          {v.mode === "soft" && (
            <div className="mt-4 rounded-2xl bg-surface border border-line p-5">
              <div className="flex items-center justify-between mb-1">
                <Label className="whitespace-nowrap">Penalty now</Label>
                <span className="text-[20px] font-bold text-ink tabular-nums">{pen.toFixed(1)}%</span>
              </div>
              <PenaltyCurve startPenalty={v.startPenalty ?? 0} progress={prog} />
              <p className="mt-1 text-[12px] text-sub text-center">The longer you hold, the smaller the penalty.</p>
            </div>
          )}
        </div>
      )}

      {/* check-in streak */}
      {v.status === "active" && !unlocked && (
        <div className="mx-5 mt-4 flex items-center gap-3 rounded-2xl bg-surface border border-line p-4">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-[#F59E0B14] text-warning">
            <Icon name="flame" size={20} />
          </span>
          <div className="flex-1">
            <div className="text-[14px] font-semibold text-ink">
              {v.checkIns !== undefined ? `${v.checkIns} check-ins in a row` : "Daily check-in"}
            </div>
            <div className="text-[12px] text-sub">
              {checkedToday
                ? "Checked in today ✓"
                : v.checkIns !== undefined
                  ? "Not checked in today"
                  : "Build your streak on-chain"}
            </div>
          </div>
          <Button
            size="sm"
            variant={checkedToday ? "secondary" : "primary"}
            disabled={checkedToday}
            onClick={() => onAction("checkin", v)}
          >
            {checkedToday ? "Done" : "Check in"}
          </Button>
        </div>
      )}

      {/* contextual actions */}
      <div className="px-5 mt-6">
        {v.status === "withdrawn" ? null : unlocked ? (
          <Button className="w-full" variant="primary" onClick={() => onAction("withdraw", v)}>
            <Icon name="arrowUp" size={18} stroke={2.4} />
            Withdraw all · {fmtNum(v.amount)} {v.token.sym}
          </Button>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <Button variant="secondary" onClick={() => onAction("topup", v)}>
                <Icon name="plusCircle" size={18} />
                Top up
              </Button>
              <Button variant="secondary" onClick={() => onAction("extend", v)}>
                <Icon name="clock" size={18} />
                Extend
              </Button>
            </div>
            {v.mode === "soft" && (
              <Button variant="ghost" className="w-full text-sub hover:text-ink" onClick={() => onAction("emergency", v)}>
                Exit early with a penalty
              </Button>
            )}
          </div>
        )}
      </div>

      {/* on-chain proof */}
      <div className="px-5 mt-6">
        <a
          className="flex items-center justify-between rounded-xl bg-surface border border-line px-4 h-12 text-[13px] active:scale-[.99]"
          href={explorerAddress(v.address)}
          target="_blank"
          rel="noreferrer"
        >
          <span className="text-sub">Vault contract</span>
          <span className="flex items-center gap-1.5 font-semibold text-baseblue">
            {v.address.slice(0, 6)}…{v.address.slice(-4)}
            <Icon name="external" size={15} />
          </span>
        </a>
        <div className="mt-2 text-center text-[11px] text-sub">Open in BaseScan · your vault on-chain</div>
      </div>
    </div>
  );
}

// ── Emergency Exit modal ──
export function EmergencyModal({
  open,
  v,
  now,
  onClose,
  onConfirm,
}: {
  open: boolean;
  v: Vault | null;
  now: number;
  onClose: () => void;
  onConfirm: (v: Vault) => void;
}) {
  if (!v) return null;
  const pen = currentPenaltyPct(v, now);
  const penaltyTokens = (v.amount * pen) / 100;
  const receive = v.amount - penaltyTokens;
  const held = daysHeld(v, now);
  const remain = Math.max(0, daysTotal(v) - held);
  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-[22px] font-bold text-ink leading-tight">Exit now?</h2>
      <p className="mt-1 text-[14px] text-sub">You can withdraw early — but not all of it.</p>

      <div className="mt-5 rounded-2xl border border-[#E11D4833] bg-[#E11D4808] p-5 text-center">
        <div className="text-[13px] font-semibold text-danger uppercase tracking-wide">Penalty {pen.toFixed(1)}%</div>
        <div className="mt-1 text-[36px] font-bold text-danger leading-none tabular-nums">−{fmtNum(penaltyTokens)}</div>
        <div className="mt-1 text-[14px] text-danger/80">
          {v.token.sym} you'll lose · ≈ {fmtUsd(v.token.price === undefined ? undefined : v.token.price * penaltyTokens)}
        </div>
      </div>

      <div className="mt-3 flex items-stretch rounded-2xl border border-line overflow-hidden">
        <div className="flex-1 p-4 text-center">
          <div className="text-[12px] text-sub">You get now</div>
          <div className="mt-1 text-[20px] font-bold text-ink tabular-nums">{fmtNum(receive)}</div>
        </div>
        <div className="w-px bg-line" />
        <div className="flex-1 p-4 text-center">
          <div className="text-[12px] text-sub">If you wait</div>
          <div className="mt-1 text-[20px] font-bold text-success tabular-nums">{fmtNum(v.amount)}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 rounded-xl bg-surface p-3">
        <Icon name="flame" size={20} className="text-warning shrink-0" />
        <span className="text-[14px] text-ink">
          You've held <b>{held} days</b>. Only <b>{remain}</b> left. A shame to quit at the finish.
        </span>
      </div>

      <div className="mt-5 flex flex-col gap-2.5">
        <Button className="w-full" onClick={onClose}>
          Changed my mind, I'm staying 💎
        </Button>
        <Button variant="ghost" className="w-full text-sub" onClick={() => onConfirm(v)}>
          Exit anyway and lose {fmtNum(penaltyTokens)} {v.token.sym}
        </Button>
      </div>
    </Modal>
  );
}

// ── Generic action sheet — top up / extend ──
export function ActionSheet({
  open,
  kind,
  v,
  onClose,
  onConfirm,
}: {
  open: boolean;
  kind: "topup" | "extend" | null;
  v: Vault | null;
  onClose: () => void;
  onConfirm: (kind: "topup" | "extend", v: Vault, num: number) => void;
}) {
  const [val, setVal] = useState("");
  useEffect(() => {
    if (open) setVal("");
  }, [open, kind]);
  if (!v || (kind !== "topup" && kind !== "extend")) return null;
  const t = v.token;
  const isTop = kind === "topup";
  const num = parseFloat(val) || 0;
  const over = isTop && t.balance !== undefined && num > t.balance;
  const ok = num > 0 && !over;
  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-[22px] font-bold text-ink">{isTop ? "Top up vault" : "Extend term"}</h2>
      <p className="mt-1 text-[14px] text-sub">
        {isTop ? `Add more ${t.sym} to this vault.` : "The term can only be increased — not decreased."}
      </p>
      <div className="mt-4 rounded-2xl bg-surface border border-line p-4">
        <div className="flex items-baseline gap-2">
          <input
            value={val}
            onChange={(e) => setVal(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            placeholder="0"
            className="w-full bg-transparent outline-none text-[32px] font-bold text-ink tabular-nums placeholder:text-line"
          />
          <span className="text-[16px] font-semibold text-sub">{isTop ? t.sym : "days"}</span>
        </div>
        {isTop && (
          <div className="mt-1 flex justify-between text-[13px]">
            <span className="text-sub">Balance {fmtNum(t.balance ?? 0)}</span>
            <button onClick={() => setVal(String(t.balance ?? 0))} className="font-bold text-baseblue">
              MAX
            </button>
          </div>
        )}
        {!isTop && (
          <div className="mt-2 flex gap-2">
            {[30, 90, 180].map((d) => (
              <button
                key={d}
                onClick={() => setVal(String(d))}
                className="flex-1 h-9 rounded-lg bg-white border border-line text-[13px] font-semibold text-ink"
              >
                +{d}d
              </button>
            ))}
          </div>
        )}
      </div>
      {over && <div className="mt-2 text-[13px] text-danger">Not enough balance</div>}
      <div className="mt-5 flex flex-col gap-2.5">
        <Button className="w-full" disabled={!ok} onClick={() => onConfirm(kind, v, num)}>
          {isTop ? "Top up" : "Extend"}
        </Button>
        <Button variant="ghost" className="w-full text-sub" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
