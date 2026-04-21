import { Router } from "express";

import { documentsRouter } from "./documents.routes.js";
import { meRouter } from "./me.js";
import { signRouter } from "./sign.routes.js";

/**
 * JSON API mounted at `/api`. Domain routes are added in later prompts.
 */
export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({ status: "ok" as const });
});

apiRouter.use("/me", meRouter);
apiRouter.use("/documents", documentsRouter);
apiRouter.use("/sign", signRouter);
