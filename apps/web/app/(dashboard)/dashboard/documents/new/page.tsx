"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, createDocument } from "@/lib/api-client";

const titleSchema = z.object({
  title: z.string().min(1, "Title is required.").max(500),
});

type FormValues = z.infer<typeof titleSchema>;

function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

export default function NewDocumentPage(): JSX.Element {
  const { getToken } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

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

  return (
    <DashboardShell>
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>New document</CardTitle>
          <CardDescription>
            Upload a PDF. You can place fields and send for signature in later
            steps.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={handleSubmit((values) => {
              const el = document.getElementById(
                "new-doc-pdf"
              ) as HTMLInputElement | null;
              const file = el?.files?.[0];
              if (!file || file.size === 0) {
                toast.error("Choose a PDF file.");
                return;
              }
              if (!isPdfFile(file)) {
                toast.error("Only PDF files are supported.");
                return;
              }
              const title = values.title?.trim() ?? "";
              if (!title) {
                toast.error("Enter a title for this document.");
                return;
              }
              mutation.mutate({ title, file });
            })}
          >
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="e.g. Intake form – Jane Doe"
                {...register("title")}
                aria-invalid={errors.title ? true : undefined}
              />
              {errors.title ? (
                <p className="text-body text-destructive">{errors.title.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-doc-pdf">PDF file</Label>
              <Input
                id="new-doc-pdf"
                type="file"
                accept="application/pdf,.pdf"
              />
            </div>
            <Button
              type="submit"
              disabled={isSubmitting || mutation.isPending}
            >
              {mutation.isPending ? "Uploading…" : "Upload"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
