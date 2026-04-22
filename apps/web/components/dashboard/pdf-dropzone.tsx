"use client";

import { FileUp, FileText, X } from "lucide-react";
import * as React from "react";

import { configurePdfJsWorker } from "@/lib/pdf-worker";
import { cn } from "@/lib/utils";

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Reads the number of pages from a PDF file in the browser via pdf.js.
 * Returns null on any failure (encrypted PDF, malformed bytes, worker
 * config missing) — callers should render a graceful fallback instead
 * of treating it as an error.
 */
async function readPdfPageCount(file: File): Promise<number | null> {
  try {
    await configurePdfJsWorker();
    const { pdfjs } = await import("react-pdf");
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const count = doc.numPages;
    await doc.destroy();
    return count;
  } catch {
    return null;
  }
}

function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export type PdfDropzoneProps = {
  file: File | null;
  onFileChange: (file: File | null) => void;
  /** When true, the visual is dimmed and interactions are blocked. */
  disabled?: boolean;
  /** Optional id, useful for connecting an external <label htmlFor=...>. */
  inputId?: string;
};

/**
 * Drag-and-drop / click-to-pick zone for a single PDF.
 *
 * Hand-rolled with native HTML5 drag events to avoid pulling in
 * react-dropzone for a single-file picker. Validates extension + MIME and
 * surfaces a friendly inline error rather than a toast (the dropzone is
 * always visible, so inline keeps the feedback tied to the action).
 */
export function PdfDropzone({
  file,
  onFileChange,
  disabled = false,
  inputId = "pdf-dropzone-input",
}: PdfDropzoneProps): JSX.Element {
  const [isDragging, setIsDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Keyed by `file` identity so that a new file selection immediately
  // surfaces as "reading" without a synchronous setState inside the
  // effect (which the React 19 lint rule disallows).
  const [pageResult, setPageResult] = React.useState<{
    file: File | null;
    count: number | null;
  }>({ file: null, count: null });
  const dragDepth = React.useRef(0);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const isReadingPages = file !== null && pageResult.file !== file;
  const pageCount = pageResult.file === file ? pageResult.count : null;

  React.useEffect(() => {
    if (!file) return;
    let cancelled = false;
    void readPdfPageCount(file).then((count) => {
      if (!cancelled) setPageResult({ file, count });
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  function validateAndSet(picked: File | null | undefined): void {
    setError(null);
    if (!picked) {
      onFileChange(null);
      return;
    }
    if (!isPdfFile(picked)) {
      setError("That file isn't a PDF. Choose a .pdf to continue.");
      return;
    }
    if (picked.size === 0) {
      setError("That PDF appears to be empty. Choose a different file.");
      return;
    }
    if (picked.size > MAX_BYTES) {
      setError(
        `That PDF is ${formatBytes(picked.size)} — the limit is ${formatBytes(
          MAX_BYTES
        )}.`
      );
      return;
    }
    onFileChange(picked);
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>): void {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    dragDepth.current = 0;
    setIsDragging(false);
    validateAndSet(e.dataTransfer.files?.[0]);
  }

  function handleDragEnter(e: React.DragEvent<HTMLLabelElement>): void {
    e.preventDefault();
    if (disabled) return;
    dragDepth.current += 1;
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLLabelElement>): void {
    e.preventDefault();
    if (disabled) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) {
      setIsDragging(false);
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLLabelElement>): void {
    e.preventDefault();
  }

  function clear(): void {
    if (inputRef.current) inputRef.current.value = "";
    setError(null);
    onFileChange(null);
  }

  if (file) {
    return (
      <div className="bg-card border-border rounded-lg border p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="bg-primary/10 text-primary flex h-12 w-12 shrink-0 items-center justify-center rounded-md">
            <FileText className="h-6 w-6" strokeWidth={2} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-body text-foreground truncate font-medium">
              {file.name}
            </div>
            <div className="text-caption text-muted-foreground mt-1">
              PDF · {formatBytes(file.size)}
              {isReadingPages ? (
                <span className="ml-1">· reading…</span>
              ) : pageCount !== null ? (
                <span className="ml-1">
                  · {pageCount} {pageCount === 1 ? "page" : "pages"}
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            className="text-muted-foreground hover:text-foreground hover:bg-accent/60 flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-50"
            aria-label="Remove selected PDF"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="text-primary text-body-sm hover:underline mt-4 font-medium underline-offset-4 disabled:opacity-50"
        >
          Replace file
        </button>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(e) => validateAndSet(e.target.files?.[0])}
          disabled={disabled}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label
        htmlFor={inputId}
        onDrop={handleDrop}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        className={cn(
          "border-border bg-card flex min-h-[260px] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center shadow-sm transition-colors",
          "hover:border-primary/50 hover:bg-primary/5",
          isDragging && "border-primary bg-primary/10",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        <div
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full transition-colors",
            isDragging
              ? "bg-primary text-primary-foreground"
              : "bg-primary/10 text-primary"
          )}
        >
          <FileUp className="h-7 w-7" strokeWidth={1.75} aria-hidden />
        </div>
        <div className="space-y-1">
          <div className="text-body text-foreground font-medium">
            {isDragging ? "Drop your PDF here" : "Drag and drop your PDF"}
          </div>
          <div className="text-body-sm text-muted-foreground">
            or{" "}
            <span className="text-primary font-medium underline-offset-4 hover:underline">
              click to browse
            </span>
          </div>
          <div className="text-caption text-muted-foreground pt-1">
            PDF only · up to {formatBytes(MAX_BYTES)}
          </div>
        </div>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(e) => validateAndSet(e.target.files?.[0])}
          disabled={disabled}
        />
      </label>
      {error ? (
        <p className="text-destructive text-body-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
