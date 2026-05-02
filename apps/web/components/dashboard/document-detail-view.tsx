"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  CircleSlash,
  Download,
  FileText,
  Hash,
  History,
  Mail,
  MoreHorizontal,
  PenLine,
  Send,
  SquareCheck,
  Type,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DocumentActivityTimeline } from "@/components/dashboard/document-activity-timeline";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  ApiDocumentField,
  ApiDocumentRecipient,
  ApiFieldType,
} from "@/lib/api-types";
import type { DocumentStatus } from "@clinicsign/shared-types";
import {
  ApiError,
  fetchDocumentDetail,
  fetchPresignedDownload,
  resendDocument,
  sendDocument,
  voidDocument,
} from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { DocumentPdfEditorHandle } from "@/components/dashboard/document-pdf-editor";

/** Prevents a thrown pdf.js / react-pdf error from blanking the whole dashboard shell. */
class PdfShellErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {}

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          className="text-body-sm rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive"
          role="alert"
        >
          <p className="font-medium">PDF viewer failed to load</p>
          <p className="mt-2 text-muted-foreground">{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

const DocumentPdfEditor = dynamic(
  () =>
    import("@/components/dashboard/document-pdf-editor").then(
      (m) => m.DocumentPdfEditor
    ),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4 py-2" aria-busy="true">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
        <Skeleton className="aspect-[8.5/11] w-full max-w-2xl rounded-lg" />
      </div>
    ),
  }
);

const sendSchema = z.object({
  recipientName: z.string().min(1, "Name is required.").max(200),
  recipientEmail: z.string().email("Enter a valid email address."),
});

type SendFormValues = z.infer<typeof sendSchema>;

