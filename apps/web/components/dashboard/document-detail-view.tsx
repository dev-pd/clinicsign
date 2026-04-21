"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useMemo,
  useState,
} from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ApiError,
  fetchDocumentDetail,
  fetchPresignedDownload,
  resendDocument,
  sendDocument,
} from "@/lib/api-client";

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
  () => import("@/components/dashboard/document-pdf-editor"),
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

  const detailQuery = useQuery({
    queryKey: ["document", documentId],
    enabled: isLoaded && Boolean(documentId),
    queryFn: async () => {
      const token = await getToken();
      return fetchDocumentDetail(token, documentId);
    },
  });

  const sendForm = useForm<SendFormValues>({
    resolver: zodResolver(sendSchema),
    defaultValues: { recipientName: "", recipientEmail: "" },
  });

  const sendMutation = useMutation({
    mutationFn: async (values: SendFormValues) => {
      const token = await getToken();
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
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Invitation resent with a new link");
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Could not resend invitation.";
      toast.error(message);
    },
  });

  async function handleDownload(type: "original" | "signed"): Promise<void> {
    try {
      const token = await getToken();
      const { url } = await fetchPresignedDownload(
        token,
        documentId,
        type
      );
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
    return (
      <DashboardShell>
        <div className="flex flex-col gap-8">
          <Skeleton className="h-8 w-40" />
          <div className="space-y-2">
            <Skeleton className="h-9 max-w-md" />
            <Skeleton className="h-5 w-56" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-10 w-44" />
          </div>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <Card className="shadow-sm">
              <CardHeader>
                <Skeleton className="h-6 w-28" />
                <Skeleton className="h-4 w-full max-w-sm" />
              </CardHeader>
              <CardContent>
                <Skeleton className="aspect-[8.5/11] w-full max-w-2xl rounded-lg" />
              </CardContent>
            </Card>
            <aside className="flex flex-col gap-4">
              <Card className="shadow-sm">
                <CardHeader>
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-4 w-full" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
              <Card className="shadow-sm">
                <CardHeader>
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-4 w-full" />
                </CardHeader>
              </Card>
            </aside>
          </div>
        </div>
      </DashboardShell>
    );
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

  const recipient = doc.recipients[0];
  const canSend = doc.status === "DRAFT";
  const canResend = doc.status === "SENT" || doc.status === "VIEWED";
  const hasSignedPdf = Boolean(doc.signedPdfKey);

  return (
    <DashboardShell>
      <div className="space-y-8">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-4" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
              Back to documents
            </Link>
          </Button>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-h1 text-foreground">{doc.title}</h1>
              <p className="text-body text-muted-foreground mt-1">
                Updated {new Date(doc.updatedAt).toLocaleString()}
              </p>
            </div>
            <StatusBadge status={doc.status} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleDownload("original")}
          >
            Download original PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!hasSignedPdf}
            onClick={() => void handleDownload("signed")}
            title={
              hasSignedPdf
                ? undefined
                : "Available after the patient signs."
            }
          >
            Download signed PDF
          </Button>
          {canSend ? (
            <Button type="button" onClick={() => setSendOpen(true)}>
              Send for signature
            </Button>
          ) : null}
          {canResend ? (
            <Button
              type="button"
              variant="secondary"
              disabled={resendMutation.isPending}
              onClick={() => resendMutation.mutate()}
            >
              {resendMutation.isPending ? "Sending…" : "Resend invitation"}
            </Button>
          ) : null}
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="min-w-0 space-y-4">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Preview</CardTitle>
                <CardDescription>
                  {doc.status === "DRAFT"
                    ? "Place fields on the PDF, then save. Drag to move fields in Select mode."
                    : hasSignedPdf
                    ? "Signed copy with the recipient's entries flattened onto the document."
                    : "Fields are locked after send. Download PDFs from the actions above."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PdfShellErrorBoundary key={pdfEditorKey}>
                  <DocumentPdfEditor
                    documentId={documentId}
                    readOnly={doc.status !== "DRAFT"}
                    fields={doc.fields}
                    updatedAt={doc.updatedAt}
                    pdfVariant={hasSignedPdf ? "signed" : "original"}
                  />
                </PdfShellErrorBoundary>
              </CardContent>
            </Card>
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Recipient</CardTitle>
                <CardDescription>
                  {recipient
                    ? "Who receives the signing link."
                    : "No recipient yet — send the document to add one."}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-body space-y-1">
                {recipient ? (
                  <>
                    <p>
                      <span className="text-muted-foreground">Name: </span>
                      {recipient.name}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Email: </span>
                      {recipient.email}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Signed: </span>
                      {recipient.signedAt
                        ? new Date(recipient.signedAt).toLocaleString()
                        : "—"}
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground">—</p>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Fields</CardTitle>
                <CardDescription>
                  {doc.fields.length === 0
                    ? "No fields placed yet. Field placement is coming in a later step."
                    : `${doc.fields.length} field(s) on this document.`}
                </CardDescription>
              </CardHeader>
            </Card>
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
                  document.
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
                <Button
                  type="submit"
                  disabled={sendMutation.isPending}
                >
                  {sendMutation.isPending ? "Sending…" : "Send email"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  );
}
