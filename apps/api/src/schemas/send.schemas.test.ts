import { describe, expect, it } from "vitest"

import { sendDocumentBodySchema } from "./send.schemas.js"

describe("send.schemas", () => {
  it("accepts valid recipient payload", () => {
    const result = sendDocumentBodySchema.safeParse({
      recipientName: "Jane Doe",
      recipientEmail: "jane@example.com",
    })
    expect(result.success).toBe(true)
  })

  it("rejects empty name", () => {
    const result = sendDocumentBodySchema.safeParse({
      recipientName: "",
      recipientEmail: "jane@example.com",
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid email", () => {
    const result = sendDocumentBodySchema.safeParse({
      recipientName: "Jane",
      recipientEmail: "not-an-email",
    })
    expect(result.success).toBe(false)
  })
})
