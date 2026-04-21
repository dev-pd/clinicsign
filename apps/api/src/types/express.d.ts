import type { User } from "@prisma/client";
import type { Logger } from "pino";

declare global {
  namespace Express {
    interface Request {
      id: string;
      log?: Logger;
      /** Set by `requireProviderUser()` after Clerk + DB user resolution. */
      appUser?: User;
    }
  }
}

export {};
