import type { ActorType, EventType, Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma.js";

export async function appendAuditLog(input: {
  documentId: string;
  actorType: ActorType;
  actorId: string | null;
  eventType: EventType;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      documentId: input.documentId,
      actorType: input.actorType,
      actorId: input.actorId,
      eventType: input.eventType,
      metadata: input.metadata ?? {},
    },
  });
}
