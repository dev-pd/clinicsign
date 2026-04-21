import { createHash, randomBytes } from "node:crypto";

/** Raw signing token sent in URL / email (never store this). */
export function generateSigningTokenRaw(): string {
  return randomBytes(32).toString("hex");
}

export function hashSigningToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export const SIGNING_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
