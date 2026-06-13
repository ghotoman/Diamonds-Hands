import { keccak256, slice, toHex, type Hex } from "viem";

/// Base attribution — Builder Code bc_oikqsbrk.
/// Tags our transactions so Base credits this app on leaderboards / builder
/// rewards. Mirrors Base Account's "auto" attribution: the first 16 bytes of
/// keccak256(dapp origin), appended to calldata as a viem `dataSuffix`.
/// Attribution is keyed to the verified domain (diamonds-hands.vercel.app) we
/// registered under this code — the literal code isn't encoded on-chain.
/// Contracts ignore the trailing bytes, so it never affects execution.
export const BUILDER_CODE = "bc_oikqsbrk";

/// 16-byte attribution suffix for the current origin (undefined off-window).
/// On localhost it hashes localhost and simply isn't attributed — exactly how
/// Base's auto mode behaves.
export const DATA_SUFFIX: Hex | undefined =
  typeof window !== "undefined" && window.location?.origin
    ? slice(keccak256(toHex(window.location.origin)), 0, 16)
    : undefined;
