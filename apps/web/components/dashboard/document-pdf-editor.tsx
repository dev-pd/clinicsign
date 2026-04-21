"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Calendar,
  CheckSquare,
  Loader2,
  PenLine,
  Save,
  Trash2,
  Type,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ApiDocumentField, ApiFieldType } from "@/lib/api-types";
import {
  ApiError,
  fetchPresignedDownload,
  patchDocument,
} from "@/lib/api-client";

/** Same-origin worker avoids CSP/offline failures from a CDN. File must match `pdfjs-dist` version. */
function configurePdfJsWorker(): void {
  if (typeof window === "undefined") {
    return;
  }
  pdfjs.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdf.worker.min.mjs`;
}

configurePdfJsWorker();

// Text/annotation layers are disabled on `<Page>` — no need for Mozilla pdf.js
// layer CSS (it also adds :root vars and extra chunks). If you turn layers on,
// import `react-pdf/dist/Page/TextLayer.css` and `AnnotationLayer.css` here.

const FIELD_DEFAULTS: Record<ApiFieldType, { width: number; height: number }> =
  {
    SIGNATURE: { width: 0.28, height: 0.035 },
    TEXT: { width: 0.22, height: 0.022 },
    DATE: { width: 0.16, height: 0.022 },
    CHECKBOX: { width: 0.024, height: 0.024 },
    INITIAL: { width: 0.1, height: 0.028 },
  };

const FIELD_LABEL: Record<ApiFieldType, string> = {
  SIGNATURE: "Signature",
  TEXT: "Text",
  DATE: "Date",
  CHECKBOX: "Checkbox",
  INITIAL: "Initial",
};

const TOOL_ICONS: Record<ApiFieldType, typeof PenLine> = {
  SIGNATURE: PenLine,
  TEXT: Type,
  DATE: Calendar,
  CHECKBOX: CheckSquare,
  INITIAL: UserRound,
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

type EditorField = {
  id: string;
  type: ApiFieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
};

function mapFromApi(rows: ApiDocumentField[]): EditorField[] {
  return rows.map((f) => ({
    id: f.id,
    type: f.type,
    page: f.page,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    required: f.required,
  }));
}

function toPatchPayload(fields: EditorField[]): Parameters<
  typeof patchDocument
>[2]["fields"] {
  return fields.map((f) => ({
    type: f.type,
    page: f.page,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    required: f.required,
    recipientId: null,
  }));
}

type ToolMode = "select" | ApiFieldType;

export type DocumentPdfEditorProps = {
  documentId: string;
  readOnly: boolean;
  fields: ApiDocumentField[];
  updatedAt: string;
};

export function DocumentPdfEditor({
  documentId,
  readOnly,
  fields: serverFields,
  updatedAt,
}: DocumentPdfEditorProps): JSX.Element {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(720);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [fields, setFields] = useState<EditorField[]>(() =>
    mapFromApi(serverFields ?? [])
  );
  const [tool, setTool] = useState<ToolMode>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activeDrag = useRef<{
    fieldId: string;
    startMouse: { x: number; y: number };
    origin: { x: number; y: number };
    pageRect: DOMRect;
    moved: boolean;
  } | null>(null);

  const serverModel = useMemo(
    () => mapFromApi(serverFields ?? []),
    [serverFields]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver(() => {
      setContainerWidth(Math.max(280, el.clientWidth));
    });
    ro.observe(el);
    setContainerWidth(Math.max(280, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const { url } = await fetchPresignedDownload(
          token,
          documentId,
          "original"
        );
        if (!cancelled) {
          setPdfUrl(url);
          setPdfLoadError(null);
        }
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : "Could not load document URL.";
        if (!cancelled) {
          setPdfLoadError(message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId, getToken, updatedAt]);

  const dirty = useMemo(
    () => JSON.stringify(fields) !== JSON.stringify(serverModel),
    [fields, serverModel]
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return patchDocument(token, documentId, {
        fields: toPatchPayload(fields),
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["document", documentId], data);
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Fields saved");
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Could not save fields.";
      toast.error(message);
    },
  });

  const pageWidth = Math.min(900, containerWidth);

  const addField = useCallback((type: ApiFieldType, page: number, nx: number, ny: number) => {
    const { width: w, height: h } = FIELD_DEFAULTS[type];
    let x = clamp01(nx - w / 2);
    let y = clamp01(ny - h / 2);
    x = Math.min(x, 1 - w);
    y = Math.min(y, 1 - h);
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setFields((prev) => [
      ...prev,
      {
        id,
        type,
        page,
        x,
        y,
        width: w,
        height: h,
        required: true,
      },
    ]);
    setSelectedId(id);
    setTool("select");
  }, []);

  const removeField = useCallback((id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
    setSelectedId((s) => (s === id ? null : s));
  }, []);

  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      const d = activeDrag.current;
      if (!d) {
        return;
      }
      const dist = Math.hypot(
        e.clientX - d.startMouse.x,
        e.clientY - d.startMouse.y
      );
      if (dist > 4) {
        d.moved = true;
      }
      if (!d.moved) {
        return;
      }
      const pw = d.pageRect.width;
      const ph = d.pageRect.height;
      const dx = (e.clientX - d.startMouse.x) / pw;
      const dy = (e.clientY - d.startMouse.y) / ph;
      setFields((prev) =>
        prev.map((f) => {
          if (f.id !== d.fieldId) {
            return f;
          }
          const nx = clamp01(d.origin.x + dx);
          const ny = clamp01(d.origin.y + dy);
          return {
            ...f,
            x: Math.min(nx, 1 - f.width),
            y: Math.min(ny, 1 - f.height),
          };
        })
      );
    }
    function onPointerUp() {
      const d = activeDrag.current;
      if (!d) {
        return;
      }
      if (!d.moved) {
        setSelectedId(d.fieldId);
      }
      activeDrag.current = null;
    }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  function startDrag(field: EditorField, e: React.PointerEvent): void {
    if (readOnly || tool !== "select") {
      return;
    }
    if ((e.target as HTMLElement).closest("[data-delete-field]")) {
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget.closest("[data-pdf-page-wrap]");
    if (!el || !(el instanceof HTMLElement)) {
      return;
    }
    const rect = el.getBoundingClientRect();
    activeDrag.current = {
      fieldId: field.id,
      startMouse: { x: e.clientX, y: e.clientY },
      origin: { x: field.x, y: field.y },
      pageRect: rect,
      moved: false,
    };
  }

  function handlePageClick(
    pageNumber: number,
    e: React.MouseEvent<HTMLDivElement>
  ): void {
    if (readOnly) {
      return;
    }
    if (tool === "select") {
      if ((e.target as HTMLElement).closest("[data-field-overlay]")) {
        return;
      }
      setSelectedId(null);
      return;
    }
    if ((e.target as HTMLElement).closest("[data-field-overlay]")) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    addField(tool, pageNumber, nx, ny);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (readOnly || !selectedId) {
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        const t = e.target as HTMLElement;
        if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") {
          return;
        }
        e.preventDefault();
        removeField(selectedId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readOnly, selectedId, removeField]);

  const selected = fields.find((f) => f.id === selectedId) ?? null;

  return (
    <div ref={containerRef} className="space-y-4">
      {!readOnly ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Field tools">
            <Button
              type="button"
              variant={tool === "select" ? "default" : "outline"}
              size="sm"
              className="gap-1"
              onClick={() => setTool("select")}
            >
              Select
            </Button>
            {(Object.keys(FIELD_DEFAULTS) as ApiFieldType[]).map((ft) => {
              const Icon = TOOL_ICONS[ft];
              const active = tool === ft;
              return (
                <Button
                  key={ft}
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  className="gap-1"
                  onClick={() => setTool(active ? "select" : ft)}
                  aria-pressed={active}
                >
                  <Icon className="h-4 w-4" aria-hidden strokeWidth={1.5} />
                  <span className="hidden sm:inline">{FIELD_LABEL[ft]}</span>
                </Button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            {dirty ? (
              <span className="text-caption text-muted-foreground">
                Unsaved changes
              </span>
            ) : null}
            <Button
              type="button"
              size="sm"
              disabled={!dirty || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Save className="mr-2 h-4 w-4" aria-hidden strokeWidth={1.5} />
              )}
              Save fields
            </Button>
          </div>
        </div>
      ) : null}

      {saveMutation.isError ? (
        <p className="text-body-sm text-destructive" role="alert">
          {saveMutation.error instanceof ApiError
            ? saveMutation.error.message
            : "Could not save fields."}
        </p>
      ) : null}

      {!readOnly ? (
        <p className="text-body-sm text-muted-foreground">
          Positions are stored relative to each page (0–1). Choose a field type,
          then click on the page. Drag fields in Select mode. Press Delete to
          remove.
        </p>
      ) : null}

      {pdfLoadError ? (
        <p className="text-body text-destructive">{pdfLoadError}</p>
      ) : null}

      {pdfUrl && !pdfLoadError ? (
        <Document
          file={pdfUrl}
          loading={
            <div className="text-body text-muted-foreground flex items-center gap-2 py-12">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              Loading PDF…
            </div>
          }
          error={
            <p className="text-body text-destructive">
              Could not render PDF. Try refreshing the page.
            </p>
          }
          onLoadSuccess={({ numPages: n }) => {
            setNumPages(n);
          }}
          className="flex flex-col items-center gap-6"
        >
          {numPages > 0
            ? Array.from({ length: numPages }, (_, i) => {
                const pageNumber = i + 1;
                return (
                  <div
                    key={pageNumber}
                    data-pdf-page-wrap
                    className="relative inline-block max-w-full"
                    onClick={(e) => handlePageClick(pageNumber, e)}
                  >
                    <Page
                      pageNumber={pageNumber}
                      width={pageWidth}
                      className="bg-card shadow-sm"
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                    {fields
                      .filter((f) => f.page === pageNumber)
                      .map((field) => (
                        <div
                          key={field.id}
                          data-field-overlay
                          role="presentation"
                          className={cn(
                            "absolute flex cursor-grab items-start justify-between gap-1 border-2 p-0.5 text-left text-caption active:cursor-grabbing",
                            "border-primary/60 bg-primary/10 text-primary",
                            selectedId === field.id &&
                              "ring-2 ring-ring ring-offset-2"
                          )}
                          style={{
                            left: `${field.x * 100}%`,
                            top: `${field.y * 100}%`,
                            width: `${field.width * 100}%`,
                            height: `${field.height * 100}%`,
                          }}
                          onPointerDown={(e) => startDrag(field, e)}
                        >
                          <span className="pointer-events-none truncate leading-none">
                            {FIELD_LABEL[field.type]}
                          </span>
                          {!readOnly && tool === "select" && selectedId === field.id ? (
                            <button
                              type="button"
                              data-delete-field
                              className="pointer-events-auto rounded p-0.5 text-destructive hover:bg-destructive/10"
                              aria-label="Remove field"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                removeField(field.id);
                              }}
                              onPointerDown={(ev) => ev.stopPropagation()}
                            >
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                            </button>
                          ) : null}
                        </div>
                      ))}
                  </div>
                );
              })
            : null}
        </Document>
      ) : !pdfLoadError ? (
        <div className="text-body text-muted-foreground flex items-center gap-2 py-8">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Preparing viewer…
        </div>
      ) : null}

      {selected && !readOnly ? (
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-h4">Selected field</CardTitle>
            <CardDescription>
              {FIELD_LABEL[selected.type]} on page {selected.page}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 text-destructive"
              onClick={() => removeField(selected.id)}
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.5} />
              Remove field
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export default DocumentPdfEditor;
