import type { DocumentRecipient } from "@prisma/client";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Router } from "express";

import {
  completeSigningBodySchema,
  signTokenParamSchema,
} from "../schemas/sign.schemas.js";
import { completeSigning, getSigningViewForToken } from "../services/signing.service.js";

function omitRecipientSecret(r: DocumentRecipient): Omit<DocumentRecipient, "tokenHash"> {
  const rest = { ...r };
  delete (rest as { tokenHash?: string }).tokenHash;
  return rest as Omit<DocumentRecipient, "tokenHash">;
}

function asyncRoute(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}

export const signRouter = Router();

signRouter.get(
  "/:token",
  asyncRoute(async (req, res) => {
    const parsed = signTokenParamSchema.safeParse(req.params);
    if (!parsed.success) {
      throw parsed.error;
    }

    const view = await getSigningViewForToken(parsed.data.token);
    res.json(view);
  })
);

signRouter.post(
  "/:token/complete",
  asyncRoute(async (req, res) => {
    const p = signTokenParamSchema.safeParse(req.params);
    if (!p.success) {
      throw p.error;
    }
    const body = completeSigningBodySchema.safeParse(req.body);
    if (!body.success) {
      throw body.error;
    }

    const result = await completeSigning({
      rawToken: p.data.token,
      fieldValues: body.data.fieldValues,
      clientIp: (req.ip ?? null) as string | null,
      userAgent: req.get("user-agent") ?? null,
    });

    res.status(200).json({
      document: {
        ...result.document,
        recipients: result.document.recipients.map(omitRecipientSecret),
      },
    });
  })
);
