"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  Search,
  Send,
  Timer,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
import { cn } from "@/lib/utils";
import type { DocumentStatus } from "@clinicsign/shared-types";

type FilterKey = "all" | "drafts" | "out" | "signed" | "ended";

const FILTER_LABEL: Record<FilterKey, string> = {
  all: "All",
  drafts: "Drafts",
  out: "Out for signature",
  signed: "Signed",
  ended: "Voided / Expired",
};

const FILTER_MATCH: Record<FilterKey, (s: DocumentStatus) => boolean> = {
  all: () => true,
  drafts: (s) => s === "DRAFT",
  out: (s) => s === "SENT" || s === "VIEWED",
  signed: (s) => s === "SIGNED",
  ended: (s) => s === "VOIDED" || s === "EXPIRED",
};

export type DocumentsCommandCenterProps = {
  welcome: { name: string; clinic: string };
};

export function DocumentsCommandCenter({
  welcome,
}: DocumentsCommandCenterProps): JSX.Element {
  const { getToken, isLoaded } = useAuth();
  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [query, setQuery] = React.useState("");

  const { data, isPending, error } = useQuery({
    queryKey: ["documents", 1, 50],
    enabled: isLoaded,
    queryFn: async () => {
      const token = await getToken();
      return fetchDocumentsList(token, { page: 1, limit: 50 });
    },
  });

  const kpis = useMemo(() => (data ? computeKpis(data.documents) : null), [
    data,
  ]);

  const filteredDocs = useMemo(() => {
    if (!data) return [];
    const trimmed = query.trim().toLowerCase();
    return data.documents
      .filter((d) => FILTER_MATCH[filter](d.status))
      .filter((d) =>
        trimmed.length === 0 ? true : d.title.toLowerCase().includes(trimmed)
      );
  }, [data, filter, query]);

  if (!isLoaded || isPending) {
    return <CommandCenterSkeleton welcome={welcome} />;
  }

  if (error) {
    const message =
      error instanceof ApiError ? error.message : "Could not load documents.";
    return (
      <div className="space-y-6">
        <PageHeader welcome={welcome} />
        <Card>
          <CardContent className="text-destructive py-6 text-body" role="alert">
            {message}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader welcome={welcome} />
        <Card>
          <CardContent className="text-muted-foreground py-6 text-body">
            No data returned.
          </CardContent>
        </Card>
      </div>
    );
  }

  const isEmpty = data.documents.length === 0;

  return (
    <div className="space-y-8">
      <PageHeader welcome={welcome} />

      {isEmpty ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={FileText}
              title="No documents yet"
              description="Upload a PDF to create a draft, place fields, then send it for signature."
              action={{
                label: "New document",
                href: "/dashboard/documents/new",
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {kpis ? <KpiStrip kpis={kpis} onJump={setFilter} /> : null}

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Tabs
              value={filter}
              onValueChange={(v: string) => setFilter(v as FilterKey)}
            >
              <TabsList className="h-10">
                {(Object.keys(FILTER_LABEL) as FilterKey[]).map((k) => (
                  <TabsTrigger key={k} value={k} className="px-3">
                    {FILTER_LABEL[k]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="relative w-full md:w-72">
              <Search
                className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title"
                className="pl-9"
                aria-label="Search documents by title"
              />
            </div>
          </div>

          <Card className="shadow-sm">
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-caption text-muted-foreground pl-6">
                      Title
                    </TableHead>
                    <TableHead className="text-caption text-muted-foreground">
                      Status
                    </TableHead>
                    <TableHead className="text-caption text-muted-foreground hidden md:table-cell">
                      Last activity
                    </TableHead>
                    <TableHead className="text-caption text-muted-foreground hidden sm:table-cell">
                      Created
                    </TableHead>
                    <TableHead className="pr-6 text-right" aria-label="Open" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocs.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-muted-foreground py-12 text-center text-body"
                      >
                        No documents match the current filter.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredDocs.map((doc) => (
                      <DocumentRow key={doc.id} doc={doc} />
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {data.total > data.documents.length ? (
            <p className="text-body-sm text-muted-foreground">
              Showing {data.documents.length} of {data.total}.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function PageHeader({
  welcome,
}: {
  welcome: { name: string; clinic: string };
}): JSX.Element {
  return (
    <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="space-y-1">
        <p className="text-caption text-muted-foreground font-semibold tracking-wide uppercase">
          {welcome.clinic}
        </p>
        <h1 className="text-h1 text-foreground">
          Welcome back, {firstName(welcome.name)}
        </h1>
        <p className="text-body text-muted-foreground">
          Send, sign, and track patient documents.
        </p>
      </div>
      <Button asChild className="self-start md:self-auto">
        <Link href="/dashboard/documents/new">
          <Plus className="mr-1.5 h-4 w-4" aria-hidden strokeWidth={2} />
          New document
        </Link>
      </Button>
    </header>
  );
}

type Kpis = {
  drafts: number;
  out: number;
  signed: number;
  total: number;
  medianTimeToSignMs: number | null;
};

function KpiStrip({
  kpis,
  onJump,
}: {
  kpis: Kpis;
  onJump: (f: FilterKey) => void;
}): JSX.Element {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        icon={FileText}
        label="Drafts"
        value={kpis.drafts.toString()}
        helper="Not yet sent"
        onClick={() => onJump("drafts")}
      />
      <KpiCard
        icon={Send}
        label="Out for signature"
        value={kpis.out.toString()}
        helper="Awaiting patient"
        onClick={() => onJump("out")}
      />
      <KpiCard
        icon={CheckCircle2}
        label="Signed"
        value={kpis.signed.toString()}
        helper={`${kpis.total} total documents`}
        onClick={() => onJump("signed")}
      />
      <KpiCard
        icon={Timer}
        label="Median time to sign"
        value={
          kpis.medianTimeToSignMs === null
            ? "—"
            : formatDuration(kpis.medianTimeToSignMs)
        }
        helper="Across signed documents"
      />
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  helper,
  onClick,
}: {
  icon: React.ComponentType<{
    className?: string;
    "aria-hidden"?: boolean;
    strokeWidth?: number;
  }>;
  label: string;
  value: string;
  helper: string;
  onClick?: () => void;
}): JSX.Element {
  const interactive = typeof onClick === "function";
  const Tag: React.ElementType = interactive ? "button" : "div";
  return (
    <Tag
      type={interactive ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "bg-card border-border rounded-lg border p-5 text-left shadow-sm transition-colors",
        interactive && "hover:border-primary/40 cursor-pointer"
      )}
    >
      <div className="text-muted-foreground flex items-center gap-2">
        <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
        <span className="text-caption font-medium">{label}</span>
      </div>
      <div className="text-h2 text-foreground mt-3 tabular-nums">{value}</div>
      <div className="text-caption text-muted-foreground mt-1">{helper}</div>
    </Tag>
  );
}

function DocumentRow({ doc }: { doc: ApiDocument }): JSX.Element {
  const lastActivity = lastActivityIso(doc);
  const lastActivityLabel = lastActivity ? relativeTime(lastActivity) : "—";
  const lastActivityFull = lastActivity
    ? new Date(lastActivity).toLocaleString()
    : undefined;
  return (
    <TableRow className="group">
      <TableCell className="pl-6 text-body-sm">
        <Link
          href={`/dashboard/documents/${doc.id}`}
          className="text-foreground hover:text-primary inline-flex items-center gap-2 font-medium underline-offset-4 hover:underline"
        >
          <FileText
            className="text-muted-foreground h-4 w-4 shrink-0"
            strokeWidth={1.75}
            aria-hidden
          />
          <span className="truncate">{doc.title}</span>
        </Link>
      </TableCell>
      <TableCell>
        <StatusBadge status={doc.status} />
      </TableCell>
      <TableCell
        className="text-body-sm text-muted-foreground hidden md:table-cell"
        title={lastActivityFull}
      >
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          {lastActivityLabel}
        </span>
      </TableCell>
      <TableCell className="text-body-sm text-muted-foreground hidden sm:table-cell">
        {new Date(doc.createdAt).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </TableCell>
      <TableCell className="pr-6 text-right">
        <Link
          href={`/dashboard/documents/${doc.id}`}
          className="text-muted-foreground group-hover:text-primary inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
          aria-label={`Open ${doc.title}`}
        >
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </TableCell>
    </TableRow>
  );
}

function CommandCenterSkeleton({
  welcome,
}: {
  welcome: { name: string; clinic: string };
}): JSX.Element {
  return (
    <div className="space-y-8">
      <PageHeader welcome={welcome} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="shadow-sm">
            <CardHeader className="space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-32" />
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card className="shadow-sm">
        <CardContent className="space-y-3 py-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

// ------- helpers (intentionally inline; one-shot use) -------

function firstName(full: string): string {
  const trimmed = full.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0] ?? "there";
}

function lastActivityIso(d: ApiDocument): string | null {
  return d.signedAt ?? d.sentAt ?? d.updatedAt ?? d.createdAt ?? null;
}

function computeKpis(docs: ApiDocument[]): Kpis {
  let drafts = 0;
  let out = 0;
  let signed = 0;
  const signDurations: number[] = [];

  for (const d of docs) {
    if (d.status === "DRAFT") drafts += 1;
    else if (d.status === "SENT" || d.status === "VIEWED") out += 1;
    else if (d.status === "SIGNED") {
      signed += 1;
      if (d.sentAt && d.signedAt) {
        const diff = new Date(d.signedAt).getTime() - new Date(d.sentAt).getTime();
        if (Number.isFinite(diff) && diff > 0) signDurations.push(diff);
      }
    }
  }

  let median: number | null = null;
  if (signDurations.length > 0) {
    const sorted = [...signDurations].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      const lo = sorted[mid - 1] ?? 0;
      const hi = sorted[mid] ?? 0;
      median = (lo + hi) / 2;
    } else {
      median = sorted[mid] ?? 0;
    }
  }

  return {
    drafts,
    out,
    signed,
    total: docs.length,
    medianTimeToSignMs: median,
  };
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

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = m / 60;
  if (h < 24) return `${h.toFixed(h < 10 ? 1 : 0)}h`;
  const d = h / 24;
  return `${d.toFixed(d < 10 ? 1 : 0)}d`;
}
