"use client";

import { pdfjs } from "react-pdf";

/** Configure pdf.js worker once for react-pdf in the browser. */
export function configurePdfJsWorker(): void {
  if (typeof window === "undefined") {
    return;
  }
  pdfjs.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdf.worker.min.mjs`;
}

configurePdfJsWorker();
