"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardList,
  FileSignature,
  FileText,
  Heart,
  Loader2,
  Pill,
  ShieldCheck,
  Stethoscope,
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
import { cn } from "@/lib/utils";

const titleSchema = z.object({
  title: z.string().min(1, "Title is required.").max(500),
});

type FormValues = z.infer<typeof titleSchema>;

type StepKey = "upload" | "name" | "send";
type StepState = "completed" | "active" | "upcoming";

const STEPS: Array<{ key: StepKey; label: string; description: string }> = [
  {
    key: "upload",
    label: "Upload",
    description: "Pick a PDF from your device.",
  },
  {
    key: "name",
    label: "Name it",
    description: "Give it a clear patient-facing title.",
  },
  {
    key: "send",
    label: "Prepare & send",
    description: "Place fields and email the signing link.",
  },
];

export default function NewDocumentPage(): JSX.Element {
  const { getToken } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [file, setFile] = React.useState<File | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting, dirtyFields },
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
  const hasTitle = Boolean(getValues("title")?.trim().length);

  // Auto-suggest a title from the filename the first time a file is picked,
  // only if the user hasn't typed their own. `dirtyFields.title` flips once
  // they interact, so we never overwrite their edits when they swap files.
  React.useEffect(() => {
    if (!file) return;
    if (dirtyFields.title) return;
    const current = getValues("title");
    if (current && current.trim().length > 0) return;
    const suggested = suggestTitleFromFilename(file.name);
    if (suggested) {
      setValue("title", suggested, { shouldDirty: false, shouldValidate: true });
    }
  }, [file, dirtyFields.title, getValues, setValue]);

  const stepState: Record<StepKey, StepState> = React.useMemo(() => {
    if (!file) {
      return { upload: "active", name: "upcoming", send: "upcoming" };
    }
    if (!hasTitle) {
      return { upload: "completed", name: "active", send: "upcoming" };
    }
    return { upload: "completed", name: "completed", send: "upcoming" };
  }, [file, hasTitle]);

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
      <div className="mx-auto max-w-3xl space-y-8">
        <Link
          href="/dashboard"
          className="text-body-sm text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1.5 underline-offset-4"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to dashboard
        </Link>

        <header className="space-y-2">
          <h1 className="text-h1 text-foreground">New document</h1>
          <p className="text-body text-muted-foreground">
            Upload a PDF, place fields, and send it for signature — typically
            under two minutes.
          </p>
        </header>

        <Stepper state={stepState} />

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <section className="space-y-3">
            <SectionHeading
              eyebrow="Step 1"
              title="Upload the PDF"
              description="Drop the file or click to browse. We'll detect the page count automatically."
            />
            <PdfDropzone
              file={file}
              onFileChange={setFile}
              disabled={isBusy}
              inputId="new-doc-pdf"
            />
          </section>

          <section className="space-y-3">
            <SectionHeading
              eyebrow="Step 2"
              title="Name it for the patient"
              description="This title shows up in the signing email's subject and preview."
            />
            <div className="space-y-2">
              <Label htmlFor="title" className="sr-only">
                Document title
              </Label>
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
              ) : null}
            </div>
          </section>

          <TemplateChipRow />

          <div className="flex flex-col-reverse items-stretch gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="border-border bg-muted/40 inline-flex items-center gap-2 rounded-md border px-3 py-2">
              <ShieldCheck
                className="text-muted-foreground h-4 w-4 shrink-0"
                strokeWidth={2}
                aria-hidden
              />
              <p className="text-caption text-muted-foreground">
                <span className="text-foreground font-medium">Private.</span>{" "}
                PDFs are stored encrypted and only accessible to your clinic.
              </p>
            </div>
            <div className="flex items-center gap-3 sm:justify-end">
              <Button type="button" variant="ghost" disabled={isBusy} asChild>
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
                    Continue to fields
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </DashboardShell>
  );
}


