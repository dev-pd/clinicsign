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
import { Document, Page } from "react-pdf";

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
import { configurePdfJsWorker } from "@/lib/pdf-worker";

// Text/annotation layers are disabled on `<Page>` — no need for Mozilla pdf.js
// layer CSS (it also adds :root vars and extra chunks). If you turn layers on,
// import `react-pdf/dist/Page/TextLayer.css` and `AnnotationLayer.css` here.

// Heights are fractions of page height. On A4 (~842pt) the SIGNATURE box
// becomes ~50pt — tall enough that a drawn signature rendered with
// object-contain lands as a real signature, not a flattened pill. INITIAL
// keeps a tighter aspect (~42pt) since it's typically a 2–3 char monogram.
const FIELD_DEFAULTS: Record<ApiFieldType, { width: number; height: number }> =
  {
    SIGNATURE: { width: 0.28, height: 0.06 },
    TEXT: { width: 0.22, height: 0.022 },
    DATE: { width: 0.16, height: 0.022 },
    CHECKBOX: { width: 0.024, height: 0.024 },
    INITIAL: { width: 0.1, height: 0.05 },
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

/**
 * Per-type tint for the field overlay on the PDF. Keeps each field type
 * visually distinct without breaking the design-system "calm" rule —
 * everything is a low-opacity wash of an existing semantic token.
 *
 * - SIGNATURE/INITIAL share the brand sage to read as a single "sign here"
 *   family, with INITIAL slightly muted so it doesn't fight the marquee
 *   signature box.
 * - DATE uses info-blue so calendars feel calendarish without shouting.
 * - TEXT stays neutral so freeform input doesn't dominate the page.
 * - CHECKBOX uses success-green to read as a deliberate yes/no choice.
 *
 * Each entry has both a normal tint (for placed fields and toolbar buttons
 * in their idle state) and a stronger ghost tint (used for the cursor
 * preview while a tool is armed, so the user can see exactly where the
 * field will land).
 */
const FIELD_TINTS: Record<
  ApiFieldType,
  {
    bg: string;
    border: string;
    text: string;
    ghostBg: string;
    ghostBorder: string;
  }
> = {
  SIGNATURE: {
    bg: "bg-primary/10",
    border: "border-primary/60",
    text: "text-primary",
    ghostBg: "bg-primary/20",
    ghostBorder: "border-primary/70",
  },
  INITIAL: {
    bg: "bg-accent/50",
    border: "border-primary/50",
    text: "text-primary",
    ghostBg: "bg-accent/70",
    ghostBorder: "border-primary/60",
  },
  DATE: {
    bg: "bg-info/10",
    border: "border-info/55",
    text: "text-info",
    ghostBg: "bg-info/20",
    ghostBorder: "border-info/70",
  },
  TEXT: {
    bg: "bg-muted",
    border: "border-muted-foreground/45",
    text: "text-muted-foreground",
    ghostBg: "bg-muted-foreground/15",
    ghostBorder: "border-muted-foreground/55",
  },
  CHECKBOX: {
    bg: "bg-success/10",
    border: "border-success/55",
    text: "text-success",
    ghostBg: "bg-success/20",
    ghostBorder: "border-success/70",
  },
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Placement grid for fields. 0.5% of page width/height ≈ 4px on a
 * standard ~800px-wide rendered PDF, which is fine enough that the
 * user can hit any visual spot but coarse enough that two fields
 * placed in succession actually align. Hold Alt while dragging or
 * dropping to bypass — Figma convention.
 */
const SNAP_STEP = 0.005;

function snap(n: number, enabled: boolean): number {
  if (!enabled) {
    return n;
  }
  return Math.round(n / SNAP_STEP) * SNAP_STEP;
}

/**
 * Maximum distance at which a candidate position will be magnetized
 * to a sibling field's edge (top/left). 1.2% of page dim ≈ 10px on a
 * typical ~800px-wide PDF — close enough to feel intentional but
 * tight enough that fields you actually want offset by half a row
 * aren't yanked together.
 */
const ALIGN_THRESHOLD = 0.012;

/**
 * Smart alignment to existing fields on the same page. Mirrors how
 * design tools (Figma, Sketch) handle alignment guides: when a placed
 * or dragged field's top/left lands within ALIGN_THRESHOLD of any
 * other field's top/left on the same page, snap to that exact edge.
 *
 * This is layered ON TOP of the 0.5% grid snap because a grid alone
 * cannot guarantee alignment — two clicks 3px apart vertically still
 * land in adjacent grid cells, which reads as misaligned.
 *
 * Pass currentId to exclude the field being moved from its own
 * alignment search (otherwise dragging a field would always align it
 * to its own previous position).
 */
function alignToSiblings(
  x: number,
  y: number,
  page: number,
  fields: EditorField[],
  currentId: string | null
): { x: number; y: number } {
  let alignedX = x;
  let alignedY = y;
  let bestDx = ALIGN_THRESHOLD;
  let bestDy = ALIGN_THRESHOLD;
  for (const f of fields) {
    if (f.page !== page || f.id === currentId) {
      continue;
    }
    const dx = Math.abs(f.x - x);
    if (dx < bestDx) {
      alignedX = f.x;
      bestDx = dx;
    }
    const dy = Math.abs(f.y - y);
    if (dy < bestDy) {
      alignedY = f.y;
      bestDy = dy;
    }
  }
  return { x: alignedX, y: alignedY };
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
  /**
   * Which PDF to display.
   * - "original": the uploaded file (used during drafting and when there is
   *   no signed copy yet). Field overlays are drawn on top.
   * - "signed":   the flattened copy produced at sign time, which already
   *   has the patient's values baked in. Overlays are suppressed.
   */
  pdfVariant?: "original" | "signed";
};

export function DocumentPdfEditor({
  documentId,
  readOnly,
  fields: serverFields,
  updatedAt,
  pdfVariant = "original",
}: DocumentPdfEditorProps): JSX.Element {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  // Mobile-safe default for SSR (no DOM). The callback ref on the host
  // div replaces this with the real measurement as soon as the host
  // attaches to the DOM (see setPageHost below).
  const [containerWidth, setContainerWidth] = useState(320);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [workerReady, setWorkerReady] = useState(false);
  const [fields, setFields] = useState<EditorField[]>(() =>
    mapFromApi(serverFields ?? [])
  );
  const [tool, setTool] = useState<ToolMode>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Ghost preview that follows the cursor when a field tool is armed.
  // Lives at page-relative (0..1) coords so we can render it without
  // re-measuring on every render — same coordinate system as fields.
  const [ghost, setGhost] = useState<
    | {
        page: number;
        x: number;
        y: number;
      }
    | null
  >(null);

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

  /**
   * Callback ref for the unpadded measurement host. We use a callback
   * ref (not useRef + useLayoutEffect) because the host can mount in
   * later renders — e.g. after pdfUrl/workerReady transitions — and
   * useLayoutEffect with [] deps only fires once at component mount.
   * If the host weren't attached at that exact moment the effect would
   * short-circuit and never re-run, leaving containerWidth pinned to
   * the useState default. Callback refs fire on every attach/detach,
   * and React 19 supports returning a cleanup function for the
   * ResizeObserver.
   */
  const setPageHost = useCallback((el: HTMLDivElement | null) => {
    if (!el) {
      return;
    }
    const measure = (): void => {
      setContainerWidth(Math.max(280, el.clientWidth));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // Configure the pdf.js worker on the client before mounting <Document>.
  // Required because `pdf-worker.ts` no longer auto-invokes on import (that
  // used to crash SSR of the patient /sign/* route).
  useEffect(() => {
    let cancelled = false;
    void configurePdfJsWorker().then(() => {
      if (!cancelled) {
        setWorkerReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const { url } = await fetchPresignedDownload(
          token,
          documentId,
          pdfVariant
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
  }, [documentId, getToken, updatedAt, pdfVariant]);

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

  // pageHostRef.clientWidth is the exact width available for the page wrap.
  // No max cap: on wide monitors users want the PDF to fill the editor area,
  // not sit at 900px with empty whitespace on both sides.
  const pageWidth = Math.max(280, containerWidth);

  const addField = useCallback((
    type: ApiFieldType,
    page: number,
    nx: number,
    ny: number,
    snapEnabled: boolean
  ) => {
    const { width: w, height: h } = FIELD_DEFAULTS[type];
    let x = clamp01(snap(nx - w / 2, snapEnabled));
    let y = clamp01(snap(ny - h / 2, snapEnabled));
    if (snapEnabled) {
      const aligned = alignToSiblings(x, y, page, fields, null);
      x = aligned.x;
      y = aligned.y;
    }
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
  }, [fields]);

  const removeField = useCallback((id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
    setSelectedId((s) => (s === id ? null : s));
  }, []);

  const toggleRequired = useCallback((id: string) => {
    setFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, required: !f.required } : f))
    );
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
      // Hold Alt to bypass both the grid snap and the alignment guides
      // for pixel-precise placement.
      const snapEnabled = !e.altKey;
      setFields((prev) =>
        prev.map((f) => {
          if (f.id !== d.fieldId) {
            return f;
          }
          let nx = clamp01(snap(d.origin.x + dx, snapEnabled));
          let ny = clamp01(snap(d.origin.y + dy, snapEnabled));
          if (snapEnabled) {
            const aligned = alignToSiblings(nx, ny, f.page, prev, f.id);
            nx = aligned.x;
            ny = aligned.y;
          }
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
    addField(tool, pageNumber, nx, ny, !e.altKey);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (readOnly) {
        return;
      }
      const t = e.target as HTMLElement;
      const isTyping = t.tagName === "INPUT" || t.tagName === "TEXTAREA";

      // ESC disarms the active tool (Figma-style cancel). Also clears the
      // selection so the user gets a clean slate.
      if (e.key === "Escape") {
        if (tool !== "select") {
          e.preventDefault();
          setTool("select");
          setGhost(null);
        } else if (selectedId) {
          setSelectedId(null);
        }
        return;
      }

      if (!selectedId || isTyping) {
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeField(selectedId);
        return;
      }
      // R toggles required on the selected field. Lowercase only — the
      // uppercase variant is reserved so Shift+R doesn't collide with
      // future shortcuts (e.g. resize, replace) and keeps the behavior
      // discoverable from the side panel button label.
      if (e.key === "r" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggleRequired(selectedId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readOnly, selectedId, removeField, toggleRequired, tool]);

  // Track the cursor over each page (in 0..1 coords) so we can render a
  // ghost preview of where the field will land. Only fires when a tool is
  // armed — keeps Select-mode hovering free of state churn.
  function handlePageMouseMove(
    pageNumber: number,
    e: React.MouseEvent<HTMLDivElement>
  ): void {
    if (readOnly || tool === "select") {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    // Snap the ghost so the preview matches the final placement
    // (handlePageClick uses the same alt-bypass rule). The early
    // return above narrows tool to ApiFieldType, so FIELD_DEFAULTS
    // lookup is type-safe.
    const snapEnabled = !e.altKey;
    const dims = FIELD_DEFAULTS[tool];
    let topLeftX = clamp01(snap(nx - dims.width / 2, snapEnabled));
    let topLeftY = clamp01(snap(ny - dims.height / 2, snapEnabled));
    if (snapEnabled) {
      const aligned = alignToSiblings(
        topLeftX,
        topLeftY,
        pageNumber,
        fields,
        null
      );
      topLeftX = aligned.x;
      topLeftY = aligned.y;
    }
    setGhost({
      page: pageNumber,
      x: topLeftX + dims.width / 2,
      y: topLeftY + dims.height / 2,
    });
  }

  function handlePageMouseLeave(): void {
    if (ghost) {
      setGhost(null);
    }
  }

  const selected = fields.find((f) => f.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
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
              const tint = FIELD_TINTS[ft];
              const active = tool === ft;
              return (
                <Button
                  key={ft}
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    "gap-1.5 border-2 transition-colors",
                    active
                      ? cn(tint.ghostBg, tint.ghostBorder, tint.text, "shadow-sm")
                      : "border-border hover:bg-muted"
                  )}
                  onClick={() => setTool(active ? "select" : ft)}
                  aria-pressed={active}
                  title={`Place ${FIELD_LABEL[ft].toLowerCase()} field`}
                >
                  <Icon
                    className={cn("h-4 w-4", active ? tint.text : "text-muted-foreground")}
                    aria-hidden
                    strokeWidth={1.75}
                  />
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
          {tool === "select" ? (
            <>
              Drag fields to reposition (snaps to a 0.5% grid; hold{" "}
              <kbd className="rounded border bg-muted px-1 font-mono text-caption">
                Alt
              </kbd>{" "}
              to bypass). Press{" "}
              <kbd className="rounded border bg-muted px-1 font-mono text-caption">
                R
              </kbd>{" "}
              to toggle required,{" "}
              <kbd className="rounded border bg-muted px-1 font-mono text-caption">
                Delete
              </kbd>{" "}
              to remove.
            </>
          ) : (
            <>
              Click on the page to drop a{" "}
              <strong className="text-foreground">{FIELD_LABEL[tool]}</strong>{" "}
              field. Hold{" "}
              <kbd className="rounded border bg-muted px-1 font-mono text-caption">
                Alt
              </kbd>{" "}
              to bypass snap, or press{" "}
              <kbd className="rounded border bg-muted px-1 font-mono text-caption">
                Esc
              </kbd>{" "}
              to cancel.
            </>
          )}
        </p>
      ) : null}

      {pdfLoadError ? (
        <p className="text-body text-destructive">{pdfLoadError}</p>
      ) : null}

      {/*
        Scroll wrapper + pageHostRef must mount on first render so the
        layout effect can measure el.clientWidth via ResizeObserver.
        Previously this whole subtree was gated on `pdfUrl && workerReady`,
        which left the ref null on mount; the effect ran once, returned
        early, and pageWidth stayed pinned to the useState(320) default.
        Now the host is always present and the loading message lives
        inside it; the Document mounts later when the URL + worker are
        ready, but the host width is already known by then.
      */}
      {!pdfLoadError ? (
        <div
          className="bg-muted/30 border-border max-h-[min(80vh,900px)] overflow-y-auto overscroll-contain rounded-md border p-3"
          aria-label={
            numPages > 1
              ? `PDF preview, ${numPages} pages — scroll to see more`
              : "PDF preview"
          }
        >
        <div ref={setPageHost} className="w-full">
        {pdfUrl && workerReady ? (
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
                const armed = tool !== "select" && !readOnly;
                const showGhost =
                  armed && ghost !== null && ghost.page === pageNumber;
                const ghostDims = armed ? FIELD_DEFAULTS[tool] : null;
                return (
                  <div
                    key={pageNumber}
                    data-pdf-page-wrap
                    style={{ width: pageWidth }}
                    className={cn(
                      "relative block max-w-full",
                      armed && "cursor-crosshair"
                    )}
                    onClick={(e) => handlePageClick(pageNumber, e)}
                    onMouseMove={(e) => handlePageMouseMove(pageNumber, e)}
                    onMouseLeave={handlePageMouseLeave}
                  >
                    <Page
                      pageNumber={pageNumber}
                      width={pageWidth}
                      className="bg-card shadow-sm"
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                    {showGhost && ghostDims ? (
                      <div
                        aria-hidden
                        className={cn(
                          "pointer-events-none absolute rounded-sm border-2 border-dashed transition-none",
                          FIELD_TINTS[tool].ghostBorder,
                          FIELD_TINTS[tool].ghostBg
                        )}
                        style={{
                          left: `${clamp01(ghost.x - ghostDims.width / 2) * 100}%`,
                          top: `${clamp01(ghost.y - ghostDims.height / 2) * 100}%`,
                          width: `${ghostDims.width * 100}%`,
                          height: `${ghostDims.height * 100}%`,
                        }}
                      />
                    ) : null}
                    {pdfVariant === "signed"
                      ? null
                      : fields
                      .filter((f) => f.page === pageNumber)
                      .map((field) => {
                        const tint = FIELD_TINTS[field.type];
                        const Icon = TOOL_ICONS[field.type];
                        const isSelected = selectedId === field.id;
                        const isCheckbox = field.type === "CHECKBOX";
                        return (
                          <div
                            key={field.id}
                            data-field-overlay
                            role="presentation"
                            className={cn(
                              "group absolute flex cursor-grab items-center gap-1 rounded-sm border p-0 text-left text-caption shadow-sm transition-shadow active:cursor-grabbing",
                              tint.bg,
                              tint.border,
                              tint.text,
                              "hover:shadow-md",
                              isSelected &&
                                "ring-ring ring-offset-background border-2 ring-2 ring-offset-2"
                            )}
                            style={{
                              left: `${field.x * 100}%`,
                              top: `${field.y * 100}%`,
                              width: `${field.width * 100}%`,
                              height: `${field.height * 100}%`,
                            }}
                            onPointerDown={(e) => startDrag(field, e)}
                          >
                            {isCheckbox ? (
                              <CheckSquare
                                className="pointer-events-none m-auto h-[70%] w-[70%]"
                                strokeWidth={1.75}
                                aria-hidden
                              />
                            ) : (
                              <span className="pointer-events-none flex min-w-0 flex-1 items-center gap-1 px-1 leading-none">
                                <Icon
                                  className="h-3 w-3 shrink-0 opacity-80"
                                  strokeWidth={1.75}
                                  aria-hidden
                                />
                                <span className="truncate font-medium">
                                  {FIELD_LABEL[field.type]}
                                </span>
                              </span>
                            )}
                            {field.required ? (
                              <span
                                className="bg-destructive pointer-events-none absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-background"
                                aria-label="Required"
                                title="Required"
                              />
                            ) : null}
                            {!readOnly &&
                            tool === "select" &&
                            isSelected ? (
                              <button
                                type="button"
                                data-delete-field
                                className="text-destructive hover:bg-destructive/10 pointer-events-auto absolute -right-2 -top-2 rounded-full bg-card p-0.5 shadow-sm ring-1 ring-border"
                                aria-label="Remove field"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  removeField(field.id);
                                }}
                                onPointerDown={(ev) => ev.stopPropagation()}
                              >
                                <Trash2
                                  className="h-3 w-3"
                                  strokeWidth={1.75}
                                />
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                  </div>
                );
              })
            : null}
        </Document>
        ) : (
          <div className="text-body text-muted-foreground flex items-center gap-2 py-8">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Preparing viewer…
          </div>
        )}
        </div>
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
          <CardContent className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={selected.required}
              onClick={() => toggleRequired(selected.id)}
              className={cn(
                "gap-2 transition-colors",
                selected.required
                  ? "border-destructive/60 bg-destructive/10 text-destructive hover:bg-destructive/15"
                  : "text-muted-foreground"
              )}
              title={
                selected.required
                  ? "Required — recipient must fill this field"
                  : "Optional — recipient can skip this field"
              }
            >
              <span
                aria-hidden="true"
                className={cn(
                  "inline-block h-1.5 w-1.5 rounded-full",
                  selected.required ? "bg-destructive" : "bg-muted-foreground/60"
                )}
              />
              {selected.required ? "Required" : "Optional"}
            </Button>
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
