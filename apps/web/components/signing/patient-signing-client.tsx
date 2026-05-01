"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  Calendar,
  Check,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import dynamic from "next/dynamic";
import * as React from "react";
import SignaturePad from "signature_pad";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ApiError,
  completeSigning,
  fetchSigningView,
} from "@/lib/api-client";
import type { ApiFieldType } from "@/lib/api-types";
import { configurePdfJsWorker } from "@/lib/pdf-worker";
import { cn } from "@/lib/utils";

const Document = dynamic(
  () => import("react-pdf").then((m) => m.Document),
  { ssr: false }
);
const Page = dynamic(
  () => import("react-pdf").then((m) => m.Page),
  { ssr: false }
);

const FIELD_LABEL: Record<ApiFieldType, string> = {
  SIGNATURE: "Signature",
  TEXT: "Text",
  DATE: "Date",
  CHECKBOX: "Checkbox",
  INITIAL: "Initial",
};

function isValidToken(t: string): boolean {
  return /^[a-f0-9]{64}$/i.test(t);
}

/**
 * Whether a field currently has a meaningful value. Centralized here because
 * three separate places (render state, submit gate, auto-scroll next pointer)
 * all need the exact same definition — drift between them would let the
 * "Sign here" pill point at a field the submit gate thinks is done.
 */
function isFieldFilled(
  values: Record<string, string>,
  field: { id: string; type: ApiFieldType }
): boolean {
  const raw = values[field.id] ?? "";
  return field.type === "CHECKBOX" ? raw === "true" : raw.trim().length > 0;
}

/**
 * Scroll a field overlay into view without snapping the user to the top of
 * the viewport. `block: "center"` is picked so the field lands roughly in
 * the middle of both the page window AND the inner PDF scroll container
 * (scrollIntoView walks every scrollable ancestor). Soft-fails on SSR.
 */
