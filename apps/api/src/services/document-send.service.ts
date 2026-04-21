import { DocumentStatus } from "@prisma/client";

import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { badRequest, notFound } from "../utils/errors.js";
import { sendSigningInviteEmail } from "./email.service.js";
import {
  SIGNING_TOKEN_TTL_MS,
  generateSigningTokenRaw,
  hashSigningToken,
} from "./token.service.js";

import { getDocumentScoped } from "./documents.service.js";

export async function sendDocumentForClinic(
  documentId: string,
  clinicId: string,
  actorUserId: string,
  input: { recipientName: string; recipientEmail: string }
): Promise<
  Awaited<ReturnType<typeof getDocumentScoped>>
> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, clinicId },
    include: { recipients: true },
  });

  if (!doc) {
    throw notFound("DOCUMENT_NOT_FOUND", "Document not found.");
  }

  if (doc.status !== DocumentStatus.DRAFT) {
    throw badRequest(
      "DOCUMENT_NOT_DRAFT",
      "Only draft documents can be sent. Use resend if the document was already sent."
    );
  }

  if (doc.recipients.length > 0) {
    throw badRequest(
      "RECIPIENT_EXISTS",
      "This document already has a recipient. Use resend to issue a new link."
    );
  }

  const rawToken = generateSigningTokenRaw();
  const tokenHash = hashSigningToken(rawToken);
  const tokenExpiresAt = new Date(Date.now() + SIGNING_TOKEN_TTL_MS);

  await prisma.$transaction(async (tx) => {
    await tx.documentRecipient.create({
      data: {
        documentId: doc.id,
        name: input.recipientName,
        email: input.recipientEmail,
        tokenHash,
        tokenExpiresAt,
      },
    });

    await tx.document.update({
      where: { id: doc.id },
      data: {
        status: DocumentStatus.SENT,
        sentAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        documentId: doc.id,
        actorType: "PROVIDER",
        actorId: actorUserId,
        eventType: "DOCUMENT_SENT",
        metadata: { recipientEmail: input.recipientEmail },
      },
    });
  });

  const signingUrl = `${env.WEB_APP_URL.replace(/\/$/, "")}/sign/${rawToken}`;
  await sendSigningInviteEmail({
    to: input.recipientEmail,
    recipientName: input.recipientName,
    documentTitle: doc.title,
    signingUrl,
  });

  return getDocumentScoped(doc.id, clinicId);
}

export async function resendDocumentForClinic(
  documentId: string,
  clinicId: string,
  actorUserId: string
): Promise<Awaited<ReturnType<typeof getDocumentScoped>>> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, clinicId },
    include: { recipients: true },
  });

  if (!doc) {
    throw notFound("DOCUMENT_NOT_FOUND", "Document not found.");
  }

  if (
    doc.status !== DocumentStatus.SENT &&
    doc.status !== DocumentStatus.VIEWED
  ) {
    throw badRequest(
      "CANNOT_RESEND",
      "You can only resend documents that are waiting for signature."
    );
  }

  const recip = doc.recipients[0];
  if (!recip) {
    throw badRequest("NO_RECIPIENT", "No recipient found for this document.");
  }

  const rawToken = generateSigningTokenRaw();
  const tokenHash = hashSigningToken(rawToken);
  const tokenExpiresAt = new Date(Date.now() + SIGNING_TOKEN_TTL_MS);

  await prisma.$transaction(async (tx) => {
    await tx.documentRecipient.update({
      where: { id: recip.id },
      data: { tokenHash, tokenExpiresAt },
    });

    await tx.auditLog.create({
      data: {
        documentId: doc.id,
        actorType: "PROVIDER",
        actorId: actorUserId,
        eventType: "DOCUMENT_RESENT",
        metadata: { recipientEmail: recip.email },
      },
    });
  });

  const signingUrl = `${env.WEB_APP_URL.replace(/\/$/, "")}/sign/${rawToken}`;
  await sendSigningInviteEmail({
    to: recip.email,
    recipientName: recip.name,
    documentTitle: doc.title,
    signingUrl,
  });

  return getDocumentScoped(doc.id, clinicId);
}
