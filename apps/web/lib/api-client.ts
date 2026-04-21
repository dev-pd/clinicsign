import type { DocumentStatus } from "@clinicsign/shared-types";

import type {
  ApiDocument,
  DocumentDetailResponse,
  DocumentsListResponse,
  PatchDocumentFieldInput,
  PresignedUrlResponse,
  SigningViewResponse,
} from "./api-types.js";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Browser: public API origin (must match CORS on Express). */
export function getBrowserApiBaseUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  return url.replace(/\/$/, "");
}

type ErrBody = { error?: { code?: string; message?: string } };

export async function parseApiJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(res.status, "INVALID_JSON", "Invalid JSON from API.");
  }
  if (!res.ok) {
    const err = (data as ErrBody)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "API_ERROR",
      err?.message ?? res.statusText
    );
  }
  return data as T;
}

export async function fetchDocumentsList(
  token: string | null,
  query?: { page?: number; limit?: number; status?: DocumentStatus }
): Promise<DocumentsListResponse> {
  const params = new URLSearchParams();
  if (query?.page) {
    params.set("page", String(query.page));
  }
  if (query?.limit) {
    params.set("limit", String(query.limit));
  }
  if (query?.status) {
    params.set("status", query.status);
  }
  const q = params.toString();
  const res = await fetch(
    `${getBrowserApiBaseUrl()}/api/documents${q ? `?${q}` : ""}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    }
  );
  return parseApiJson<DocumentsListResponse>(res);
}

export async function fetchDocumentDetail(
  token: string | null,
  id: string
): Promise<DocumentDetailResponse> {
  const res = await fetch(`${getBrowserApiBaseUrl()}/api/documents/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  return parseApiJson<DocumentDetailResponse>(res);
}

export async function createDocument(
  token: string | null,
  input: { title: string; file: File }
): Promise<{ document: ApiDocument }> {
  const body = new FormData();
  body.append("title", input.title);
  body.append("pdf", input.file);

  const res = await fetch(`${getBrowserApiBaseUrl()}/api/documents`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  });
  return parseApiJson(res);
}

export async function sendDocument(
  token: string | null,
  documentId: string,
  input: { recipientName: string; recipientEmail: string }
): Promise<DocumentDetailResponse> {
  const res = await fetch(
    `${getBrowserApiBaseUrl()}/api/documents/${documentId}/send`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(input),
    }
  );
  return parseApiJson<DocumentDetailResponse>(res);
}

export async function patchDocument(
  token: string | null,
  documentId: string,
  body: { title?: string; fields?: PatchDocumentFieldInput[] }
): Promise<DocumentDetailResponse> {
  const res = await fetch(
    `${getBrowserApiBaseUrl()}/api/documents/${documentId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }
  );
  return parseApiJson<DocumentDetailResponse>(res);
}

export async function resendDocument(
  token: string | null,
  documentId: string
): Promise<DocumentDetailResponse> {
  const res = await fetch(
    `${getBrowserApiBaseUrl()}/api/documents/${documentId}/resend`,
    {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }
  );
  return parseApiJson<DocumentDetailResponse>(res);
}

export async function fetchPresignedDownload(
  token: string | null,
  documentId: string,
  type: "original" | "signed"
): Promise<PresignedUrlResponse> {
  const res = await fetch(
    `${getBrowserApiBaseUrl()}/api/documents/${documentId}/download?type=${type}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    }
  );
  return parseApiJson<PresignedUrlResponse>(res);
}

export async function fetchSigningView(rawToken: string): Promise<SigningViewResponse> {
  const res = await fetch(
    `${getBrowserApiBaseUrl()}/api/sign/${encodeURIComponent(rawToken)}`,
    { cache: "no-store" }
  );
  return parseApiJson<SigningViewResponse>(res);
}

export async function completeSigning(
  rawToken: string,
  fieldValues: Array<{ fieldId: string; value: string }>
): Promise<void> {
  const res = await fetch(
    `${getBrowserApiBaseUrl()}/api/sign/${encodeURIComponent(rawToken)}/complete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fieldValues }),
    }
  );
  await parseApiJson<{ document: unknown }>(res);
}
