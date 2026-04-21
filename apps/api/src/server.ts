import { createServer } from "node:http";

import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { createApp } from "./app.js";
import { prisma } from "./lib/prisma.js";

const app = createApp();
const server = createServer(app);

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "API listening");
});

function shutdown(signal: string): void {
  logger.info({ signal }, "Shutting down");
  server.close((err) => {
    if (err) {
      logger.error({ err }, "Error closing HTTP server");
      process.exit(1);
    }
    void prisma.$disconnect().finally(() => {
      process.exit(0);
    });
  });
}

process.once("SIGTERM", () => {
  shutdown("SIGTERM");
});
process.once("SIGINT", () => {
  shutdown("SIGINT");
});
