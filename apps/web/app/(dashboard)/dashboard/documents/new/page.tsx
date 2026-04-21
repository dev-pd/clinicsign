"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  FileSignature,
  Loader2,
  PenLine,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { PdfDropzone } from "@/components/dashboard/pdf-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, createDocument } from "@/lib/api-client";

const titleSchema = z.object({
  title: z.string().min(1, "Title is required.").max(500),
});

type FormValues = z.infer<typeof titleSchema>;

export default function NewDocumentPage(): JSX.Element {
  const { getToken } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [file, setFile] = React.useState<File | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(titleSchema),
    defaultValues: { title: "" },
  });

  const mutation = useMutation({
    mutationFn: async (input: { title: string; file: File }) => {
      const token = await getToken();
      return createDocument(token, input);
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Document created");
      router.push(`/dashboard/documents/${res.document.id}`);
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Could not upload document.";
      toast.error(message);
    },
  });

  const isBusy = mutation.isPending || isSubmitting;

  function onSubmit(values: FormValues): void {
    if (!file) {
      toast.error("Choose a PDF file to upload.");
      return;
    }
    const title = values.title.trim();
    if (!title) {
      toast.error("Enter a title for this document.");
      return;
    }
    mutation.mutate({ title, file });
  }

  return (
    <DashboardShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <Link
          href="/dashboard"
          className="text-body-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 underline-offset-4"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to dashboard
        </Link>

        <header className="space-y-1">
          <h1 className="text-h1 text-foreground">New document</h1>
          <p className="text-body text-muted-foreground">
            Upload a PDF, then place fields and send it for signature.
          </p>
        </header>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"
        >
          <div className="space-y-6">
            <PdfDropzone
              file={file}
              onFileChange={setFile}
              disabled={isBusy}
              inputId="new-doc-pdf"
            />

            <div className="space-y-2">
              <Label htmlFor="title">Document title</Label>
              <Input
                id="title"
                placeholder="e.g. Intake form — Jane Doe"
                autoComplete="off"
                disabled={isBusy}
                {...register("title")}
                aria-invalid={errors.title ? true : undefined}
              />
              {errors.title ? (
                <p className="text-destructive text-body-sm" role="alert">
                  {errors.title.message}
                </p>
              ) : (
                <p className="text-muted-foreground text-body-sm">
                  Patients see this title in their signing email.
                </p>
              )}
            </div>

            <div className="flex flex-col-reverse items-stretch gap-3 pt-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                disabled={isBusy}
                asChild
              >
                <Link href="/dashboard">Cancel</Link>
              </Button>
              <Button type="submit" disabled={isBusy || !file}>
                {isBusy ? (
                  <>
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden
                    />
                    Uploading…
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                  </>
                )}
              </Button>
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 space-y-4 self-start">
            <div className="bg-card border-border rounded-lg border p-6 shadow-sm">
              <div className="text-caption text-muted-foreground font-semibold tracking-wide uppercase">
                What happens next
              </div>
              <ol className="mt-4 space-y-4">
                <NextStep
                  step={1}
                  icon={PenLine}
                  title="Place fields"
                  body="Drag signature, text, date, checkbox, and initial fields onto the PDF."
                />
                <NextStep
                  step={2}
                  icon={Send}
                  title="Send signing link"
                  body="Add the patient's name and email. They sign on any device — no account needed."
                />
                <NextStep
                  step={3}
                  icon={FileSignature}
                  title="Get the signed copy"
                  body="We flatten their entries into the PDF and email both sides."
                />
              </ol>
            </div>

            <div className="text-body-sm text-muted-foreground bg-muted/40 border-border rounded-md border px-4 py-3">
              <strong className="text-foreground font-medium">Heads up:</strong>{" "}
              upload only PDFs the patient should see. Page count and content
              are preserved exactly.
            </div>
          </aside>
        </form>
      </div>
    </DashboardShell>
  );
}

function NextStep({
  step,
  icon: Icon,
  title,
  body,
}: {
  step: number;
  icon: React.ComponentType<{
    className?: string;
    "aria-hidden"?: boolean;
    strokeWidth?: number;
  }>;
  title: string;
  body: string;
}): JSX.Element {
  return (
    <li className="flex items-start gap-3">
      <div className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-md">
        <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
      </div>
      <div>
        <div className="text-body text-foreground flex items-center gap-2 font-medium">
          <span className="text-muted-foreground text-caption">
            Step {step}
          </span>
          <span className="bg-border h-1 w-1 rounded-full" aria-hidden />
          {title}
        </div>
        <p className="text-body-sm text-muted-foreground mt-0.5">{body}</p>
      </div>
    </li>
  );
}
