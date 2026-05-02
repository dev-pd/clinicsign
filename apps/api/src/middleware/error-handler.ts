import { Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import type { Logger } from "pino";
import multer from "multer";
import { ZodError } from "zod";

import { env } from "../config/env.js";
import { logger as rootLogger } from "../config/logger.js";
import { AppError } from "../utils/errors.js";

function getLogger(req: Request): Logger {
  const log = (
    req as unknown as { log?: Logger }
  ).log;
  return log ?? rootLogger;
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // Express requires arity-4 for error middleware; no `next` in the success path.
  _next: NextFunction
): void {
  void _next;
  const log = getLogger(req);
  const requestId = req.id;

  if (err instanceof AppError) {
    log.warn({ err, requestId }, err.message);
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    log.warn({ err, requestId }, "Multipart upload error");
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "File too large (max 25MB)."
        : "File upload failed.";
    res.status(400).json({
      error: { code: "UPLOAD_ERROR", message },
    });
    return;
  }

  if (err instanceof ZodError) {
    log.warn({ err: err.flatten(), requestId }, "Validation error");
    const body: {
      error: {
        code: string;
        message: string;
        details?: ReturnType<ZodError["flatten"]>;
      };
    } = {
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
      },
    };
    if (env.NODE_ENV !== "production") {
      body.error.details = err.flatten();
    }
    res.status(400).json(body);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    log.warn({ err, requestId }, "Prisma known error");
    if (err.code === "P2002") {
      res.status(409).json({
        error: {
          code: "CONFLICT",
          message: "A unique constraint would be violated.",
        },
      });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: "Record not found." },
      });
      return;
    }
    res.status(400).json({
      error: {
        code: "DATABASE_ERROR",
        message: "Database request could not be completed.",
      },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    log.error({ err, requestId }, "Prisma validation error");
    res.status(400).json({
      error: {
        code: "DATABASE_VALIDATION_ERROR",
        message: "Invalid data for database operation.",
      },
    });
    return;
  }

  if (
    err instanceof Prisma.PrismaClientUnknownRequestError ||
    err instanceof Prisma.PrismaClientInitializationError ||
    err instanceof Prisma.PrismaClientRustPanicError
  ) {
    log.error(
      {
        err,
        requestId,
        message: err instanceof Error ? err.message : String(err),
      },
      "Prisma engine error (connectivity, schema drift vs. migrations, or unsupported SQL)"
    );
    res.status(503).json({
      error: {
        code: "DATABASE_UNAVAILABLE",
        message:
          env.NODE_ENV === "production"
            ? "Database request failed. Check migration status and RDS connectivity in logs."
            : err instanceof Error
              ? err.message
              : "Database request failed.",
      },
    });
    return;
  }

  log.error({ err, requestId }, "Unhandled error");
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message:
        env.NODE_ENV === "production"
          ? "An unexpected error occurred."
          : err instanceof Error
            ? err.message
            : "Unknown error",
    },
  });
}
