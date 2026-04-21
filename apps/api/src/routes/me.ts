import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { clerkMiddleware, getAuth } from "@clerk/express";

import { prisma } from "../lib/prisma.js";
import { notFound, unauthorized } from "../utils/errors.js";

export const meRouter = Router();

async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      throw unauthorized("UNAUTHORIZED", "Authentication required.");
    }

    const user = await prisma.user.findUnique({
      where: { clerkUserId: userId },
      include: { clinic: true },
    });

    if (!user) {
      throw notFound(
        "USER_NOT_PROVISIONED",
        "Your account is not synced yet. If you just signed up, wait a moment and refresh — otherwise contact support."
      );
    }

    res.json({
      user: {
        id: user.id,
        clerkUserId: user.clerkUserId,
        email: user.email,
        name: user.name,
        clinic: { id: user.clinic.id, name: user.clinic.name },
      },
    });
  } catch (err) {
    next(err);
  }
}

meRouter.get("/", clerkMiddleware(), (req, res, next) => {
  void getMe(req, res, next);
});
