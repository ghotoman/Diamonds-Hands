import { useEffect, useState } from "react";
import type { Address } from "viem";

import { useProfile } from "../web3/useProfile";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { Label } from "./Label";

const MAX_NAME = 32;
const MAX_LINK = 200;
const bytes = (s: string) => new TextEncoder().encode(s).length;

/// Edit the connected wallet's on-chain profile (DiamondHandsRegistry).
/// Prefills from the current profile; saving writes name + link on-chain.
/// Clearing both fields and saving removes the entry.
export function ProfileModal({
  open,
  address,
  onClose,
  onConfirm,
}: {
  open: boolean;
  address?: Address;
  onClose: () => void;
  onConfirm: (name: string, link: string) => void;
}) {
  const { profile } = useProfile(open ? address : undefined);
  const [name, setName] = useState("");
  const [link, setLink] = useState("");

  // Re-seed the form whenever it opens (or the fetched profile arrives).
  useEffect(() => {
    if (open) {
      setName(profile?.name ?? "");
      setLink(profile?.link ?? "");
    }
  }, [open, profile?.name, profile?.link]);

  const nameOver = bytes(name) > MAX_NAME;
  const linkOver = bytes(link) > MAX_LINK;

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-[22px] font-bold text-ink leading-tight">Your profile</h2>
      <p className="mt-1 text-[14px] text-sub">
        Show a name instead of your address across Diamond Hands. Stored on-chain — clear both fields to remove it.
      </p>

      <div className="mt-5">
        <Label className="mb-2">Display name</Label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ghotoman.eth"
          spellCheck={false}
          className="w-full rounded-xl border border-line bg-surface px-4 h-12 text-[15px] text-ink outline-none focus:border-baseblue"
        />
        <div className={"mt-1 text-right text-[12px] " + (nameOver ? "text-danger" : "text-sub")}>
          {MAX_NAME - bytes(name)} left
        </div>
      </div>

      <div className="mt-3">
        <Label className="mb-2">Link</Label>
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://x.com/ghotoman_x"
          spellCheck={false}
          inputMode="url"
          className="w-full rounded-xl border border-line bg-surface px-4 h-12 text-[15px] text-ink outline-none focus:border-baseblue"
        />
        <div className={"mt-1 text-right text-[12px] " + (linkOver ? "text-danger" : "text-sub")}>
          {MAX_LINK - bytes(link)} left
        </div>
      </div>

      <Button className="w-full mt-4" disabled={nameOver || linkOver} onClick={() => onConfirm(name.trim(), link.trim())}>
        Save profile
      </Button>
    </Modal>
  );
}
