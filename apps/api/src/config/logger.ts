import pino from "pino";

import { env } from "./env.js";

export const logger =
  env.NODE_ENV === "development"
    ? pino({
        level: env.LOG_LEVEL,
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      })
    : pino({
        level: env.LOG_LEVEL,
      });
