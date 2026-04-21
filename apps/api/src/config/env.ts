import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../.env") });
config({ path: resolve(here, "../../../.env") });

function normalizeProcessEnv(): NodeJS.ProcessEnv {
  const e: NodeJS.ProcessEnv = { ...process.env };
  if (e.AWS_ENDPOINT_URL === "") {
    delete e.AWS_ENDPOINT_URL;
  }
  return e;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
  PORT: z.coerce.number().int().positive(),
  DATABASE_URL: z.string().url(),
  CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_WEBHOOK_SECRET: z.string().min(1),
  AWS_REGION: z.string().min(1),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  AWS_ENDPOINT_URL: z.string().url().optional(),
  S3_BUCKET_NAME: z.string().min(1),
  EMAIL_FROM: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  WEB_APP_URL: z.string().url(),
  JWT_SIGNING_SECRET: z.string().min(32),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]),
});

function loadEnv(): z.infer<typeof envSchema> {
  const parsed = envSchema.safeParse(normalizeProcessEnv());
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors;
    console.error("Invalid environment configuration:", msg);
    throw new Error("Missing or invalid required environment variables (see .env.example).");
  }
  return parsed.data;
}

export const env = loadEnv();