function Stepper({ state }: { state: Record<StepKey, StepState> }): JSX.Element {
  return (
    <ol
      className="border-border bg-card flex flex-col gap-0 overflow-hidden rounded-lg border shadow-sm md:flex-row"
      aria-label="Document creation steps"
    >
      {STEPS.map((step, idx) => {
        const s = state[step.key];
        return (
          <li
            key={step.key}
            aria-current={s === "active" ? "step" : undefined}
            className={cn(
              "group relative flex min-w-0 flex-1 items-center gap-3 px-4 py-3",
              // Chevron-style separator between steps on desktop; stacked on mobile
              idx > 0 &&
                "md:before:border-border md:before:absolute md:before:-left-px md:before:top-0 md:before:h-full md:before:border-l"
            )}
          >
            <StepDot state={s} index={idx + 1} />
            <div className="min-w-0">
              <p
                className={cn(
                  "text-caption font-semibold uppercase tracking-wide",
                  s === "completed"
                    ? "text-primary"
                    : s === "active"
                      ? "text-foreground"
                      : "text-muted-foreground"
                )}
              >
                Step {idx + 1}
              </p>
              <p
                className={cn(
                  "text-body-sm truncate font-medium",
                  s === "upcoming" ? "text-muted-foreground" : "text-foreground"
                )}
              >
                {step.label}
              </p>
              <p className="text-caption text-muted-foreground truncate">
                {step.description}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StepDot({
  state,
  index,
}: {
  state: StepState;
  index: number;
}): JSX.Element {
  if (state === "completed") {
    return (
      <span className="bg-primary text-primary-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
        <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "text-caption flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-semibold tabular-nums",
        state === "active"
          ? "border-primary text-primary border-2 bg-primary/10"
          : "border-border text-muted-foreground border"
      )}
    >
      {index}
    </span>
  );
}


type TemplateChip = {
  id: string;
  label: string;
  icon: typeof FileText;
};

const TEMPLATE_CHIPS: TemplateChip[] = [
  { id: "consent", label: "Consent form", icon: FileSignature },
  { id: "intake", label: "Intake form", icon: ClipboardList },
  { id: "postop", label: "Post-op instructions", icon: Stethoscope },
  { id: "rx", label: "Prescription", icon: Pill },
  { id: "followup", label: "Follow-up plan", icon: Heart },
];

function TemplateChipRow(): JSX.Element {
  return (
    <section className="space-y-3">
      <SectionHeading
        eyebrow="Faster next time"
        title="Start from a template"
        description="Save any document as a template to reuse the fields and title."
      />
      <div className="flex flex-wrap gap-2">
        {TEMPLATE_CHIPS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              disabled
              aria-disabled="true"
              className="border-border bg-background text-muted-foreground text-body-sm inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-full border px-3 font-medium opacity-70"
              title="Templates arrive next"
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              {t.label}
            </button>
          );
        })}
        <span className="text-caption text-muted-foreground inline-flex items-center px-1">
          Coming soon
        </span>
      </div>
    </section>
  );
}


function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}): JSX.Element {
  return (
    <div className="space-y-1">
      <p className="text-caption text-muted-foreground font-semibold tracking-wide uppercase">
        {eyebrow}
      </p>
      <h2 className="text-h4 text-foreground">{title}</h2>
      <p className="text-body-sm text-muted-foreground">{description}</p>
    </div>
  );
}

/**
 * Turns "Intake Form - Jane Doe.pdf" → "Intake Form - Jane Doe".
 * Returns an empty string when the filename is just an extension.
 */
function suggestTitleFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.pdf$/i, "").trim();
  // Replace underscores / dashes with spaces only when they're clearly
  // token separators, not inside words. A single pass is fine for a
  // human-readable suggestion.
  return withoutExt.replace(/[_]+/g, " ").replace(/\s+/g, " ").slice(0, 200);
}
