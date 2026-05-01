import { DocumentStatus } from "@prisma/client"
import { describe, expect, it } from "vitest"

import {
  createDocumentBodySchema,
  downloadQuerySchema,
  listDocumentsQuerySchema,
  patchDocumentBodySchema,
  uuidParamSchema,
} from "./document.schemas.js"

describe("document.schemas", () => {
  it("uuidParamSchema accepts a UUID", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000"
    expect(uuidParamSchema.safeParse({ id }).success).toBe(true)
  })

  it("uuidParamSchema rejects malformed id", () => {
    expect(uuidParamSchema.safeParse({ id: "abc" }).success).toBe(false)
  })

  it("listDocumentsQuerySchema applies defaults and coerces page", () => {
    const result = listDocumentsQuerySchema.safeParse({
      page: "2",
      limit: "10",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(2)
      expect(result.data.limit).toBe(10)
    }
  })

  it("listDocumentsQuerySchema accepts optional status", () => {
    const result = listDocumentsQuerySchema.safeParse({
      status: DocumentStatus.DRAFT,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe(DocumentStatus.DRAFT)
    }
  })

  it("createDocumentBodySchema enforces title bounds", () => {
    expect(createDocumentBodySchema.safeParse({ title: "Ok" }).success).toBe(
      true,
    )
    expect(createDocumentBodySchema.safeParse({ title: "" }).success).toBe(
      false,
    )
  })

  it("patchDocumentBodySchema rejects unknown keys", () => {
    const result = patchDocumentBodySchema.safeParse({ title: "T", extra: 1 })
    expect(result.success).toBe(false)
  })

  it("downloadQuerySchema accepts original or signed", () => {
    expect(downloadQuerySchema.safeParse({ type: "original" }).success).toBe(
      true,
    )
    expect(downloadQuerySchema.safeParse({ type: "signed" }).success).toBe(
      true,
    )
    expect(downloadQuerySchema.safeParse({ type: "other" }).success).toBe(
      false,
    )
  })
})
