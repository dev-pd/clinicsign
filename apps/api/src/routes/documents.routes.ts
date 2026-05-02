import type { DocumentRecipient } from "@prisma/client";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Router } from "express";
import multer from "multer";

import {
  createDocumentBodySchema,
  downloadQuerySchema,
  listDocumentsQuerySchema,
  patchDocumentBodySchema,
  uuidParamSchema,
} from "../schemas/document.schemas.js";
import { sendDocumentBodySchema } from "../schemas/send.schemas.js";
import {
  resendDocumentForOrganization,
  sendDocumentForOrganization,
} from "../services/document-send.service.js";
import { getPresignedDownloadUrl } from "../services/s3.service.js";
import {
  createDraftDocument,
  getDocumentScoped,
  listDocumentsForOrganization,
  patchDocumentForOrganization,
  voidDocumentForOrganization,
} from "../services/documents.service.js";
import { badRequest } from "../utils/errors.js";

import { requireProviderUser } from "../middleware/load-app-user.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function asyncRoute(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}

export const documentsRouter = Router();

documentsRouter.use(...requireProviderUser());

function mapRecipientPublic(r: DocumentRecipient): Omit<
  DocumentRecipient,
  "tokenHash"
> {
  const rest = { ...r };
  delete (rest as { tokenHash?: string }).tokenHash;
  return rest as Omit<DocumentRecipient, "tokenHash">;
}

documentsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const parsed = listDocumentsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw parsed.error;
    }
    const user = req.appUser!;
    const q = parsed.data;
    const { rows, total } = await listDocumentsForOrganization(user.organizationId, {
      page: q.page,
      limit: q.limit,
      ...(q.status !== undefined ? { status: q.status } : {}),
    });
    res.json({
      documents: rows,
      page: q.page,
      limit: q.limit,
      total,
    });
  })
);

documentsRouter.post(
  "/",
  upload.single("pdf"),
  asyncRoute(async (req, res) => {
    const user = req.appUser!;
    const bodyParsed = createDocumentBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      throw bodyParsed.error;
    }
    const file = req.file;
    if (!file?.buffer) {
      throw badRequest("PDF_REQUIRED", "Multipart field `pdf` with a PDF file is required.");
    }
    if (
      file.mimetype !== "application/pdf" &&
      !file.originalname.toLowerCase().endsWith(".pdf")
    ) {
      throw badRequest("INVALID_PDF", "Only PDF uploads are allowed.");
    }

    const doc = await createDraftDocument({
      organizationId: user.organizationId,
      createdByUserId: user.id,
      title: bodyParsed.data.title,
      pdf: file.buffer,
    });

    res.status(201).json({ document: doc });
  })
);

documentsRouter.get(
  "/:id/audit",
  asyncRoute(async (req, res) => {
    const params = uuidParamSchema.safeParse(req.params);
    if (!params.success) {
      throw params.error;
    }
    const user = req.appUser!;
    const doc = await getDocumentScoped(params.data.id, user.organizationId);
    res.json({ entries: doc.auditLogs });
  })
);

documentsRouter.get(
  "/:id/download",
  asyncRoute(async (req, res) => {
    const params = uuidParamSchema.safeParse(req.params);
    if (!params.success) {
      throw params.error;
    }
    const query = downloadQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw query.error;
    }
    const user = req.appUser!;
    const doc = await getDocumentScoped(params.data.id, user.organizationId);
    const key =
      query.data.type === "original" ? doc.originalPdfKey : doc.signedPdfKey;
    if (!key) {
      throw badRequest(
        "SIGNED_PDF_MISSING",
        "This document does not have a signed PDF yet."
      );
    }
    const url = await getPresignedDownloadUrl(key);
    res.json({ url, expiresInSeconds: 300 });
  })
);

documentsRouter.post(
  "/:id/send",
  asyncRoute(async (req, res) => {
    const params = uuidParamSchema.safeParse(req.params);
    if (!params.success) {
      throw params.error;
    }
    const body = sendDocumentBodySchema.safeParse(req.body);
    if (!body.success) {
      throw body.error;
    }
    const user = req.appUser!;
    const updated = await sendDocumentForOrganization(
      params.data.id,
      user.organizationId,
      user.id,
      body.data
    );
    res.status(200).json({
      document: {
        ...updated,
        recipients: updated.recipients.map(mapRecipientPublic),
      },
    });
  })
);

documentsRouter.post(
  "/:id/resend",
  asyncRoute(async (req, res) => {
    const params = uuidParamSchema.safeParse(req.params);
    if (!params.success) {
      throw params.error;
    }
    const user = req.appUser!;
    const updated = await resendDocumentForOrganization(
      params.data.id,
      user.organizationId,
      user.id
    );
    res.status(200).json({
      document: {
        ...updated,
        recipients: updated.recipients.map(mapRecipientPublic),
      },
    });
  })
);

documentsRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const params = uuidParamSchema.safeParse(req.params);
    if (!params.success) {
      throw params.error;
    }
    const parsed = patchDocumentBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const user = req.appUser!;
    const patchInput: Parameters<typeof patchDocumentForOrganization>[2] = {};
    if (parsed.data.title !== undefined) {
      patchInput.title = parsed.data.title;
    }
    if (parsed.data.fields !== undefined) {
      patchInput.fields = parsed.data.fields.map((f) => ({
        ...f,
        recipientId: f.recipientId,
      }));
    }
    const updated = await patchDocumentForOrganization(
      params.data.id,
      user.organizationId,
      patchInput
    );
    res.json({
      document: {
        ...updated,
        recipients: updated.recipients.map(mapRecipientPublic),
      },
    });
  })
);

documentsRouter.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    const params = uuidParamSchema.safeParse(req.params);
    if (!params.success) {
      throw params.error;
    }
    const user = req.appUser!;
    const doc = await voidDocumentForOrganization(
      params.data.id,
      user.organizationId,
      user.id
    );
    res.json({ document: doc });
  })
);

documentsRouter.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const params = uuidParamSchema.safeParse(req.params);
    if (!params.success) {
      throw params.error;
    }
    const user = req.appUser!;
    const doc = await getDocumentScoped(params.data.id, user.organizationId);
    res.json({
      document: {
        ...doc,
        recipients: doc.recipients.map(mapRecipientPublic),
      },
    });
  })
);
