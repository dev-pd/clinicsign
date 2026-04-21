/**
 * One-shot: sync all Clerk users into Postgres (same logic as user.created webhook).
 * Run after webhook misconfiguration or to catch up existing accounts.
 *
 * Usage: npm run backfill:clerk-users -w @clinicsign/api
 */
import { createClerkClient } from "@clerk/backend";

import { env } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";
import { syncUserFromClerkPayload } from "../src/services/user-sync.service.js";

async function main(): Promise<void> {
  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
  const { data: users, totalCount } = await clerk.users.getUserList({ limit: 100 });

  console.info(`Clerk returned ${users.length} user(s) (totalCount=${totalCount ?? "?"}).`);

  for (const u of users) {
    const raw = u.raw;
    if (!raw) {
      console.warn(`Skip user ${u.id}: no raw JSON`);
      continue;
    }
    await syncUserFromClerkPayload(raw);
    console.info(`Synced Clerk user ${raw.id}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
