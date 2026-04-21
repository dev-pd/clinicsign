"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, fetchDocumentsList } from "@/lib/api-client";

export function DocumentsListSection(): JSX.Element {
  const { getToken, isLoaded } = useAuth();

  const { data, isPending, error } = useQuery({
    queryKey: ["documents", 1, 50],
    enabled: isLoaded,
    queryFn: async () => {
      const token = await getToken();
      return fetchDocumentsList(token, { page: 1, limit: 50 });
    },
  });

  if (!isLoaded || isPending) {
    return (
      <div className="text-body text-muted-foreground py-8">
        Loading documents…
      </div>
    );
  }

  if (error) {
    const message =
      error instanceof ApiError
        ? error.message
        : "Could not load documents.";
    return (
      <div className="text-body text-destructive py-4" role="alert">
        {message}
      </div>
    );
  }

  if (!data || data.documents.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No documents yet"
        description="Upload a PDF to create a draft, add fields (coming next), then send it for signature."
        action={{
          label: "New document",
          href: "/dashboard/documents/new",
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-title text-foreground">Documents</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden sm:table-cell">Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.documents.map((doc) => (
            <TableRow key={doc.id}>
              <TableCell>
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
              <TableCell className="text-muted-foreground hidden sm:table-cell">
                {new Date(doc.updatedAt).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {data.total > data.documents.length ? (
        <p className="text-body text-muted-foreground">
          Showing {data.documents.length} of {data.total}.
        </p>
      ) : null}
    </div>
  );
}
