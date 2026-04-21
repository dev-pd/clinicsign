"use client";

/**
 * Configures the pdf.js worker for react-pdf.
 *
 * Uses a dynamic import so this module is safe to reference from client
 * components without triggering pdfjs-dist's browser-only top-level code
 * during server-side rendering (which would crash the route with a 500).
 */
export async function configurePdfJsWorker(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }
  const { pdfjs } = await import("react-pdf");
  pdfjs.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdf.worker.min.mjs`;
}
