import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

const HEADER = "X-Request-Id";

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const incoming = req.get(HEADER);
  req.id = typeof incoming === "string" && incoming.length > 0 ? incoming : randomUUID();
  res.setHeader(HEADER, req.id);
  next();
}
