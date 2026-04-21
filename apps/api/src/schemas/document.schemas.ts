import { DocumentStatus, FieldType } from "@prisma/client";
import { z } from "zod";

const fieldTypeSchema = z.nativeEnum(FieldType);

export const uuidParamSchema = z.object({
  id: z.string().uuid(),
});

export const listDocumentsQuerySchema = z.object({
  status: z.nativeEnum(DocumentStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createDocumentBodySchema = z.object({
  title: z.string().min(1).max(500),
});

export const patchDocumentBodySchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    fields: z
      .array(
        z.object({
          type: fieldTypeSchema,
          page: z.number().int().min(1),
          x: z.number(),
          y: z.number(),
          width: z.number().positive(),
          height: z.number().positive(),
          required: z.boolean().optional().default(true),
          recipientId: z.string().uuid().nullable().optional(),
        })
      )
      .optional(),
  })
  .strict();

export const downloadQuerySchema = z.object({
  type: z.enum(["original", "signed"]),
});