function scrollToFieldId(id: string): void {
  if (typeof document === "undefined") {
    return;
  }
  const el = document.querySelector<HTMLElement>(`[data-field-id="${id}"]`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

/**
 * What the field overlay shows on top of the PDF.
 * - Empty: type label + "*" if required (low-emphasis prompt to act).
 * - Filled: the actual value the patient entered, sized to fit the box.
 *
 * Image signatures are rendered with object-contain so the stroke fills the
 * box without distortion. Text-based fields use leading-tight + truncate so
 * very long values stay inside the cell.
 */
function FieldOverlayContent({
  type,
  required,
  value,
}: {
  type: ApiFieldType;
  required: boolean;
  value: string;
}): React.ReactElement {
  const empty = type === "CHECKBOX" ? value !== "true" : value.trim() === "";

  if (empty) {
    return (
      <span className="pointer-events-none flex w-full items-center gap-1 truncate px-1.5 text-caption font-medium leading-none">
        {type === "DATE" ? (
          <Calendar className="h-3 w-3 shrink-0" aria-hidden strokeWidth={2} />
        ) : null}
        <span className="truncate">
          {FIELD_LABEL[type]}
          {required ? " *" : ""}
        </span>
      </span>
    );
  }

  if (type === "CHECKBOX") {
    return (
      <span className="pointer-events-none flex h-full w-full items-center justify-center">
        <Check className="h-full w-full p-0.5" aria-hidden strokeWidth={3} />
      </span>
    );
  }

  if (type === "SIGNATURE" && value.startsWith("data:image")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- data: URL signature preview
      <img
        src={value}
        alt="Your signature"
        className="pointer-events-none h-full w-full object-contain"
      />
    );
  }

  if (type === "DATE") {
    let label = value;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      label = parsed.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
    return (
      <span className="pointer-events-none flex w-full items-center gap-1 px-1.5 text-body-sm leading-none">
        <Calendar className="h-3 w-3 shrink-0" aria-hidden strokeWidth={2} />
        <span className="truncate">{label}</span>
      </span>
    );
  }

  // TEXT, INITIAL, typed SIGNATURE — render the value directly.
  const isTypedSignature = type === "SIGNATURE";
  return (
    <span
      className={cn(
        "pointer-events-none w-full truncate px-1.5 leading-none",
        isTypedSignature
          ? "text-body italic"
          : "text-body-sm"
      )}
    >
      {value}
    </span>
  );
}

type PatientSigningClientProps = {
  token: string;
};

export function PatientSigningClient({
  token,
}: PatientSigningClientProps): React.ReactElement | null {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const sigPadRef = React.useRef<SignaturePad | null>(null);

  // Mobile-safe default: SSR has no DOM to measure, so we start small.
  // The callback ref below replaces this with the actual measurement
  // as soon as the host div attaches to the DOM.
  const [pageWidth, setPageWidth] = React.useState(320);
  const [numPages, setNumPages] = React.useState(0);
  const [workerReady, setWorkerReady] = React.useState(false);

  const [activeFieldId, setActiveFieldId] = React.useState<string | null>(null);
  const [sigTab, setSigTab] = React.useState<"type" | "draw">("draw");
  const [typedSig, setTypedSig] = React.useState("");
  const [draftText, setDraftText] = React.useState("");

  const viewQuery = useQuery({
    queryKey: ["signing-view", token],
    enabled: isValidToken(token),
    queryFn: () => fetchSigningView(token),
  });

  const serverDefaults = React.useMemo((): Record<string, string> => {
    if (!viewQuery.data) {
      return {};
    }
    const next: Record<string, string> = {};
    for (const f of viewQuery.data.fields) {
      next[f.id] = f.value ?? "";
    }
    return next;
  }, [viewQuery.data]);

  const [edits, setEdits] = React.useState<Record<string, string>>({});

  const values = React.useMemo(
    () => ({ ...serverDefaults, ...edits }),
    [serverDefaults, edits]
  );

  /**
   * Callback ref on the unpadded measurement host. We use a callback ref
   * (not useRef + useLayoutEffect) because the host mounts conditionally
   * — only after viewQuery resolves and the PDF card renders. A
   * useLayoutEffect with an empty deps array runs ONCE at component
   * mount, when the host hasn't attached yet, returning early; it never
   * re-runs when the host eventually attaches, so pageWidth would stay
   * pinned to the useState default forever (proven by the ?debug=1
   * inspector showing wrap=320px on a 1500px laptop).
   *
   * Callback refs fire whenever the element attaches or detaches from
   * the DOM, regardless of when in the lifecycle that happens. React 19
   * supports returning a cleanup function from a callback ref, which we
   * use to disconnect the ResizeObserver on detach.
   */
  const setPageHost = React.useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) {
        return;
      }
      const measure = (): void => {
        setPageWidth(Math.max(280, el.clientWidth));
      };
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      measure();
      return () => ro.disconnect();
    },
    []
  );

  // Configure the pdf.js worker lazily on the client. Keeping this out of
  // module scope prevents pdfjs-dist's browser-only top-level code from
  // executing during SSR, which otherwise 500s the `/sign/*` route.
  React.useEffect(() => {
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

  const activeField = React.useMemo(
    () =>
      viewQuery.data?.fields.find((f) => f.id === activeFieldId) ?? null,
    [activeFieldId, viewQuery.data?.fields]
  );

  // Mount SignaturePad after the dialog has actually painted. Two reasons:
  //   1. Radix Dialog uses a portal; the canvas isn't in the DOM on the
  //      same tick we set `activeFieldId`. A rAF gives it one paint to mount.
  //   2. signature_pad's pointer/mouse listeners attach during construction.
  //      If they attach before the canvas has measurable CSS dimensions, the
  //      coordinate math collapses to (0,0) and strokes look like nothing
  //      happened. Measuring after rAF guarantees `clientWidth > 0`.
  // We also honor devicePixelRatio so strokes are crisp on retina screens
  // and the pen actually lands where the user touches.
  React.useEffect(() => {
    if (!activeField || activeField.type !== "SIGNATURE" || sigTab !== "draw") {
      return;
    }

    let cancelled = false;
    let pad: SignaturePad | null = null;

    const raf = window.requestAnimationFrame(() => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Read the rendered size from CSS (Tailwind controls it responsively
      // via h-[160px] sm:h-[180px]). Hardcoding 180 here would make the
      // backing buffer mismatch the on-screen size on phones, dropping
      // strokes outside the visible area.
      const cssWidth = canvas.clientWidth || 440;
      const cssHeight = canvas.clientHeight || 180;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);

      canvas.width = Math.floor(cssWidth * ratio);
      canvas.height = Math.floor(cssHeight * ratio);

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(ratio, ratio);
      }

      pad = new SignaturePad(canvas, {
        backgroundColor: "rgb(255, 255, 255)",
        penColor: "rgb(17, 24, 39)",
        minWidth: 0.6,
        maxWidth: 2.2,
      });
      sigPadRef.current = pad;
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      pad?.off();
      sigPadRef.current = null;
    };
  }, [activeField, sigTab]);

  const completeMut = useMutation({
    mutationFn: async () => {
      const data = viewQuery.data;
      if (!data) {
        throw new Error("Missing document.");
      }
      const fieldValues = data.fields.map((f) => ({
        fieldId: f.id,
        value: values[f.id] ?? "",
      }));
      await completeSigning(token, fieldValues);
    },
  });

  /**
   * Ref-synced copy of `values` so the post-save auto-scroll can compute
   * the *next* unfilled field without a stale closure. We can't read
   * `values` directly inside the deferred callback: React batches the
   * setEdits update, and when `requestAnimationFrame` fires, the closure
   * was captured before the batch committed.
   */
  const valuesRef = React.useRef(values);
  React.useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  /**
   * Defer one animation frame so React commits the pending setEdits state,
   * then scroll to the next required-but-empty field. If nothing's left,
   * do nothing — the submit button is about to enable and the patient's
   * attention should travel there on its own (the sticky mobile bar + the
   * desktop CTA both update in place).
   */
  const focusNextUnfilled = React.useCallback(
    (justSavedId?: string) => {
      if (!viewQuery.data) {
        return;
      }
      const fields = viewQuery.data.fields;
      requestAnimationFrame(() => {
        const vals = valuesRef.current;
        const next = fields.find(
          (f) => f.required && f.id !== justSavedId && !isFieldFilled(vals, f)
        );
        if (next) {
          scrollToFieldId(next.id);
        }
      });
    },
    [viewQuery.data]
  );

  function handleSubmit(): void {
    if (!viewQuery.data) {
      return;
    }
    const missing = viewQuery.data.fields.find(
      (f) => f.required && !isFieldFilled(values, f)
    );
    if (missing) {
      // Defensive guard: the submit button is disabled when incomplete, but
      // if a patient somehow triggers this (keyboard, programmatic), scroll
      // them to the first unfilled field instead of silently no-op-ing.
      scrollToFieldId(missing.id);
      return;
    }
    completeMut.mutate();
  }

  function saveNonCheckboxField(): void {
    if (!activeField || activeField.type === "CHECKBOX") {
      return;
    }
    if (activeField.type === "SIGNATURE") {
      if (sigTab === "type") {
        setEdits((p) => ({ ...p, [activeField.id]: typedSig.trim() }));
      } else {
        const pad = sigPadRef.current;
        if (!pad || pad.isEmpty()) {
          return;
        }
        setEdits((p) => ({
          ...p,
          [activeField.id]: pad.toDataURL("image/png"),
        }));
      }
    } else {
      setEdits((p) => ({ ...p, [activeField.id]: draftText }));
    }
    const savedId = activeField.id;
    setActiveFieldId(null);
    focusNextUnfilled(savedId);
  }

  function toggleCheckbox(id: string): void {
    setEdits((p) => {
      const merged = { ...serverDefaults, ...p };
      const cur = merged[id] ?? "";
      return {
        ...p,
        [id]: cur === "true" ? "" : "true",
      };
    });
    focusNextUnfilled(id);
  }

  if (!isValidToken(token)) {
    return (
      <main
        data-audience="patient"
        className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center p-6"
      >
        <p className="text-body text-destructive" role="alert">
          This signing link is not valid.
        </p>
      </main>
    );
  }

  // Neutral loading state. We deliberately don't promise "Loading document…"
  // here because the result might be the signed-success screen (revisited
  // link), an already-signed message, or an expired-link card. Promising
  // a document then immediately switching to a different screen is
  // jarring; a bare spinner is honest about not knowing yet.
  if (viewQuery.isPending) {
    return (
      <main
        data-audience="patient"
        className="bg-background flex min-h-screen flex-col items-center justify-center gap-3 p-6"
      >
        <Loader2
          className="text-muted-foreground h-8 w-8 animate-spin"
          aria-label="Loading"
        />
      </main>
    );
  }

  if (viewQuery.error) {
    const apiErr =
      viewQuery.error instanceof ApiError ? viewQuery.error : null;
    const code = apiErr?.code ?? "";

    // Not an error in the user's mind: they already finished this document.
    if (code === "ALREADY_SIGNED") {
      return (
        <main
          data-audience="patient"
          className="bg-background flex min-h-screen flex-col items-center justify-center gap-6 p-6"
        >
          <CheckCircle2
            className="text-success h-14 w-14"
            strokeWidth={1.5}
            aria-hidden
          />
          <div className="w-full max-w-md text-center space-y-2">
            <h1 className="text-h1 text-foreground">Already signed</h1>
            <p className="text-body-lg text-muted-foreground">
              This document has already been completed. Your provider has a
              signed copy — no further action is needed.
            </p>
          </div>
        </main>
      );
    }

    // Link was superseded by a resend, or TTL lapsed: neutral, not destructive.
    const isLinkIssue =
      code === "SIGNING_LINK_INVALID" || code === "SIGNING_LINK_EXPIRED";
    if (isLinkIssue) {
      return (
        <main
          data-audience="patient"
          className="bg-background flex min-h-screen flex-col items-center justify-center p-6"
        >
          <Card className="w-full max-w-md border-border/80">
            <CardHeader>
              <CardTitle>This signing link is no longer valid</CardTitle>
              <CardDescription>
                {code === "SIGNING_LINK_EXPIRED"
                  ? "The link has expired. Please ask your provider to resend the invitation — you'll get a fresh email link."
                  : "A newer invitation was sent. Please use the most recent email from your provider."}
              </CardDescription>
            </CardHeader>
          </Card>
        </main>
      );
    }

    const msg = apiErr?.message ?? "Could not load this document.";
    return (
      <main
        data-audience="patient"
        className="bg-background flex min-h-screen flex-col items-center justify-center p-6"
      >
        <Card className="w-full max-w-md border-destructive/40">
          <CardHeader>
            <CardTitle>Unable to open document</CardTitle>
            <CardDescription className="text-destructive">
              {msg}
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const view = viewQuery.data;
  if (!view) {
    return <></>;
  }

  const requiredFields = view.fields.filter((f) => f.required);
  const requiredTotal = requiredFields.length;
  const filledRequired = requiredFields.filter((f) =>
    isFieldFilled(values, f)
  ).length;
  const remainingRequired = requiredTotal - filledRequired;
  const nextUnfilled = requiredFields.find((f) => !isFieldFilled(values, f));
  const canSubmit = remainingRequired === 0;
  const progressPct =
    requiredTotal === 0 ? 100 : Math.round((filledRequired / requiredTotal) * 100);

  if (view.document.status === "SIGNED" || completeMut.isSuccess) {
    return (
      <main
        data-audience="patient"
        className="bg-background flex min-h-screen flex-col items-center justify-center gap-6 p-6"
      >
        <CheckCircle2 className="text-success h-14 w-14" strokeWidth={1.5} aria-hidden />
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-h1 text-foreground">You&apos;re all set</h1>
          <p className="text-body-lg text-muted-foreground">
            Thank you, {view.recipient.name}. Signed copies are being emailed to you and your
            provider.
          </p>
        </div>
      </main>
    );
  }

  return (
    <>
      <main
        data-audience="patient"
        className="bg-background min-h-screen px-3 pb-32 pt-6 sm:px-4 sm:py-8 md:px-8"
      >
        {/*
          Outer column is max-w-5xl so the PDF card can be ~1000px wide on a
          laptop instead of the previous ~720px (max-w-3xl), matching the
          clinician editor's "fill the working area" behavior. Header,
          summary, and submit copy are explicitly clamped back to max-w-3xl
          so paragraph text stays inside the 60–80ch readability band.
        */}
        <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
          <header className="mx-auto max-w-3xl space-y-1">
            <h1 className="text-h2 sm:text-h1 text-foreground">
              {view.document.title}
            </h1>
            <p className="text-body sm:text-body-lg text-muted-foreground">
              Hi {view.recipient.name}, please review and complete all fields.
            </p>
          </header>

          {view.document.plainSummary ? (
            <Card className="mx-auto max-w-3xl border-border/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-h4">What you&apos;re signing</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-body sm:text-body-lg">
                  {view.document.plainSummary}
                </p>
              </CardContent>
            </Card>
          ) : null}

          {requiredTotal > 0 ? (
            <div className="mx-auto max-w-3xl">
              <div
                className="border-border bg-card flex items-center gap-4 rounded-md border px-4 py-3 shadow-sm"
                role="status"
                aria-live="polite"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-body text-foreground font-medium tabular-nums">
                      {canSubmit
                        ? "All required fields complete"
                        : `${filledRequired} of ${requiredTotal} complete`}
                    </p>
                    {!canSubmit ? (
                      <button
                        type="button"
                        onClick={() =>
                          nextUnfilled && scrollToFieldId(nextUnfilled.id)
                        }
                        className="text-caption text-primary hover:text-primary/80 inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                      >
                        Next field
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : (
                      <span className="text-caption text-success inline-flex items-center gap-1 font-medium">
                        <Check className="h-3.5 w-3.5" aria-hidden strokeWidth={2.5} />
                        Ready to submit
                      </span>
                    )}
                  </div>
                  <div
                    className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
                    aria-hidden
                  >
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300 ease-out",
                        canSubmit ? "bg-success" : "bg-primary"
                      )}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <Card className="overflow-hidden shadow-sm">
            <CardContent className="px-2 pt-3 pb-3 sm:px-6 sm:pt-6">
              <div
                className="bg-muted/30 border-border max-h-[min(75vh,900px)] w-full overflow-y-auto overscroll-contain rounded-md border p-2 sm:p-3"
                aria-label={
                  numPages > 1
                    ? `Document, ${numPages} pages — scroll to see more`
                    : "Document"
                }
              >
              {/*
                Callback-ref measurement host. setPageHost fires whenever
                this div attaches/detaches; we measure clientWidth on
                attach and observe further changes via ResizeObserver.
                See setPageHost above for why a callback ref is required
                instead of useRef + useLayoutEffect.
              */}
              <div ref={setPageHost} className="w-full">
              {!workerReady ? (
                <div className="text-body-lg text-muted-foreground flex items-center gap-2 py-12">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Loading PDF…
                </div>
              ) : (
              <Document
                file={view.originalPdfUrl}
                loading={
                  <div className="text-body-lg text-muted-foreground flex items-center gap-2 py-12">
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    Loading PDF…
                  </div>
                }
                error={
                  <p className="text-body text-destructive">
                    Could not display this PDF. Try refreshing the page.
                  </p>
                }
                onLoadSuccess={({ numPages }: { numPages: number }) =>
                  setNumPages(numPages)
                }
                className="flex flex-col items-stretch gap-8"
              >
                {numPages > 0
                  ? Array.from({ length: numPages }, (_, i) => {
                      const pageNumber = i + 1;
                      return (
                        <div
                          key={pageNumber}
                          data-pdf-page-wrap
                          // Pin the wrap to the exact pixel width passed to
                          // <Page>. With just `w-full`, a one-frame lag between
                          // pageHostRef.clientWidth and the pageWidth state
                          // during resize lets the wrap be a few px wider than
                          // the canvas, drifting overlay % positions. Pinning
                          // matches the editor's behavior and locks the wrap
                          // and canvas to the same pixel width every paint.
                          style={{ width: pageWidth }}
                          className="relative block max-w-full"
                        >
                          <Page
                            pageNumber={pageNumber}
                            width={pageWidth}
                            className="bg-card shadow-sm"
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                          />
                          {view.fields
                            .filter((f) => f.page === pageNumber)
                            .map((field) => {
                              const raw = values[field.id] ?? "";
                              const filled =
                                field.type === "CHECKBOX"
                                  ? raw === "true"
                                  : raw.trim().length > 0;
                              const isNext =
                                !filled &&
                                field.required &&
                                nextUnfilled?.id === field.id;
                              return (
                                <React.Fragment key={field.id}>
                                  <button
                                    type="button"
                                    data-field-id={field.id}
                                    // data-field-overlay is consumed by the
                                    // globals.css min-height exclusion so this
                                    // hit-area isn't force-stretched to 44px.
                                    data-field-overlay
                                    aria-label={
                                      filled
                                        ? `${FIELD_LABEL[field.type]} — change`
                                        : `Add ${FIELD_LABEL[field.type]}`
                                    }
                                    className={cn(
                                      "absolute flex touch-manipulation items-center overflow-hidden border-2 transition-colors cursor-pointer",
                                      filled
                                        ? "border-success/70 bg-success/5 text-success"
                                        : isNext
                                          ? "border-primary bg-primary/10 text-primary shadow-[0_0_0_3px_rgba(46,117,104,0.18)]"
                                          : "border-primary/60 bg-primary/5 text-primary hover:bg-primary/10"
                                    )}
                                    style={{
                                      left: `${field.x * 100}%`,
                                      top: `${field.y * 100}%`,
                                      width: `${field.width * 100}%`,
                                      height: `${field.height * 100}%`,
                                    }}
                                    onClick={() => {
                                      if (field.type === "CHECKBOX") {
                                        toggleCheckbox(field.id);
                                        return;
                                      }
                                      const current = values[field.id] ?? "";
                                      if (field.type === "SIGNATURE") {
                                        setTypedSig(
                                          current.startsWith("data:image")
                                            ? ""
                                            : current
                                        );
                                        setSigTab("draw");
                                      } else {
                                        setDraftText(current);
                                      }
                                      setActiveFieldId(field.id);
                                    }}
                                  >
                                    <FieldOverlayContent
                                      type={field.type}
                                      required={field.required}
                                      value={raw}
                                    />
                                  </button>
                                  {isNext ? (
                                    // Sibling pill (not a child) because the
                                    // button has overflow-hidden to clip long
                                    // TEXT values. Positioned above the field
                                    // in the same percentage coordinate space
                                    // as the page wrap.
                                    <span
                                      aria-hidden
                                      className="bg-primary text-primary-foreground animate-pulse pointer-events-none absolute z-10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium shadow-md"
                                      style={{
                                        left: `${field.x * 100 + (field.width * 100) / 2}%`,
                                        top: `calc(${field.y * 100}% - 1.5rem)`,
                                        transform: "translateX(-50%)",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      Sign here
                                      <ArrowDown
                                        className="h-3 w-3"
                                        strokeWidth={2.5}
                                      />
                                    </span>
                                  ) : null}
                                </React.Fragment>
                              );
                            })}
                        </div>
                      );
                    })
                  : null}
              </Document>
              )}
              </div>
              </div>
            </CardContent>
          </Card>

          {/* Inline submit area for desktop / tablet — stays inside flow.
              Clamped back to max-w-3xl so the button doesn't sit isolated at
              the far right of a 1024px column on wide screens. */}
          <div className="mx-auto hidden max-w-3xl items-center justify-between gap-3 sm:flex">
            <p className="text-body-sm text-muted-foreground min-w-0">
              {canSubmit
                ? "Review your answers, then submit."
                : `${remainingRequired} required field${remainingRequired === 1 ? "" : "s"} remaining.`}
            </p>
            <Button
              type="button"
              size="lg"
              className="min-h-12 text-body-lg"
              disabled={!canSubmit || completeMut.isPending}
              onClick={handleSubmit}
            >
              {completeMut.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
                  Submitting…
                </>
              ) : (
                "Submit signed document"
              )}
            </Button>
          </div>

          {completeMut.error ? (
            <p className="text-body text-destructive mx-auto max-w-3xl" role="alert">
              {completeMut.error instanceof ApiError
                ? completeMut.error.message
                : "Could not submit. Please try again."}
            </p>
          ) : null}
        </div>

        {/* Sticky submit bar on mobile so the patient never has to scroll
            back to the bottom after filling a field. iOS-safe area for
            home-indicator devices via env(safe-area-inset-bottom). */}
        <div
          className="bg-background/95 border-border fixed inset-x-0 bottom-0 z-40 border-t px-3 pt-3 backdrop-blur sm:hidden"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
        >
          {requiredTotal > 0 ? (
            <div className="mb-2 space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-caption text-foreground font-medium tabular-nums">
                  {canSubmit
                    ? "Ready to submit"
                    : `${filledRequired} of ${requiredTotal} complete`}
                </p>
                {!canSubmit && nextUnfilled ? (
                  <button
                    type="button"
                    onClick={() => scrollToFieldId(nextUnfilled.id)}
                    className="text-caption text-primary inline-flex items-center gap-1 font-medium"
                  >
                    Next
                    <ArrowDown className="h-3 w-3" aria-hidden />
                  </button>
                ) : null}
              </div>
              <div className="bg-muted h-1 w-full overflow-hidden rounded-full" aria-hidden>
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-300 ease-out",
                    canSubmit ? "bg-success" : "bg-primary"
                  )}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          ) : null}
          <Button
            type="button"
            size="lg"
            className="min-h-12 w-full text-body-lg"
            disabled={!canSubmit || completeMut.isPending}
            onClick={handleSubmit}
          >
            {completeMut.isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
                Submitting…
              </>
            ) : (
              "Submit signed document"
            )}
          </Button>
        </div>
      </main>

      <Dialog
        open={activeField !== null && activeField.type !== "CHECKBOX"}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setActiveFieldId(null);
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {activeField ? FIELD_LABEL[activeField.type] : ""}
            </DialogTitle>
          </DialogHeader>

          {activeField?.type === "SIGNATURE" ? (
            <div className="space-y-4">
              <Tabs
                value={sigTab}
                onValueChange={(v: string) => setSigTab(v as "type" | "draw")}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="draw">Draw</TabsTrigger>
                  <TabsTrigger value="type">Type</TabsTrigger>
                </TabsList>
                <TabsContent value="draw" className="pt-2">
                  <p className="text-body-sm text-muted-foreground mb-2">
                    Sign in the box below with your finger or mouse.
                  </p>
                  <div className="border-border bg-white relative w-full overflow-hidden rounded-md border">
                    <canvas
                      ref={canvasRef}
                      className="block h-[160px] w-full touch-none sm:h-[180px]"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => sigPadRef.current?.clear()}
                  >
                    Clear
                  </Button>
                </TabsContent>
                <TabsContent value="type" className="pt-2 space-y-2">
                  <Label htmlFor="typed-sig">Full name</Label>
                  <Input
                    id="typed-sig"
                    className="text-body-lg min-h-12"
                    value={typedSig}
                    onChange={(e) => setTypedSig(e.target.value)}
                    autoComplete="name"
                  />
                </TabsContent>
              </Tabs>
            </div>
          ) : null}

          {activeField && ["TEXT", "INITIAL"].includes(activeField.type) ? (
            <div className="space-y-2">
              <Label htmlFor="field-text">Your answer</Label>
              <Input
                id="field-text"
                className="text-body-lg min-h-12"
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
              />
            </div>
          ) : null}

          {activeField?.type === "DATE" ? (
            <div className="space-y-2">
              <Label htmlFor="field-date">Date</Label>
              <Input
                id="field-date"
                type="date"
                className="text-body-lg min-h-12"
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
              />
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setActiveFieldId(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveNonCheckboxField}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
