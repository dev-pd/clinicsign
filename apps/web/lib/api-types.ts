import type { DocumentStatus } from "@clinicsign/shared-types";

/** JSON shapes returned by the Express API (dates as ISO strings). */
export type ApiDocument = {
  id: string;
  title: string;
  status: DocumentStatus;
  clinicId: string;
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

export type ApiDocumentField = {
  id: string;
  documentId: string;
  type: string;
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

export type DocumentsListResponse = {
  documents: ApiDocument[];
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
