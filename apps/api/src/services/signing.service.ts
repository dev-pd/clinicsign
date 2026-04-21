import { PDFDocument } from "pdf-lib";

import type { Prisma } from "@prisma/client";
import { DocumentStatus } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { badRequest, notFound } from "../utils/errors.js";

import { appendAuditLog } from "./audit.service.js";
import { getObjectBuffer, getPresignedDownloadUrl, putPdfObject } from "./s3.service.js";
import { hashSigningToken } from "./token.service.js";

function objectKeyForSignedPdf(clinicId: string, documentId: string): string {
  return `clinics/${clinicId}/documents/${documentId}/signed.pdf`;
}

export async function resolveRecipientByRawToken(raw: string) {
  const tokenHash = hashSigningToken(raw);
  return prisma.documentRecipient.findUnique({
    where: { tokenHash },
    include: {
      document: {
        include: {
          clinic: true,
          fields: { orderBy: [{ page: "asc" }, { y: "asc" }] },
        },
      },
    },
  });
}

export async function markDocumentViewedIfSent(
  documentId: string
): Promise<void> {
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc || doc.status !== DocumentStatus.SENT) {
    return;
  }

  await prisma.document.update({
    where: { id: documentId },
    data: { status: DocumentStatus.VIEWED },
  });

  await appendAuditLog({
    documentId,
    actorType: "RECIPIENT",
    actorId: null,
    eventType: "DOCUMENT_VIEWED",
    metadata: {},
  });
}

export async function getSigningViewForToken(
  raw: string
): Promise<{
  document: {
    id: string;
    title: string;
    status: DocumentStatus;
    plainSummary: string | null;
  };
  fields: Array<{
    id: string;
    type: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    required: boolean;
    value: string | null;
  }>;
  recipient: { name: string; email: string };
  originalPdfUrl: string;
}> {
  const recipient = await resolveRecipientByRawToken(raw);

  if (!recipient) {
    throw notFound("SIGNING_LINK_INVALID", "Signing link is invalid or expired.");
  }

  if (recipient.tokenExpiresAt.getTime() < Date.now()) {
    throw badRequest("SIGNING_LINK_EXPIRED", "This signing link has expired.");
  }

  if (recipient.signedAt) {
    throw badRequest("ALREADY_SIGNED", "This document has already been signed.");
  }

  const doc = recipient.document;

  await markDocumentViewedIfSent(doc.id);

  const latest = await prisma.document.findUniqueOrThrow({
    where: { id: doc.id },
    include: {
      fields: { orderBy: [{ page: "asc" }, { y: "asc" }] },
    },
  });

  const originalPdfUrl = await getPresignedDownloadUrl(doc.originalPdfKey);

  return {
    document: {
      id: latest.id,
      title: latest.title,
      status: latest.status,
      plainSummary: latest.plainSummary,
    },
    fields: latest.fields.map((f) => ({
      id: f.id,
      type: f.type,
      page: f.page,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      required: f.required,
      value: f.value,
    })),
    recipient: { name: recipient.name, email: recipient.email },
    originalPdfUrl,
  };
}

export async function completeSigning(input: {
  rawToken: string;
  fieldValues: Array<{ fieldId: string; value: string }>;
  clientIp: string | null;
  userAgent: string | null;
}): Promise<{
  document: Prisma.DocumentGetPayload<{
    include: { fields: true; recipients: true };
  }>;
}> {
  const recipient = await resolveRecipientByRawToken(input.rawToken);

  if (!recipient) {
    throw notFound("SIGNING_LINK_INVALID", "Signing link is invalid or expired.");
  }

  if (recipient.tokenExpiresAt.getTime() < Date.now()) {
    throw badRequest("SIGNING_LINK_EXPIRED", "This signing link has expired.");
  }

  if (recipient.signedAt) {
    throw badRequest("ALREADY_SIGNED", "This document has already been signed.");
  }

  const doc = await prisma.document.findUnique({
    where: { id: recipient.documentId },
    include: { fields: true },
  });

  if (!doc) {
    throw notFound("DOCUMENT_NOT_FOUND", "Document not found.");
  }

  if (doc.status === DocumentStatus.VOIDED || doc.status === DocumentStatus.SIGNED) {
    throw badRequest("DOCUMENT_LOCKED", "This document can no longer be signed.");
  }

  const fieldById = new Map(doc.fields.map((f) => [f.id, f]));
  const updates = new Map<string, string>();

  for (const row of input.fieldValues) {
    const f = fieldById.get(row.fieldId);
    if (!f) {
      throw badRequest("UNKNOWN_FIELD", `Unknown field id: ${row.fieldId}`);
    }
    updates.set(row.fieldId, row.value);
  }

  for (const f of doc.fields) {
    if (!f.required) {
      continue;
    }
    const v = updates.get(f.id);
    if (v === undefined || String(v).trim() === "") {
      throw badRequest(
        "FIELD_REQUIRED",
        `Field ${f.id} is required but was not provided.`
      );
    }
  }

  const clinicId = doc.clinicId;
  const originalKey = doc.originalPdfKey;
  const originalBytes = await getObjectBuffer(originalKey);
  const pdf = await PDFDocument.load(originalBytes);
  const signedBytes = await pdf.save();
  const signedKey = objectKeyForSignedPdf(clinicId, doc.id);
  await putPdfObject(signedKey, Buffer.from(signedBytes));

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const [fieldId, value] of updates) {
      await tx.documentField.update({
        where: { id: fieldId },
        data: { value },
      });
    }

    await tx.documentRecipient.update({
      where: { id: recipient.id },
      data: {
        signedAt: now,
        signedFromIp: input.clientIp,
        signedUserAgent: input.userAgent,
      },
    });

    await tx.document.update({
      where: { id: doc.id },
      data: {
        status: DocumentStatus.SIGNED,
        signedAt: now,
        signedPdfKey: signedKey,
      },
    });

    await tx.auditLog.create({
      data: {
        documentId: doc.id,
        actorType: "RECIPIENT",
        actorId: recipient.id,
        eventType: "DOCUMENT_SIGNED",
        metadata: { recipientEmail: recipient.email },
      },
    });
  });

  const updated = await prisma.document.findUniqueOrThrow({
    where: { id: doc.id },
    include: { fields: true, recipients: true },
  });

  return { document: updated };
}
