import type { Vault } from "../types";
import {
  cx,
  countdown,
  currentPenaltyPct,
  daysHeld,
  daysTotal,
  fmtNum,
  fmtUsd,
  isUnlocked,
  usd,
  vaultProgress,
} from "../lib/helpers";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { TokenBadge } from "../components/TokenBadge";
import { ModeBadge, Badge } from "../components/Badge";
import { ProgressBar } from "../components/ProgressBar";
import { Button } from "../components/Button";
import { Label } from "../components/Label";

function VaultCard({ v, now, onOpen }: { v: Vault; now: number; onOpen: (a: string) => void }) {
  const unlocked = isUnlocked(v, now);
  const prog = vaultProgress(v, now);
  const held = daysHeld(v, now);
  const total = daysTotal(v);
  const cd = countdown(v.unlock, now);
  const closeSoon = !unlocked && cd.days <= 3;
  const pen = currentPenaltyPct(v, now);
  const withdrawn = v.status === "withdrawn";

  // close proximity → amber, available → green, else blue
  const tone = unlocked ? "success" : closeSoon ? "warning" : "blue";

  return (
    <button
      onClick={() => onOpen(v.address)}
      className={cx(
        "w-full text-left rounded-2xl bg-white border p-6 transition active:scale-[.99]",
        withdrawn ? "border-line opacity-70" : "border-line hover:border-[#D7D9E0]",
        unlocked && !withdrawn && "ring-2 ring-[#00B34133] border-[#00B34155]",
      )}
    >
      {/* row 1 — identity + amount */}
      <div className="flex items-center gap-3">
        <TokenBadge sym={v.token.sym} color={v.token.color} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[18px] font-bold text-ink leading-none">{v.token.sym}</span>
            <ModeBadge mode={v.mode} />
          </div>
          <div className="mt-1 text-[13px] text-sub">{fmtUsd(usd(v))}</div>
        </div>
        <div className="text-right">
          <div className="text-[24px] font-bold text-ink leading-none tabular-nums">{fmtNum(v.amount)}</div>
          <div className="mt-1 text-[12px] text-sub">{v.token.sym}</div>
        </div>
      </div>

      {withdrawn ? (
        <div className="mt-4 flex items-center gap-2 text-[13px] text-sub">
          <Icon name="check" size={15} /> Withdrawn · vault closed
        </div>
      ) : (
        <>
          {/* row 2 — progress + timer */}
          <div className="mt-5">
            <ProgressBar value={prog} tone={tone} />
            <div className="mt-2 flex items-center justify-between text-[13px]">
              <span className="text-sub">
                Held <b className="text-ink font-semibold">{held}</b> of {total} days
              </span>
              {unlocked ? (
                <Badge tone="success">
                  <Icon name="check" size={13} stroke={2.6} />
                  Available
                </Badge>
              ) : closeSoon ? (
                <Badge tone="warning">
                  <Icon name="clock" size={13} />
                  Soon · {cd.days}d {cd.hrs}h
                </Badge>
              ) : (
                <span className="text-ink font-semibold tabular-nums">
                  {cd.days}d {cd.hrs}h {cd.mins}m
                </span>
              )}
            </div>
          </div>
          {v.mode === "soft" && !unlocked && (
            <div className="mt-3 flex items-center justify-between rounded-xl bg-surface px-3 py-2 text-[13px]">
              <span className="text-sub">Early-exit penalty now</span>
              <span className="font-bold text-ink tabular-nums">{pen.toFixed(1)}%</span>
            </div>
          )}
        </>
      )}
    </button>
  );
}

export function Dashboard({
  vaults,
  now,
  onOpen,
  onCreate,
}: {
  vaults: Vault[];
  now: number;
  onOpen: (a: string) => void;
  onCreate: () => void;
}) {
  const active = vaults.filter((v) => v.status !== "withdrawn");
  const archive = vaults.filter((v) => v.status === "withdrawn");
  const sorted = [...active].sort((a, b) => {
    const ua = isUnlocked(a, now);
    const ub = isUnlocked(b, now);
    if (ua !== ub) return ua ? -1 : 1;
    return a.unlock - b.unlock;
  });

  if (vaults.length === 0) return <EmptyState onCreate={onCreate} />;

  const priced = active.filter((v) => usd(v) !== undefined);
  const totalUsd = priced.length ? priced.reduce((s, v) => s + (usd(v) as number), 0) : undefined;
  const availCount = active.filter((v) => isUnlocked(v, now)).length;

  return (
    <div className="pb-32">
      {/* summary */}
      <div className="px-5 pt-4">
        <Label>Total locked</Label>
        <div className="mt-1 flex items-end gap-2">
          <span className="text-[40px] font-bold text-ink leading-none tracking-tight tabular-nums">
            {fmtUsd(totalUsd)}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Badge tone="blue">
            <Icon name="lock" size={13} stroke={2.4} />
            {active.length} active
          </Badge>
          {availCount > 0 && (
            <Badge tone="success">
              <Icon name="check" size={13} stroke={2.6} />
              {availCount} to withdraw
            </Badge>
          )}
        </div>
      </div>

      {/* vault list */}
      <div className="mt-6 px-5 flex flex-col gap-4">
        {sorted.map((v) => (
          <VaultCard key={v.address} v={v} now={now} onOpen={onOpen} />
        ))}
      </div>

      {archive.length > 0 && (
        <div className="mt-7 px-5">
          <Label className="mb-3">Archive</Label>
          <div className="flex flex-col gap-4">
            {archive.map((v) => (
              <VaultCard key={v.address} v={v} now={now} onOpen={onOpen} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function EmptyState({ onCreate }: { onCreate: () => void }) {
  const features: Array<[Parameters<typeof Icon>[0]["name"], string, string]> = [
    ["lock", "Hard mode", "No exit until the date. Real commitment."],
    ["shield", "Soft mode", "Exit with a penalty that decays to the unlock date."],
    ["spark", "On-chain", "Your vault, your address. Visible on BaseScan."],
  ];
  return (
    <div className="px-6 pt-8 pb-32">
      <div className="rounded-2xl bg-surface border border-line p-7 text-center">
        <div className="mx-auto mb-5 grid place-items-center">
          <Logo size={60} />
        </div>
        <h1 className="text-[26px] font-bold text-ink leading-[1.15] tracking-tight text-balance">
          Lock your token — don't sell on emotion
        </h1>
        <p className="mt-4 text-[15px] text-sub leading-relaxed text-balance">
          Diamond Hands locks your tokens in a personal smart contract for a chosen term. Selling
          early is physically impossible.
        </p>
        <div className="mt-6 flex flex-col gap-3 text-left">
          {features.map(([ic, t, d]) => (
            <div key={t} className="flex gap-3 rounded-xl bg-white border border-line p-3">
              <span className="grid place-items-center w-9 h-9 rounded-lg bg-[#0000FF0F] text-baseblue shrink-0">
                <Icon name={ic} size={18} />
              </span>
              <div>
                <div className="text-[14px] font-semibold text-ink">{t}</div>
                <div className="text-[13px] text-sub leading-snug">{d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-6">
        <Button className="w-full" onClick={onCreate}>
          <Icon name="plus" size={20} stroke={2.4} />
          Create your first Vault
        </Button>
      </div>
    </div>
  );
}
