"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ApiDocument } from "@/lib/api-types";
import { ApiError, fetchDocumentsList } from "@/lib/api-client";
import type { DocumentStatus } from "@clinicsign/shared-types";

const STATUS_ORDER: DocumentStatus[] = [
  "DRAFT",
  "SENT",
  "VIEWED",
  "SIGNED",
  "EXPIRED",
  "VOIDED",
];

const STATUS_LABEL: Record<DocumentStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  VIEWED: "Viewed",
  SIGNED: "Signed",
  EXPIRED: "Expired",
  VOIDED: "Voided",
};

function countByStatus(documents: ApiDocument[]): Record<DocumentStatus, number> {
  const init = {} as Record<DocumentStatus, number>;
  for (const s of STATUS_ORDER) {
    init[s] = 0;
  }
  for (const d of documents) {
    init[d.status] = (init[d.status] ?? 0) + 1;
  }
  return init;
}

export type DocumentsCommandCenterProps = {
  welcome: {
    name: string;
    clinic: string;
  };
};

export function DocumentsCommandCenter({
  welcome,
}: DocumentsCommandCenterProps): JSX.Element {
  const { getToken, isLoaded } = useAuth();

  const { data, isPending, error } = useQuery({
    queryKey: ["documents", 1, 50],
    enabled: isLoaded,
    queryFn: async () => {
      const token = await getToken();
      return fetchDocumentsList(token, { page: 1, limit: 50 });
    },
  });

  const breakdown = useMemo(
    () => (data ? countByStatus(data.documents) : null),
    [data]
  );

  if (!isLoaded || isPending) {
    return (
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-1">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-72 max-w-full" />
        </header>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start lg:gap-10">
          <Card className="shadow-sm">
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
          <aside className="flex flex-col gap-4">
            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader>
                <Skeleton className="h-5 w-24" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    );
  }

  if (error) {
    const message =
      error instanceof ApiError ? error.message : "Could not load documents.";
    return (
      <p className="text-body text-destructive py-4" role="alert">
        {message}
      </p>
    );
  }

  if (!data) {
    return (
      <p className="text-body text-muted-foreground py-4">
        No data returned.
      </p>
    );
  }

  const truncated =
    data.total > data.documents.length ? (
      <p className="text-caption text-muted-foreground">
        Status counts reflect these {data.documents.length} documents. Total in
        your clinic: {data.total}.
      </p>
    ) : null;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-h1 text-foreground">Documents</h1>
        <p className="text-body text-muted-foreground">
          {welcome.name} · {welcome.clinic}
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start lg:gap-10">
        <div className="min-w-0 space-y-4">
          {data.documents.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No documents yet"
              description="Upload a PDF to create a draft, place fields, then send it for signature."
              action={{
                label: "New document",
                href: "/dashboard/documents/new",
              }}
            />
          ) : (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-h4">All documents</CardTitle>
                <CardDescription className="text-body-sm">
                  Select a row to open details, fields, and send options.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">
                        Updated
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.documents.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="text-body-sm">
                          <Link
                            href={`/dashboard/documents/${doc.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {doc.title}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={doc.status} />
                        </TableCell>
                        <TableCell className="text-body-sm text-muted-foreground hidden sm:table-cell">
                          {new Date(doc.updatedAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          {data.total > data.documents.length ? (
            <p className="text-body-sm text-muted-foreground">
              Showing {data.documents.length} of {data.total}.
            </p>
          ) : null}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          {data.documents.length > 0 ? (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-h4">New document</CardTitle>
                <CardDescription className="text-body-sm">
                  Upload a PDF to start a draft.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" asChild>
                  <Link href="/dashboard/documents/new">
                    <Plus
                      className="mr-2 h-4 w-4"
                      aria-hidden
                      strokeWidth={1.5}
                    />
                    New document
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-h4">At a glance</CardTitle>
              <p className="text-body-sm text-muted-foreground">
                Total documents:{" "}
                <span className="font-medium text-foreground">
                  {data.total}
                </span>
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {breakdown ? (
                <ul className="grid grid-cols-2 gap-x-3 gap-y-2 text-body-sm">
                  {STATUS_ORDER.map((status) => (
                    <li key={status} className="contents">
                      <span className="text-muted-foreground">
                        {STATUS_LABEL[status]}
                      </span>
                      <span className="text-right tabular-nums text-foreground">
                        {breakdown[status]}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {truncated}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
