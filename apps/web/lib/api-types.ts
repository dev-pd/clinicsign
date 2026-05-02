import type { DocumentStatus } from "@clinicsign/shared-types";

/** JSON shapes returned by the Express API (dates as ISO strings). */
export type ApiDocument = {
  id: string;
  title: string;
  status: DocumentStatus;
  organizationId: string;
  createdByUserId: string;
  originalPdfKey: string;
  signedPdfKey: string | null;
  expiresAt: string | null;
  sentAt: string | null;
  signedAt: string | null;
  voidedAt: string | null;
  plainSummary: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Prisma FieldType enum values exposed by the API. */
export type ApiFieldType =
  | "SIGNATURE"
  | "TEXT"
  | "DATE"
  | "CHECKBOX"
  | "INITIAL";

export type PatchDocumentFieldInput = {
  type: ApiFieldType;
  page: number;
  /** Normalized 0–1 from left of page. */
  x: number;
  /** Normalized 0–1 from top of page. */
  y: number;
  width: number;
  height: number;
  required?: boolean;
  recipientId?: string | null;
};

export type ApiDocumentField = {
  id: string;
  documentId: string;
  type: ApiFieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  value: string | null;
  recipientId: string | null;
  aiGenerated: boolean;
};

export type ApiDocumentRecipient = {
  id: string;
  documentId: string;
  name: string;
  email: string;
  tokenExpiresAt: string;
  signedAt: string | null;
  signedFromIp: string | null;
  signedUserAgent: string | null;
  signatureImageKey: string | null;
  createdAt: string;
};

export type ApiAuditEntry = {
  id: string;
  documentId: string;
  actorType: string;
  actorId: string | null;
  eventType: string;
  metadata: unknown;
  timestamp: string;
};

/**
 * Slim recipient projection returned on the list endpoint. Safe fields only —
 * omits `tokenHash`, `tokenExpiresAt`, and signing metadata, which are only
 * available via the scoped detail endpoint.
 */
export type ApiListRecipient = {
  id: string;
  name: string;
  email: string;
  signedAt: string | null;
};

export type ApiDocumentListItem = ApiDocument & {
  recipient: ApiListRecipient | null;
};

export type DocumentsListResponse = {
  documents: ApiDocumentListItem[];
  page: number;
  limit: number;
  total: number;
};

export type DocumentDetailResponse = {
  document: ApiDocument & {
    fields: ApiDocumentField[];
    recipients: ApiDocumentRecipient[];
    auditLogs: ApiAuditEntry[];
  };
};

export type PresignedUrlResponse = {
  url: string;
  expiresInSeconds: number;
};

/** Patient signing: GET /api/sign/:token */
export type SigningViewResponse = {
  document: {
    id: string;
    title: string;
    status: DocumentStatus;
    plainSummary: string | null;
  };
  fields: Array<{
    id: string;
    type: ApiFieldType;
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
};
