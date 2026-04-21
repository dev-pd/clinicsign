import type { NextFunction, Request, RequestHandler, Response } from "express";
import { clerkMiddleware, getAuth } from "@clerk/express";

import { prisma } from "../lib/prisma.js";
import { notFound, unauthorized } from "../utils/errors.js";

async function loadAppUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      throw unauthorized("UNAUTHORIZED", "Authentication required.");
    }

    const user = await prisma.user.findUnique({
      where: { clerkUserId: userId },
    });

    if (!user) {
      throw notFound(
        "USER_NOT_PROVISIONED",
        "Your account is not synced yet. If you just signed up, wait a moment — otherwise contact support."
      );
    }

    req.appUser = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Clerk JWT verification + resolved `User` row on `req.appUser`.
 */
export function requireProviderUser(): RequestHandler[] {
  return [
    clerkMiddleware(),
    (req, res, next) => {
      void loadAppUser(req, res, next);
    },
  ];
}
