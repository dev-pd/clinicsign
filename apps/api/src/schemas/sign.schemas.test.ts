import { describe, expect, it } from "vitest"

import {
  completeSigningBodySchema,
  signTokenParamSchema,
} from "./sign.schemas.js"

describe("sign.schemas", () => {
  describe("signTokenParamSchema", () => {
    it("accepts a 64-char hex token", () => {
      const token = "a".repeat(64)
      expect(signTokenParamSchema.safeParse({ token }).success).toBe(true)
    })

    it("rejects wrong length", () => {
      expect(signTokenParamSchema.safeParse({ token: "ab" }).success).toBe(
        false,
      )
    })

    it("rejects non-hex characters", () => {
      const token = `${"a".repeat(62)}zz`
      expect(signTokenParamSchema.safeParse({ token }).success).toBe(false)
    })
  })

  describe("completeSigningBodySchema", () => {
    it("accepts empty fieldValues", () => {
      const result = completeSigningBodySchema.safeParse({ fieldValues: [] })
      expect(result.success).toBe(true)
    })

    it("accepts valid field entries", () => {
      const result = completeSigningBodySchema.safeParse({
        fieldValues: [
          {
            fieldId: "550e8400-e29b-41d4-a716-446655440000",
            value: "yes",
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it("rejects invalid fieldId", () => {
      const result = completeSigningBodySchema.safeParse({
        fieldValues: [{ fieldId: "not-a-uuid", value: "x" }],
      })
      expect(result.success).toBe(false)
    })
  })
})
