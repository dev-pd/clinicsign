import { describe, expect, it } from "vitest"

import {
  generateSigningTokenRaw,
  hashSigningToken,
  SIGNING_TOKEN_TTL_MS,
} from "./token.service.js"

describe("token.service", () => {
  it("generateSigningTokenRaw returns 64 lowercase hex chars", () => {
    const raw = generateSigningTokenRaw()
    expect(raw).toMatch(/^[a-f0-9]{64}$/)
  })

  it("generateSigningTokenRaw returns different values across calls", () => {
    const a = generateSigningTokenRaw()
    const b = generateSigningTokenRaw()
    expect(a).not.toBe(b)
  })

  it("hashSigningToken is deterministic", () => {
    const raw = "a".repeat(64)
    expect(hashSigningToken(raw)).toBe(hashSigningToken(raw))
  })

  it("hashSigningToken differs for different raw tokens", () => {
    const rawA = "a".repeat(64)
    const rawB = "b".repeat(64)
    expect(hashSigningToken(rawA)).not.toBe(hashSigningToken(rawB))
  })

  it("SIGNING_TOKEN_TTL_MS is seven days in milliseconds", () => {
    expect(SIGNING_TOKEN_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })
})
