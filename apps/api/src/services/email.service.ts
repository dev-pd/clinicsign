import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

export async function sendSigningInviteEmail(input: {
  to: string;
  recipientName: string;
  documentTitle: string;
  signingUrl: string;
}): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [input.to],
      subject: `Please sign: ${input.documentTitle}`,
      html: `
        <p>Hi ${escapeHtml(input.recipientName)},</p>
        <p>You have a document waiting for your signature: <strong>${escapeHtml(input.documentTitle)}</strong>.</p>
        <p><a href="${input.signingUrl}">Open signing page</a></p>
        <p>If you did not expect this message, you can ignore it.</p>
      `,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, text }, "Resend API error");
    throw new Error(`Email delivery failed (${res.status}).`);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
