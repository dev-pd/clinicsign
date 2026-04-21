import type { Request, Response } from "express";
import { verifyWebhook } from "@clerk/express/webhooks";

import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { handleClerkWebhookEvent } from "../services/user-sync.service.js";

export async function clerkWebhookHandler(req: Request, res: Response): Promise<void> {
  try {
    const evt = await verifyWebhook(req, { signingSecret: env.CLERK_WEBHOOK_SECRET });
    await handleClerkWebhookEvent(evt);
    res.status(200).json({ received: true as const });
  } catch (err) {
    logger.warn({ err }, "Clerk webhook verification or processing failed");
    res.status(400).json({
      error: {
        code: "WEBHOOK_ERROR",
        message: "Webhook verification failed or payload could not be processed.",
      },
    });
  }
}
