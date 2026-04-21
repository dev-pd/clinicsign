import { z } from "zod";

export const signTokenParamSchema = z.object({
  token: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]+$/i, "Invalid signing token."),
});

export const completeSigningBodySchema = z.object({
  fieldValues: z.array(
    z.object({
      fieldId: z.string().uuid(),
      /** Plain text or a data URL for drawn signatures (PNG/JPEG). */
      value: z.string().max(6_000_000),
    })
  ),
});
