import { describe, expect, it } from "vitest"

import {
  AppError,
  badRequest,
  conflict,
  forbidden,
  notFound,
  unauthorized,
} from "./errors.js"

describe("errors", () => {
  it("AppError carries code, message, statusCode, and name", () => {
    const err = new AppError("CODE", "message", 418)
    expect(err.code).toBe("CODE")
    expect(err.message).toBe("message")
    expect(err.statusCode).toBe(418)
    expect(err.name).toBe("AppError")
  })

  it("helper factories set expected status codes", () => {
    expect(notFound("a", "m").statusCode).toBe(404)
    expect(badRequest("a", "m").statusCode).toBe(400)
    expect(unauthorized("a", "m").statusCode).toBe(401)
    expect(forbidden("a", "m").statusCode).toBe(403)
    expect(conflict("a", "m").statusCode).toBe(409)
  })
})
