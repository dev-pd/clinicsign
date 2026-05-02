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

/** S3 prefix remains `clinics/` for existing deployments; id is the organization (tenant) id. */
export function objectKeyForOriginalPdf(
  organizationId: string,
  documentId: string
): string {
  return `clinics/${organizationId}/documents/${documentId}/original.pdf`;
}

/**
 * Lightweight recipient projection returned with each document on the list
 * endpoint. Deliberately excludes `tokenHash`, `tokenExpiresAt`, and signing
 * metadata — those are only exposed through the scoped detail endpoint.
 */
export type DocumentListRecipient = {
  id: string;
  name: string;
  email: string;
  signedAt: Date | null;
};

export type DocumentListRow = Document & {
  recipient: DocumentListRecipient | null;
};

export async function listDocumentsForOrganization(
  organizationId: string,
  query: { status?: DocumentStatus; page: number; limit: number }
): Promise<{
  rows: DocumentListRow[];
  total: number;
}> {
  const where: Prisma.DocumentWhereInput = { organizationId };
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
      include: {
        recipients: {
          take: 1,
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            email: true,
            signedAt: true,
          },
        },
      },
    }),
    prisma.document.count({ where }),
  ]);
  const projected: DocumentListRow[] = rows.map(({ recipients, ...doc }) => ({
    ...doc,
    recipient: recipients[0] ?? null,
  }));
  return { rows: projected, total };
}

export async function getDocumentScoped(
  documentId: string,
  organizationId: string
): Promise<
  Prisma.DocumentGetPayload<{
    include: { fields: true; recipients: true; auditLogs: true };
  }>
> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, organizationId },
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
  organizationId: string;
  createdByUserId: string;
  title: string;
  pdf: Buffer;
}): Promise<Document> {
  const id = randomUUID();
  const key = objectKeyForOriginalPdf(input.organizationId, id);
  await putPdfObject(key, input.pdf);

  const doc = await prisma.document.create({
    data: {
      id,
      title: input.title,
      organizationId: input.organizationId,
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

export async function patchDocumentForOrganization(
  documentId: string,
  organizationId: string,
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
    where: { id: documentId, organizationId },
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

  return getDocumentScoped(documentId, organizationId);
}

export async function voidDocumentForOrganization(
  documentId: string,
  organizationId: string,
  actorUserId: string
): Promise<Document> {
  const existing = await prisma.document.findFirst({
    where: { id: documentId, organizationId },
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
