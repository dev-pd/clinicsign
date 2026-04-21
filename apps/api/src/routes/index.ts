import { Router } from "express";

/**
 * JSON API mounted at `/api`. Domain routes are added in later prompts.
 */
export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({ status: "ok" as const });
});
