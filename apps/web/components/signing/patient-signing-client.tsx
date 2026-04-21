"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
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

type PatientSigningClientProps = {
  token: string;
};

export function PatientSigningClient({
  token,
}: PatientSigningClientProps): React.ReactElement | null {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const sigPadRef = React.useRef<SignaturePad | null>(null);

  const [pageWidth, setPageWidth] = React.useState(720);
  const [numPages, setNumPages] = React.useState(0);
  const [workerReady, setWorkerReady] = React.useState(false);

  const [activeFieldId, setActiveFieldId] = React.useState<string | null>(null);
  const [sigTab, setSigTab] = React.useState<"type" | "draw">("draw");
  const [typedSig, setTypedSig] = React.useState("");
  const [draftText, setDraftText] = React.useState("");
  const [submitHint, setSubmitHint] = React.useState<string | null>(null);

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

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver(() => {
      setPageWidth(Math.max(280, el.clientWidth));
    });
    ro.observe(el);
    setPageWidth(Math.max(280, el.clientWidth));
    return () => ro.disconnect();
  }, []);

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

  React.useEffect(() => {
    if (!activeField || activeField.type !== "SIGNATURE") {
      sigPadRef.current = null;
      return;
    }
    if (sigTab !== "draw") {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const w = 440;
    const h = 180;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const pad = new SignaturePad(canvas, {
      backgroundColor: "rgb(255, 255, 255)",
      penColor: "rgb(17, 24, 39)",
    });
    sigPadRef.current = pad;
    return () => {
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

  function validate(): string | null {
    const data = viewQuery.data;
    if (!data) {
      return "Missing document.";
    }
    for (const f of data.fields) {
      if (!f.required) {
        continue;
      }
      const v = (values[f.id] ?? "").trim();
      if (f.type === "CHECKBOX") {
        if (v !== "true") {
          return "Please check the required box.";
        }
      } else if (v === "") {
        return `Please complete: ${FIELD_LABEL[f.type]}`;
      }
    }
    return null;
  }

  function handleSubmit(): void {
    const err = validate();
    if (err) {
      setSubmitHint(err);
      return;
    }
    setSubmitHint(null);
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
    setActiveFieldId(null);
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

  if (viewQuery.isPending) {
    return (
      <main
        data-audience="patient"
        className="bg-background flex min-h-screen flex-col items-center justify-center gap-3 p-6"
      >
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" aria-hidden />
        <p className="text-body-lg text-muted-foreground">Loading document…</p>
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
        className="bg-background min-h-screen px-4 py-8 md:px-8"
      >
        <div className="mx-auto max-w-3xl space-y-6">
          <header className="space-y-1">
            <h1 className="text-h1 text-foreground">{view.document.title}</h1>
            <p className="text-body-lg text-muted-foreground">
              Hi {view.recipient.name}, please review and complete all fields.
            </p>
          </header>

          {view.document.plainSummary ? (
            <Card className="border-border/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-h4">What you&apos;re signing</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-body-lg">{view.document.plainSummary}</p>
              </CardContent>
            </Card>
          ) : null}

          <Card className="overflow-hidden shadow-sm">
            <CardContent className="pt-6">
              <div ref={containerRef} className="w-full">
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
                className="flex flex-col items-center gap-8"
              >
                {numPages > 0
                  ? Array.from({ length: numPages }, (_, i) => {
                      const pageNumber = i + 1;
                      return (
                        <div
                          key={pageNumber}
                          data-pdf-page-wrap
                          className="relative inline-block max-w-full"
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
                              const filled = Boolean(
                                (values[field.id] ?? "").trim() ||
                                  (field.type === "CHECKBOX" && values[field.id] === "true")
                              );
                              return (
                                <button
                                  key={field.id}
                                  type="button"
                                  className={cn(
                                    "absolute flex items-start border-2 p-1 text-left text-caption transition-colors",
                                    filled
                                      ? "border-success/70 bg-success/10 text-success"
                                      : "border-primary/50 bg-primary/5 text-primary",
                                    field.type === "CHECKBOX" ? "cursor-pointer" : "cursor-pointer"
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
                                    } else {
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
                                    }
                                  }}
                                >
                                  <span className="pointer-events-none truncate">
                                    {FIELD_LABEL[field.type]}
                                    {field.required ? " *" : ""}
                                    {filled ? " · done" : ""}
                                  </span>
                                </button>
                              );
                            })}
                        </div>
                      );
                    })
                  : null}
              </Document>
              )}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              size="lg"
              className="min-h-12 text-body-lg"
              disabled={completeMut.isPending}
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

          {submitHint ? (
            <p className="text-body text-destructive" role="alert">
              {submitHint}
            </p>
          ) : null}

          {completeMut.error ? (
            <p className="text-body text-destructive" role="alert">
              {completeMut.error instanceof ApiError
                ? completeMut.error.message
                : "Could not submit. Please try again."}
            </p>
          ) : null}
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
        <DialogContent className="max-w-lg">
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
                  <canvas
                    ref={canvasRef}
                    className="touch-none w-full max-w-full rounded-md border border-border bg-white"
                  />
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
