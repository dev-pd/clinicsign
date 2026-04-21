import { randomUUID } from "node:crypto";

import {
  type Document,
  type DocumentField,
  DocumentStatus,
  type Prisma,
} from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { badRequest, notFound } from "../utils/errors.js";

import { appendAuditLog } from "./audit.service.js";
import { putPdfObject } from "./s3.service.js";

export function objectKeyForOriginalPdf(clinicId: string, documentId: string): string {
  return `clinics/${clinicId}/documents/${documentId}/original.pdf`;
}

export async function listDocumentsForClinic(
  clinicId: string,
  query: { status?: DocumentStatus; page: number; limit: number }
): Promise<{
  rows: Document[];
  total: number;
}> {
  const where: Prisma.DocumentWhereInput = { clinicId };
  if (query.status) {
    where.status = query.status;
  }
  const skip = (query.page - 1) * query.limit;
  const [rows, total] = await prisma.$transaction([
    prisma.document.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip,
      take: query.limit,
    }),
    prisma.document.count({ where }),
  ]);
  return { rows, total };
}

export async function getDocumentScoped(
  documentId: string,
  clinicId: string
): Promise<
  Prisma.DocumentGetPayload<{
    include: { fields: true; recipients: true; auditLogs: true };
  }>
> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, clinicId },
    include: {
      fields: { orderBy: [{ page: "asc" }, { y: "asc" }] },
      recipients: true,
      auditLogs: { orderBy: { timestamp: "desc" } },
    },
  });
  if (!doc) {
    throw notFound("DOCUMENT_NOT_FOUND", "Document not found.");
  }
  return doc;
}

export async function createDraftDocument(input: {
  clinicId: string;
  createdByUserId: string;
  title: string;
  pdf: Buffer;
}): Promise<Document> {
  const id = randomUUID();
  const key = objectKeyForOriginalPdf(input.clinicId, id);
  await putPdfObject(key, input.pdf);

  const doc = await prisma.document.create({
    data: {
      id,
      title: input.title,
      clinicId: input.clinicId,
      createdByUserId: input.createdByUserId,
      originalPdfKey: key,
      status: DocumentStatus.DRAFT,
    },
  });

  await appendAuditLog({
    documentId: doc.id,
    actorType: "PROVIDER",
    actorId: input.createdByUserId,
    eventType: "DOCUMENT_CREATED",
    metadata: { title: doc.title },
  });

  return doc;
}

function assertCanEditMetadata(status: DocumentStatus): void {
  if (status === DocumentStatus.VOIDED || status === DocumentStatus.SIGNED) {
    throw badRequest(
      "DOCUMENT_LOCKED",
      "This document cannot be edited in its current status."
    );
  }
}

export async function patchDocumentForClinic(
  documentId: string,
  clinicId: string,
  body: {
    title?: string;
    fields?: Array<{
      type: DocumentField["type"];
      page: number;
      x: number;
      y: number;
      width: number;
      height: number;
      required: boolean;
      recipientId: string | null | undefined;
    }>;
  }
): Promise<
  Prisma.DocumentGetPayload<{
    include: { fields: true; recipients: true; auditLogs: true };
  }>
> {
  const existing = await prisma.document.findFirst({
    where: { id: documentId, clinicId },
    include: { fields: true, recipients: true, auditLogs: true },
  });

  if (!existing) {
    throw notFound("DOCUMENT_NOT_FOUND", "Document not found.");
  }

  if (body.title !== undefined) {
    assertCanEditMetadata(existing.status);
  }

  if (body.fields !== undefined) {
    if (existing.status !== DocumentStatus.DRAFT) {
      throw badRequest(
        "FIELDS_READ_ONLY",
        "Fields can only be edited while the document is a draft."
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    const data: Prisma.DocumentUpdateInput = {};
    if (body.title !== undefined) {
      data.title = body.title;
    }
    if (Object.keys(data).length > 0) {
      await tx.document.update({
        where: { id: existing.id },
        data,
      });
    }

    if (body.fields !== undefined) {
      await tx.documentField.deleteMany({ where: { documentId: existing.id } });
      if (body.fields.length > 0) {
        await tx.documentField.createMany({
          data: body.fields.map((f) => ({
            documentId: existing.id,
            type: f.type,
            page: f.page,
            x: f.x,
            y: f.y,
            width: f.width,
            height: f.height,
            required: f.required,
            recipientId: f.recipientId ?? null,
          })),
        });
      }
    }
  });

  return getDocumentScoped(documentId, clinicId);
}

export async function voidDocumentForClinic(
  documentId: string,
  clinicId: string,
  actorUserId: string
): Promise<Document> {
  const existing = await prisma.document.findFirst({
    where: { id: documentId, clinicId },
  });

  if (!existing) {
    throw notFound("DOCUMENT_NOT_FOUND", "Document not found.");
  }

  if (existing.status === DocumentStatus.VOIDED) {
    return existing;
  }

  if (existing.status === DocumentStatus.SIGNED) {
    throw badRequest("DOCUMENT_SIGNED", "A signed document cannot be voided.");
  }

  const doc = await prisma.document.update({
    where: { id: existing.id },
    data: {
      status: DocumentStatus.VOIDED,
      voidedAt: new Date(),
    },
  });

  await appendAuditLog({
    documentId: doc.id,
    actorType: "PROVIDER",
    actorId: actorUserId,
    eventType: "DOCUMENT_VOIDED",
    metadata: {},
  });

  return doc;
}
