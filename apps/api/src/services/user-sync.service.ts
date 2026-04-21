import type { UserJSON, WebhookEvent } from "@clerk/backend";

import { logger } from "../config/logger.js";
import { prisma } from "../lib/prisma.js";

function primaryEmail(data: UserJSON): string | undefined {
  const primary = data.email_addresses.find(
    (e) => e.id === data.primary_email_address_id
  );
  return primary?.email_address ?? data.email_addresses[0]?.email_address;
}

function displayName(data: UserJSON, fallbackEmail: string): string {
  const parts = [data.first_name, data.last_name].filter(
    (p): p is string => Boolean(p && p.trim())
  );
  const joined = parts.join(" ").trim();
  if (joined) {
    return joined;
  }
  const local = fallbackEmail.split("@")[0];
  return local ?? "Provider";
}

/**
 * Creates or updates our User (+ Clinic on first create) from Clerk `UserJSON`.
 * Used for `user.created` and `user.updated` webhooks.
 */
export async function syncUserFromClerkPayload(data: UserJSON): Promise<void> {
  const clerkUserId = data.id;
  const email = primaryEmail(data);
  if (!email) {
    throw new Error("Clerk user has no email address");
  }
  const name = displayName(data, email);

  const existing = await prisma.user.findUnique({
    where: { clerkUserId },
  });

  if (existing) {
    await prisma.user.update({
      where: { clerkUserId },
      data: { email, name },
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    const clinic = await tx.clinic.create({
      data: { name: `${name}'s Clinic` },
    });
    await tx.user.create({
      data: {
        clerkUserId,
        email,
        name,
        clinicId: clinic.id,
      },
    });
  });
}

async function deleteUserByClerkId(clerkUserId: string): Promise<void> {
  try {
    const result = await prisma.user.deleteMany({ where: { clerkUserId } });
    if (result.count === 0) {
      logger.info({ clerkUserId }, "user.deleted: no local User row (already removed)");
    }
  } catch (err) {
    logger.warn(
      { err, clerkUserId },
      "user.deleted: could not delete User (likely existing documents); manual cleanup if needed"
    );
  }
}

export async function handleClerkWebhookEvent(evt: WebhookEvent): Promise<void> {
  switch (evt.type) {
    case "user.created":
    case "user.updated":
      await syncUserFromClerkPayload(evt.data);
      return;
    case "user.deleted": {
      const id = evt.data.id;
      if (id) {
        await deleteUserByClerkId(id);
      }
      return;
    }
    default:
      return;
  }
}
