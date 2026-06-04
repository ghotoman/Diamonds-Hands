import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

/// Transaction-overlay state (shared by the live write layer and the demo runner).
export type TxStage = "wallet" | "pending" | "success" | "error";
export type TxErrorKind = "rejected" | "gas" | "approve" | "generic";

export type TxState = {
  stage: TxStage;
  title: string;
  sub?: string;
  /// full tx hash — the overlay shortens it for display + BaseScan link
  hash?: string;
  error?: string;
  errorKind?: TxErrorKind;
  /// re-run the same flow from the error overlay's "Try again"
  _retry?: () => void;
} | null;

export type SetTx = (tx: TxState) => void;

type Parsed = { kind: TxErrorKind; title: string; message: string };

/// Friendly copy for each on-chain custom error (Factory + Vault + ERC-20).
const ERROR_COPY: Record<string, Parsed> = {
  HardLockNoExit: { kind: "generic", title: "No early exit", message: "This vault is hard-locked — there's no exit before the unlock date." },
  NotWithdrawable: { kind: "generic", title: "Not unlocked yet", message: "This vault hasn't reached its unlock date." },
  AlreadyWithdrawn: { kind: "generic", title: "Already closed", message: "This vault has already been withdrawn." },
  UseWithdrawInstead: { kind: "generic", title: "Already unlocked", message: "The lock is over — use Withdraw for the full amount." },
  TopUpAfterUnlock: { kind: "generic", title: "Can't top up", message: "The lock is over — top-ups are closed." },
  ExtendAfterUnlock: { kind: "generic", title: "Can't extend", message: "The lock is over — it can't be extended." },
  ExtendMustIncrease: { kind: "generic", title: "Pick a later date", message: "The new term must be later than the current one." },
  UnlockTooSoon: { kind: "generic", title: "Term too short", message: "The lock must be at least 7 days." },
  UnlockTooFar: { kind: "generic", title: "Term too long", message: "The lock can't exceed 5 years." },
  InvalidPenaltyForSoftMode: { kind: "generic", title: "Penalty out of range", message: "Soft-mode penalty must be between 5% and 30%." },
  InvalidPenaltyForHardMode: { kind: "generic", title: "Penalty not allowed", message: "Hard mode can't carry a penalty." },
  MaxPenaltyMismatch: { kind: "generic", title: "Penalty mismatch", message: "Penalty doesn't match the chosen mode." },
  EnforcedPause: { kind: "generic", title: "Creation paused", message: "New vaults are paused right now. Try again later." },
  NotOwner: { kind: "generic", title: "Not your vault", message: "Only the vault owner can do this." },
  AmountZero: { kind: "generic", title: "Enter an amount", message: "The amount must be greater than zero." },
  InvalidAsset: { kind: "generic", title: "Unsupported token", message: "This token can't be locked." },
  EthNotSupported: { kind: "generic", title: "ERC-20 only", message: "Lock an ERC-20 token — native ETH isn't supported. Wrap it to WETH first." },
  TransferReceivedZero: { kind: "approve", title: "Transfer failed", message: "No tokens were received. Check your balance and approval." },
  ERC20InsufficientAllowance: { kind: "approve", title: "Approve needed", message: "Token access isn't approved yet. Approve first, then try again." },
  ERC20InsufficientBalance: { kind: "generic", title: "Not enough balance", message: "You don't have enough of this token." },
  SafeERC20FailedOperation: { kind: "approve", title: "Token transfer failed", message: "The token transfer failed. Check your balance and approval." },
};

const REJECTED: Parsed = {
  kind: "rejected",
  title: "Signature rejected",
  message: "You rejected the transaction in your wallet. Nothing was charged — you can try again.",
};
const GAS: Parsed = {
  kind: "gas",
  title: "Not enough gas",
  message: "Not enough ETH for gas on Base. Top up and try again.",
};
const FALLBACK: Parsed = {
  kind: "generic",
  title: "Something went wrong",
  message: "The transaction failed. Try again.",
};

/// Turn a viem/wagmi error into friendly overlay copy + an error kind.
export function parseTxError(err: unknown): Parsed {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return REJECTED;

    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? "";
      if (name && ERROR_COPY[name]) return ERROR_COPY[name];
    }

    const msg = (err.shortMessage || err.message || "").toLowerCase();
    if (/insufficient funds|exceeds the balance|gas required exceeds/.test(msg)) return GAS;
    if (/user rejected|user denied|rejected the request/.test(msg)) return REJECTED;
  }
  const m = String((err as { message?: string } | null)?.message ?? "").toLowerCase();
  if (/reject|denied|4001/.test(m)) return REJECTED;
  if (/insufficient funds/.test(m)) return GAS;
  return FALLBACK;
}
