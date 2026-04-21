import type { DocumentField, FieldType } from "@prisma/client";
import {
  PDFDocument,
  type PDFFont,
  type PDFPage,
  StandardFonts,
  rgb,
} from "pdf-lib";

function parseImageDataUrl(dataUrl: string): { format: "png" | "jpeg"; data: Buffer } {
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
  if (!m?.[1] || !m[2]) {
    throw new Error("Invalid image data URL for signature.");
  }
  const g1 = m[1];
  const b64 = m[2];
  const fmt =
    g1.toLowerCase() === "jpeg" || g1.toLowerCase() === "jpg" ? "jpeg" : "png";
  return { format: fmt, data: Buffer.from(b64, "base64") };
}

/**
 * Draws filled field values onto a PDF. Coordinates match the provider editor:
 * x, y, width, height are normalized 0–1 with (x, y) at the top-left of the box
 * on the page.
 */
export async function renderFieldValuesOntoPdf(
  originalBytes: Buffer,
  fields: DocumentField[],
  values: Map<string, string>
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(originalBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (const field of fields) {
    const raw = values.get(field.id);
    if (raw === undefined || raw === "") {
      continue;
    }

    const pageIndex = field.page - 1;
    if (pageIndex < 0 || pageIndex >= pdf.getPageCount()) {
      continue;
    }
    const page = pdf.getPage(pageIndex);
    const { width: W, height: H } = page.getSize();
    const left = field.x * W;
    const bottom = H * (1 - field.y - field.height);
    const boxW = field.width * W;
    const boxH = field.height * H;

    await drawFieldPdf(
      pdf,
      page,
      field.type,
      raw,
      { left, bottom, boxW, boxH },
      font
    );
  }

  return pdf.save();
}

async function drawFieldPdf(
  doc: PDFDocument,
  page: PDFPage,
  type: FieldType,
  raw: string,
  box: { left: number; bottom: number; boxW: number; boxH: number },
  font: PDFFont
): Promise<void> {
  const { left, bottom, boxW, boxH } = box;
  const black = rgb(0.1, 0.12, 0.14);

  switch (type) {
    case "SIGNATURE": {
      if (raw.startsWith("data:image/")) {
        const { format, data } = parseImageDataUrl(raw);
        const image =
          format === "jpeg" ? await doc.embedJpg(data) : await doc.embedPng(data);
        page.drawImage(image, {
          x: left,
          y: bottom,
          width: boxW,
          height: boxH,
        });
      } else {
        const size = Math.min(14, Math.max(9, boxH * 0.42));
        page.drawText(raw.trim().slice(0, 200), {
          x: left + 2,
          y: bottom + boxH * 0.2,
          size,
          font,
          color: black,
          maxWidth: Math.max(8, boxW - 4),
        });
      }
      break;
    }
    case "TEXT":
    case "DATE":
    case "INITIAL": {
      const size = Math.min(12, Math.max(8, boxH * 0.38));
      page.drawText(raw.trim().slice(0, 2000), {
        x: left + 2,
        y: bottom + boxH * 0.18,
        size,
        font,
        color: black,
        maxWidth: Math.max(8, boxW - 4),
      });
      break;
    }
    case "CHECKBOX": {
      const on =
        raw === "true" ||
        raw === "yes" ||
        raw === "on" ||
        raw === "✓" ||
        raw.toLowerCase() === "x";
      if (on) {
        const size = Math.min(boxW, boxH) * 0.65;
        page.drawText("X", {
          x: left + boxW * 0.15,
          y: bottom + boxH * 0.12,
          size,
          font,
          color: black,
        });
      }
      break;
    }
    default:
      break;
  }
}