export function DocumentDetailView({
  documentId,
}: {
  documentId: string;
}): JSX.Element {
  const { getToken, isLoaded } = useAuth();
  const queryClient = useQueryClient();
  const [sendOpen, setSendOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const editorRef = useRef<DocumentPdfEditorHandle>(null);
  /** Null until the editor first reports (avoid gating send on 0 before mount). */
  const [editorFieldCount, setEditorFieldCount] = useState<number | null>(null);

  const detailQuery = useQuery({
    queryKey: ["document", documentId],
    enabled: isLoaded && Boolean(documentId),
    queryFn: async () => {
      const token = await getToken();
      return fetchDocumentDetail(token, documentId);
    },
    /** Recipient can open/sign while this tab stays open; poll until terminal states. */
    refetchInterval: (q) => {
      const status = q.state.data?.document.status;
      if (status === "SENT" || status === "VIEWED") {
        return 15_000;
      }
      return false;
    },
  });

  const sendForm = useForm<SendFormValues>({
    resolver: zodResolver(sendSchema),
    defaultValues: { recipientName: "", recipientEmail: "" },
  });

  const sendMutation = useMutation({
    mutationFn: async (values: SendFormValues) => {
      const token = await getToken();
      await editorRef.current?.flushFields();
      return sendDocument(token, documentId, values);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["document", documentId], data);
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Signing invitation sent");
      sendForm.reset();
      setSendOpen(false);
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Could not send document.";
      toast.error(message);
    },
  });

  const resendMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return resendDocument(token, documentId);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["document", documentId], data);
      void queryClient.invalidateQueries({
        queryKey: ["documents"],
        refetchType: "all",
      });
      toast.success("Invitation resent with a new link");
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Could not resend invitation.";
      toast.error(message);
    },
  });

  const voidMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return voidDocument(token, documentId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["document", documentId],
        refetchType: "all",
      });
      void queryClient.invalidateQueries({
        queryKey: ["documents"],
        refetchType: "all",
      });
      toast.success("Document voided");
      setVoidOpen(false);
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Could not void document.";
      toast.error(message);
    },
  });

  async function handleDownload(type: "original" | "signed"): Promise<void> {
    try {
      const token = await getToken();
      const { url } = await fetchPresignedDownload(token, documentId, type);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Could not start download.";
      toast.error(message);
    }
  }

  const docForEditorKey = detailQuery.data?.document;
  const pdfEditorKey = useMemo(
    () =>
      docForEditorKey
        ? `${docForEditorKey.id}:${JSON.stringify(docForEditorKey.fields)}`
        : documentId,
    [docForEditorKey, documentId]
  );

  if (!isLoaded || detailQuery.isPending) {
    return <DetailSkeleton />;
  }

  if (detailQuery.error) {
    const message =
      detailQuery.error instanceof ApiError
        ? detailQuery.error.message
        : "Could not load document.";
    return (
      <DashboardShell>
        <Card>
          <CardContent className="text-body text-destructive pt-6">
            {message}
          </CardContent>
        </Card>
      </DashboardShell>
    );
  }

  const doc = detailQuery.data?.document;
  if (!doc) {
    return (
      <DashboardShell>
        <Card>
          <CardContent className="text-body text-muted-foreground pt-6">
            Document not found.
          </CardContent>
        </Card>
      </DashboardShell>
    );
  }

  const recipient: ApiDocumentRecipient | null = doc.recipients[0] ?? null;
  const hasSignedPdf = Boolean(doc.signedPdfKey);
  const canSend = doc.status === "DRAFT";
  const fieldCountForSend = editorFieldCount ?? doc.fields.length;
  const canSendForSignature = fieldCountForSend > 0;
  const canResend = doc.status === "SENT" || doc.status === "VIEWED";
  const canVoid =
    doc.status === "DRAFT" ||
    doc.status === "SENT" ||
    doc.status === "VIEWED";

  return (
    <DashboardShell>
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
            Back to documents
          </Link>
        </Button>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          {/*
            Left column hosts only the PDF. Tabs sit above the editor so
            the Activity timeline gets the same full-width canvas.
            forceMount keeps the editor instance warm across tab toggles
            so switching to Activity doesn't refetch the presigned URL
            or wipe in-progress field edits in DRAFT mode.
          */}
          <div className="min-w-0">
            <Tabs defaultValue="preview" className="w-full">
              <TabsList variant="line" className="w-full justify-start">
                <TabsTrigger value="preview">
                  <FileText aria-hidden="true" strokeWidth={1.5} />
                  Preview
                </TabsTrigger>
                <TabsTrigger value="activity">
                  <History aria-hidden="true" strokeWidth={1.5} />
                  Activity
                </TabsTrigger>
              </TabsList>
              <TabsContent
                value="preview"
                forceMount
                className="data-[state=inactive]:hidden"
              >
                <Card className="shadow-sm">
                  <CardContent className="pt-6">
                    <PdfShellErrorBoundary key={pdfEditorKey}>
                      <DocumentPdfEditor
                        ref={editorRef}
                        documentId={documentId}
                        readOnly={doc.status !== "DRAFT"}
                        fields={doc.fields}
                        updatedAt={doc.updatedAt}
                        pdfVariant={hasSignedPdf ? "signed" : "original"}
                        onFieldCountChange={setEditorFieldCount}
                      />
                    </PdfShellErrorBoundary>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent
                value="activity"
                forceMount
                className="data-[state=inactive]:hidden"
              >
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle>Activity</CardTitle>
                    <CardDescription>
                      Every action on this document, newest first.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DocumentActivityTimeline
                      entries={doc.auditLogs}
                      recipient={recipient ?? null}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
            <OverviewCard
              doc={doc}
              recipient={recipient}
              hasSignedPdf={hasSignedPdf}
              canSend={canSend}
              sendForSignatureEnabled={canSendForSignature}
              sendBlockedHint={
                canSend && !canSendForSignature
                  ? "Place at least one field on the PDF before sending."
                  : undefined
              }
              canResend={canResend}
              canVoid={canVoid}
              isResending={resendMutation.isPending}
              onSend={() => setSendOpen(true)}
              onResend={() => resendMutation.mutate()}
              onDownload={(type) => void handleDownload(type)}
              onVoid={() => setVoidOpen(true)}
            />
            <RecipientCard recipient={recipient} status={doc.status} />
            <FieldsBreakdownCard fields={doc.fields} status={doc.status} />
          </aside>
        </div>

        <Dialog open={sendOpen} onOpenChange={setSendOpen}>
          <DialogContent>
            <form
              className="space-y-4"
              onSubmit={sendForm.handleSubmit((values) =>
                sendMutation.mutate(values)
              )}
            >
              <DialogHeader>
                <DialogTitle>Send for signature</DialogTitle>
                <DialogDescription>
                  We will email a secure link to complete and sign this
                  document. Any fields you placed are saved automatically when
                  you send.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="recipientName">Recipient name</Label>
                <Input
                  id="recipientName"
                  autoComplete="name"
                  {...sendForm.register("recipientName")}
                  aria-invalid={
                    sendForm.formState.errors.recipientName ? true : undefined
                  }
                />
                {sendForm.formState.errors.recipientName ? (
                  <p className="text-body text-destructive">
                    {sendForm.formState.errors.recipientName.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="recipientEmail">Recipient email</Label>
                <Input
                  id="recipientEmail"
                  type="email"
                  autoComplete="email"
                  {...sendForm.register("recipientEmail")}
                  aria-invalid={
                    sendForm.formState.errors.recipientEmail ? true : undefined
                  }
                />
                {sendForm.formState.errors.recipientEmail ? (
                  <p className="text-body text-destructive">
                    {sendForm.formState.errors.recipientEmail.message}
                  </p>
                ) : null}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSendOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={sendMutation.isPending}>
                  {sendMutation.isPending ? "Sending…" : "Send email"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Void this document?</DialogTitle>
              <DialogDescription>
                Voiding invalidates the signing link and marks the document as
                voided. Anyone who opens an existing link will see an error.
                This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setVoidOpen(false)}
              >
                Keep document
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={voidMutation.isPending}
                onClick={() => voidMutation.mutate()}
              >
                {voidMutation.isPending ? "Voiding…" : "Void document"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  );
}


function OverviewCard({
  doc,
  recipient,
  hasSignedPdf,
  canSend,
  sendForSignatureEnabled,
  sendBlockedHint,
  canResend,
  canVoid,
  isResending,
  onSend,
  onResend,
  onDownload,
  onVoid,
}: {
  doc: {
    title: string;
    status: DocumentStatus;
    createdAt: string;
    sentAt: string | null;
    signedAt: string | null;
    voidedAt: string | null;
    expiresAt: string | null;
  };
  recipient: ApiDocumentRecipient | null;
  hasSignedPdf: boolean;
  canSend: boolean;
  sendForSignatureEnabled: boolean;
  /** Shown as tooltip when Send is disabled on a draft (e.g. no fields). */
  sendBlockedHint?: string;
  canResend: boolean;
  canVoid: boolean;
  isResending: boolean;
  onSend: () => void;
  onResend: () => void;
  onDownload: (type: "original" | "signed") => void;
  onVoid: () => void;
}): JSX.Element {
  const subtitle = heroSubtitle(doc.status, recipient);
  const events = timelineEvents(doc, recipient);
  const updatedIso =
    doc.voidedAt ?? doc.signedAt ?? doc.sentAt ?? doc.createdAt;

  // Primary action mirrors the most common next step for each status.
  // `flex-1 min-w-0` so the button shares the row with the overflow icon
  // button instead of forcing it past the card's right edge.
  const primaryClass = "flex-1 min-w-0";
  let primary: JSX.Element;
  if (canSend) {
    primary = (
      <Button
        type="button"
        className={primaryClass}
        onClick={onSend}
        disabled={!sendForSignatureEnabled}
        title={
          !sendForSignatureEnabled ? sendBlockedHint : undefined
        }
      >
        <Send className="mr-2 h-4 w-4" aria-hidden strokeWidth={2} />
        Send for signature
      </Button>
    );
  } else if (canResend) {
    primary = (
      <Button
        type="button"
        className={primaryClass}
        onClick={onResend}
        disabled={isResending}
      >
        <Mail className="mr-2 h-4 w-4" aria-hidden strokeWidth={2} />
        {isResending ? "Sending…" : "Resend invitation"}
      </Button>
    );
  } else if (doc.status === "SIGNED" && hasSignedPdf) {
    primary = (
      <Button
        type="button"
        className={primaryClass}
        onClick={() => onDownload("signed")}
      >
        <Download className="mr-2 h-4 w-4" aria-hidden strokeWidth={2} />
        Download signed PDF
      </Button>
    );
  } else {
    primary = (
      <Button
        type="button"
        variant="outline"
        className={primaryClass}
        onClick={() => onDownload("original")}
      >
        <Download className="mr-2 h-4 w-4" aria-hidden strokeWidth={2} />
        Download original PDF
      </Button>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <StatusBadge status={doc.status} />
          <span className="text-caption text-muted-foreground">
            Updated {relativeTime(updatedIso)}
          </span>
        </div>
        <CardTitle className="text-h3 mt-2 break-words leading-tight">
          {doc.title}
        </CardTitle>
        <CardDescription className="break-words">{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="flex items-center gap-2">
          {primary}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                aria-label="More actions"
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuItem onClick={() => onDownload("original")}>
                <Download aria-hidden strokeWidth={1.75} />
                Download original PDF
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDownload("signed")}
                disabled={!hasSignedPdf}
              >
                <Download aria-hidden strokeWidth={1.75} />
                Download signed PDF
                {!hasSignedPdf ? (
                  <span className="text-muted-foreground ml-auto text-caption">
                    After signing
                  </span>
                ) : null}
              </DropdownMenuItem>
              {canResend ? (
                <DropdownMenuItem onClick={onResend} disabled={isResending}>
                  <Mail aria-hidden strokeWidth={1.75} />
                  {isResending ? "Sending…" : "Resend invitation"}
                </DropdownMenuItem>
              ) : null}
              {canVoid ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={onVoid}>
                    <CircleSlash aria-hidden strokeWidth={1.75} />
                    Void document
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {events.length > 0 ? (
          <ul className="space-y-1.5 border-t pt-3">
            {events.map((event) => (
              <li
                key={event.label}
                className="text-caption flex items-center justify-between gap-3"
              >
                <span className="text-muted-foreground truncate">
                  {event.label}
                </span>
                <time
                  dateTime={event.iso}
                  title={new Date(event.iso).toLocaleString()}
                  className="text-foreground/80 shrink-0 font-medium"
                >
                  {relativeTime(event.iso)}
                </time>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function heroSubtitle(
  status: DocumentStatus,
  recipient: ApiDocumentRecipient | null
): string {
  if (status === "DRAFT") {
    return "Place fields, then send this document for signature.";
  }
  if (status === "SIGNED" && recipient) {
    return `Signed by ${recipient.name}.`;
  }
  if (status === "VOIDED") {
    return "This document has been voided. The signing link is no longer valid.";
  }
  if (status === "EXPIRED") {
    return "The signing link expired before it was signed. Resend to issue a fresh link.";
  }
  if (recipient) {
    return status === "VIEWED"
      ? `${recipient.name} opened the link but hasn't signed yet.`
      : `Awaiting signature from ${recipient.name}.`;
  }
  return "Waiting on the next step.";
}

function timelineEvents(
  doc: {
    createdAt: string;
    sentAt: string | null;
    signedAt: string | null;
    voidedAt: string | null;
  },
  recipient: ApiDocumentRecipient | null
): Array<{ label: string; iso: string }> {
  const out: Array<{ label: string; iso: string }> = [
    { label: "Created", iso: doc.createdAt },
  ];
  if (doc.sentAt) {
    out.push({ label: "Sent", iso: doc.sentAt });
  }
  // Viewed timestamp isn't modeled directly; fallback to created-after-sent
  // signal. We only emit it when the status is VIEWED or later and we have
  // a signedAt-or-void timestamp to bracket it. (Intentionally kept out of
  // the strip to avoid misleading precision.)
  if (doc.signedAt) {
    const signer = recipient?.name ?? "Recipient";
    out.push({ label: `Signed by ${signer}`, iso: doc.signedAt });
  }
  if (doc.voidedAt) {
    out.push({ label: "Voided", iso: doc.voidedAt });
  }
  return out;
}


/**
 * Recipient card is only rendered once a recipient exists. The
 * no-recipient zero-state lived here before, but it just restated the
 * Overview card's subtitle + primary action — two cards asking the same
 * thing. Overview now owns that state; this card is purely for
 * displaying real recipient details.
 *
 * Similarly, the "Resend invitation" button that used to live at the
 * bottom duplicated Overview's primary action for SENT/VIEWED. Dropped.
 */
function RecipientCard({
  recipient,
  status,
}: {
  recipient: ApiDocumentRecipient | null;
  status: DocumentStatus;
}): JSX.Element | null {
  if (!recipient) {
    return null;
  }

  const statusLine = recipientStatusLine(recipient, status);
  const expiresLine = tokenExpiresLine(recipient, status);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle>Recipient</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          <Avatar size="lg">
            <AvatarFallback>{initials(recipient.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-body text-foreground truncate font-medium">
              {recipient.name}
            </p>
            <a
              href={`mailto:${recipient.email}`}
              className="text-body-sm text-muted-foreground hover:text-primary truncate underline-offset-4 hover:underline"
            >
              {recipient.email}
            </a>
          </div>
        </div>

        <dl className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-caption text-muted-foreground">Status</dt>
            <dd className="text-body-sm text-foreground text-right">
              {statusLine}
            </dd>
          </div>
          {expiresLine ? (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-caption text-muted-foreground">Link</dt>
              <dd className="text-body-sm text-foreground text-right">
                {expiresLine}
              </dd>
            </div>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}

function recipientStatusLine(
  recipient: ApiDocumentRecipient,
  status: DocumentStatus
): string {
  if (recipient.signedAt) {
    return `Signed ${relativeTime(recipient.signedAt)}`;
  }
  if (status === "VIEWED") {
    return "Opened the link, not signed yet";
  }
  if (status === "SENT") {
    return "Awaiting signature";
  }
  if (status === "VOIDED") {
    return "Invitation voided";
  }
  if (status === "EXPIRED") {
    return "Invitation expired";
  }
  return "Not sent";
}

function tokenExpiresLine(
  recipient: ApiDocumentRecipient,
  status: DocumentStatus
): string | null {
  if (recipient.signedAt) return null;
  if (status !== "SENT" && status !== "VIEWED") return null;
  const expires = new Date(recipient.tokenExpiresAt).getTime();
  if (!Number.isFinite(expires)) return null;
  if (expires <= Date.now()) return "Link has expired";
  return `Expires ${relativeTime(recipient.tokenExpiresAt)}`;
}


const FIELD_META: Record<
  ApiFieldType,
  { label: string; icon: typeof PenLine }
> = {
  SIGNATURE: { label: "Signatures", icon: PenLine },
  INITIAL: { label: "Initials", icon: Hash },
  TEXT: { label: "Text fields", icon: Type },
  DATE: { label: "Dates", icon: Calendar },
  CHECKBOX: { label: "Checkboxes", icon: SquareCheck },
};

const FIELD_ORDER: ApiFieldType[] = [
  "SIGNATURE",
  "INITIAL",
  "TEXT",
  "DATE",
  "CHECKBOX",
];

function FieldsBreakdownCard({
  fields,
  status,
}: {
  fields: ApiDocumentField[];
  status: DocumentStatus;
}): JSX.Element {
  const total = fields.length;
  const required = fields.filter((f) => f.required).length;
  const filled = fields.filter((f) => f.value !== null && f.value !== "").length;
  const pages = new Set(fields.map((f) => f.page)).size;
  const byType = new Map<ApiFieldType, number>();
  for (const f of fields) {
    byType.set(f.type, (byType.get(f.type) ?? 0) + 1);
  }

  const hasFields = total > 0;
  const showProgress = status === "SIGNED" || status === "VIEWED" || status === "SENT";
  const progressPct = total === 0 ? 0 : Math.round((filled / total) * 100);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle>Fields</CardTitle>
        <CardDescription>
          {hasFields
            ? `${total} field${total === 1 ? "" : "s"} across ${pages} page${pages === 1 ? "" : "s"}.`
            : status === "DRAFT"
              ? "Drag field types onto the PDF to get started."
              : "No fields were placed on this document."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasFields && showProgress ? (
          <div>
            <div className="flex items-center justify-between">
              <span className="text-caption text-muted-foreground">
                Captured
              </span>
              <span className="text-caption text-foreground font-medium tabular-nums">
                {filled} / {total}
                {status === "SIGNED" ? (
                  <CheckCircle2
                    className="text-success ml-1.5 inline h-3.5 w-3.5"
                    strokeWidth={2}
                    aria-hidden
                  />
                ) : null}
              </span>
            </div>
            <div
              className="bg-muted mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Fields captured"
            >
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  status === "SIGNED" ? "bg-success" : "bg-primary"
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        ) : null}

        {hasFields ? (
          <ul className="space-y-2">
            {FIELD_ORDER.map((type) => {
              const count = byType.get(type) ?? 0;
              if (count === 0) return null;
              const meta = FIELD_META[type];
              const Icon = meta.icon;
              return (
                <li
                  key={type}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="text-body-sm text-foreground inline-flex items-center gap-2">
                    <Icon
                      className="text-muted-foreground h-3.5 w-3.5"
                      strokeWidth={2}
                      aria-hidden
                    />
                    {meta.label}
                  </span>
                  <span className="text-body-sm text-muted-foreground tabular-nums">
                    {count}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}

        {hasFields && required > 0 ? (
          <p className="text-caption text-muted-foreground">
            {required} required · {total - required} optional
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}


function DetailSkeleton(): JSX.Element {
  return (
    <DashboardShell>
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <Card className="shadow-sm">
            <CardContent className="pt-6">
              <Skeleton className="aspect-[8.5/11] w-full rounded-lg" />
            </CardContent>
          </Card>
          <aside className="flex flex-col gap-4">
            <Card className="shadow-sm">
              <CardHeader>
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-7 w-3/4" />
                <Skeleton className="h-4 w-full" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader>
                <Skeleton className="h-6 w-24" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </DashboardShell>
  );
}


function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diffSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 604800) return rtf.format(Math.round(diffSec / 86400), "day");
  if (abs < 2629800) return rtf.format(Math.round(diffSec / 604800), "week");
  return rtf.format(Math.round(diffSec / 2629800), "month");
}
