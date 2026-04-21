import { z } from "zod";

export const sendDocumentBodySchema = z.object({
  recipientName: z.string().min(1).max(200),
  recipientEmail: z.string().email(),
});
