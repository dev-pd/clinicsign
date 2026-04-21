import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const here = dirname(fileURLToPath(import.meta.url));
// Loaded when `prisma db seed` runs (no shell-exported DATABASE_URL required).
config({ path: resolve(here, "../.env") });
config({ path: resolve(here, "../../../.env") });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required. Set it from Pulumi: `cd infra && pulumi stack output databaseUrl --show-secrets`"
  );
}

const prisma = new PrismaClient();

const DEMO_CLERK_USER_ID = "user_dev_clerk_placeholder";
const DEMO_EMAIL = "provider@clinicsign.local";

async function main(): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { clerkUserId: DEMO_CLERK_USER_ID },
  });

  if (existing) {
    console.log("Seed skipped: demo user already exists");
    return;
  }

  const clinic = await prisma.clinic.create({
    data: {
      name: "Demo Clinic",
    },
  });

  await prisma.user.create({
    data: {
      clerkUserId: DEMO_CLERK_USER_ID,
      email: DEMO_EMAIL,
      name: "Demo Provider",
      clinicId: clinic.id,
    },
  });

  console.log("Seed OK: demo clinic + user for local development");
}

void main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
