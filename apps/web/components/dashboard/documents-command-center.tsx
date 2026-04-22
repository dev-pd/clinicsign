"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Clock,
  FileText,
  Flame,
  LayoutTemplate,
  Mail,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Sparkles,
  Timer,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useMemo } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ApiDocumentListItem } from "@/lib/api-types";
import {
  ApiError,
  fetchDocumentsList,
  resendDocument,
  voidDocument,
} from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { DocumentStatus } from "@clinicsign/shared-types";

type FilterKey = "all" | "drafts" | "out" | "signed" | "ended";
type ChipKey = "stale" | "opened" | "expires";

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

const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * MS_HOUR;
const STALE_THRESHOLD_MS = 48 * MS_HOUR;
const EXPIRES_SOON_MS = 7 * MS_DAY;

export type DocumentsCommandCenterProps = {
  // Kept for future greeting surfaces (toasts, onboarding, etc). The page
  // header intentionally no longer renders the welcome block — the grid is
  // the focus, not a greeting.
  welcome: { name: string; clinic: string };
};

const PAGE_SIZE = 10;
// Upper bound for the single initial fetch. The grid paginates client-side
// below this; if a clinic ever crosses 100 docs, switch this to true
// server pagination (the backend already supports `page`/`limit`).
const FETCH_LIMIT = 100;

export function DocumentsCommandCenter(
  _props: DocumentsCommandCenterProps
): JSX.Element {
  const { getToken, isLoaded } = useAuth();
  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [chip, setChip] = React.useState<ChipKey | null>(null);
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);

  const { data, isPending, error } = useQuery({
    queryKey: ["documents", 1, FETCH_LIMIT],
    enabled: isLoaded,
    queryFn: async () => {
      const token = await getToken();
      return fetchDocumentsList(token, { page: 1, limit: FETCH_LIMIT });
    },
  });

  const docs = useMemo<ApiDocumentListItem[]>(
    () => data?.documents ?? [],
    [data]
  );

  const kpis = useMemo(() => computeKpis(docs), [docs]);
  const attention = useMemo(() => computeAttention(docs), [docs]);
  const activity = useMemo(() => computeActivity(docs), [docs]);

  const filteredDocs = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    const byTab = docs.filter((d) => FILTER_MATCH[filter](d.status));
    const byChip = chip ? byTab.filter((d) => matchesChip(d, chip)) : byTab;
    if (trimmed.length === 0) return byChip;
    return byChip.filter((d) => {
      const inTitle = d.title.toLowerCase().includes(trimmed);
      const inRecipient =
        d.recipient !== null &&
        (d.recipient.name.toLowerCase().includes(trimmed) ||
          d.recipient.email.toLowerCase().includes(trimmed));
      return inTitle || inRecipient;
    });
  }, [docs, filter, chip, query]);

  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageDocs = useMemo(
    () =>
      filteredDocs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredDocs, safePage]
  );

  // Snap back to page 1 whenever the user narrows the list — otherwise
  // they can end up on a "page" that no longer exists after filtering.
  React.useEffect(() => {
    setPage(1);
  }, [filter, chip, query]);

  if (!isLoaded || isPending) {
    return <CommandCenterSkeleton />;
  }

  if (error) {
    const message =
      error instanceof ApiError ? error.message : "Could not load documents.";
    return (
      <div className="space-y-6">
        <PageHeader />
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
        <PageHeader />
        <Card>
          <CardContent className="text-muted-foreground py-6 text-body">
            No data returned.
          </CardContent>
        </Card>
      </div>
    );
  }

  const isEmpty = docs.length === 0;

  return (
    <div className="space-y-8">
      <PageHeader />

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
          {attention.length > 0 ? (
            <AttentionBanner items={attention} />
          ) : null}

          <AskCopilotBar />

          <KpiStrip kpis={kpis} onJump={(f) => { setChip(null); setFilter(f); }} />

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-4">
              <FilterBar
                filter={filter}
                chip={chip}
                query={query}
                onFilterChange={(f) => { setFilter(f); setChip(null); }}
                onChipChange={(next) => {
                  setChip(next);
                  if (next) setFilter("out");
                }}
                onQueryChange={setQuery}
              />

              <DocumentsTable
                docs={pageDocs}
                emptyHint={
                  chip || filter !== "all" || query.trim().length > 0
                    ? "No documents match the current filter."
                    : "No documents yet."
                }
              />

              <PaginationFooter
                page={safePage}
                totalPages={totalPages}
                total={filteredDocs.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />

              {data.total > docs.length ? (
                <p className="text-caption text-muted-foreground">
                  Showing the {docs.length} most recent of {data.total} documents.
                </p>
              ) : null}
            </div>

            <aside className="space-y-4 lg:sticky lg:top-6 lg:h-fit">
              <ActivityCard items={activity} />
              <TemplatesCard />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}


function PageHeader(): JSX.Element {
  return (
    <header className="flex items-center justify-between gap-3">
      <h1 className="text-h2 text-foreground">Documents</h1>
      <Button asChild>
        <Link href="/dashboard/documents/new">
          <Plus className="mr-1.5 h-4 w-4" aria-hidden strokeWidth={2} />
          New document
        </Link>
      </Button>
    </header>
  );
}


type AttentionKind = "stale" | "expiring" | "draft";
type AttentionItem = {
  kind: AttentionKind;
  doc: ApiDocumentListItem;
  detail: string;
};

const ATTENTION_VISUAL: Record<
  AttentionKind,
  { icon: typeof TriangleAlert; tone: string; label: string }
> = {
  stale: {
    icon: Flame,
    tone: "bg-warning/15 text-warning-foreground",
    label: "Stale",
  },
  expiring: {
    icon: Timer,
    tone: "bg-destructive/10 text-destructive",
    label: "Expiring",
  },
  draft: {
    icon: AlertCircle,
    tone: "bg-info/10 text-info",
    label: "Unsent draft",
  },
};

function AttentionBanner({ items }: { items: AttentionItem[] }): JSX.Element {
  return (
    <section
      aria-labelledby="attention-heading"
      className="border-border bg-card rounded-lg border p-5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TriangleAlert
            className="text-warning h-4 w-4"
            strokeWidth={2}
            aria-hidden
          />
          <h2
            id="attention-heading"
            className="text-body text-foreground font-semibold"
          >
            Needs your attention
          </h2>
        </div>
        <span className="text-caption text-muted-foreground">
          Top {items.length}
        </span>
      </div>
      <ul className="divide-border mt-3 divide-y">
        {items.map((item) => {
          const visual = ATTENTION_VISUAL[item.kind];
          const Icon = visual.icon;
          return (
            <li key={item.doc.id} className="flex items-center gap-3 py-3">
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  visual.tone
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body-sm text-foreground truncate font-medium">
                  {item.doc.title}
                </p>
                <p className="text-caption text-muted-foreground truncate">
                  {visual.label} · {item.detail}
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href={`/dashboard/documents/${item.doc.id}`}>
                  Open
                  <ArrowUpRight
                    className="ml-1 h-3.5 w-3.5"
                    strokeWidth={2}
                    aria-hidden
                  />
                </Link>
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Placeholder for a future AI assist surface; kept here so the dashboard
// reserves vertical space without needing a layout reshuffle later.

function AskCopilotBar(): JSX.Element {
  return (
    <div
      className="border-border bg-accent/40 rounded-lg border border-dashed p-4"
      aria-label="AI assistant (coming soon)"
    >
      <div className="flex items-center gap-3">
        <span className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-md">
          <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body-sm text-foreground font-medium">
            Ask ClinicSign
          </p>
          <p className="text-caption text-muted-foreground">
            Summarise documents, draft a reminder, or query activity. Arriving
            soon.
          </p>
        </div>
        <span className="text-caption text-muted-foreground hidden sm:inline">
          Coming soon
        </span>
      </div>
    </div>
  );
}


type Kpis = {
  drafts: KpiEntry;
  out: KpiEntry;
  signed: KpiEntry;
  stale: KpiEntry;
};

type KpiEntry = {
  value: number;
  helper: string;
  delta: number | null;
  sparkline: number[] | null;
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
        entry={kpis.drafts}
        onClick={() => onJump("drafts")}
      />
      <KpiCard
        icon={Send}
        label="Out for signature"
        entry={kpis.out}
        onClick={() => onJump("out")}
      />
      <KpiCard
        icon={CheckCircle2}
        label="Signed this week"
        entry={kpis.signed}
        onClick={() => onJump("signed")}
      />
      <KpiCard
        icon={Flame}
        label="Stale > 48h"
        entry={kpis.stale}
        onClick={() => onJump("out")}
      />
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  entry,
  onClick,
}: {
  icon: React.ComponentType<{
    className?: string;
    "aria-hidden"?: boolean;
    strokeWidth?: number;
  }>;
  label: string;
  entry: KpiEntry;
  onClick?: () => void;
}): JSX.Element {
  const interactive = typeof onClick === "function";
  const Tag: React.ElementType = interactive ? "button" : "div";
  const deltaTone =
    entry.delta === null
      ? ""
      : entry.delta > 0
        ? "text-success"
        : entry.delta < 0
          ? "text-destructive"
          : "text-muted-foreground";
  return (
    <Tag
      type={interactive ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "bg-card border-border group rounded-lg border p-5 text-left shadow-sm transition-colors",
        interactive && "hover:border-primary/40 cursor-pointer"
      )}
    >
      <div className="text-muted-foreground flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2">
          <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
          <span className="text-caption font-medium">{label}</span>
        </span>
        {entry.delta !== null ? (
          <span
            className={cn("text-caption font-medium tabular-nums", deltaTone)}
            aria-label={`Week over week: ${entry.delta > 0 ? "+" : ""}${entry.delta}`}
          >
            {entry.delta > 0 ? "+" : ""}
            {entry.delta}
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="text-h2 text-foreground tabular-nums leading-none">
          {entry.value}
        </div>
        {entry.sparkline ? (
          <Sparkline values={entry.sparkline} className="text-primary" />
        ) : null}
      </div>
      <div className="text-caption text-muted-foreground mt-2">
        {entry.helper}
      </div>
    </Tag>
  );
}

function Sparkline({
  values,
  className,
}: {
  values: number[];
  className?: string;
}): JSX.Element {
  const w = 72;
  const h = 24;
  const max = Math.max(1, ...values);
  const stepX = values.length > 1 ? w / (values.length - 1) : w;
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = h - (v / max) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const areaPoints = `0,${h} ${points} ${w},${h}`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      className={cn("shrink-0", className)}
      role="img"
      aria-hidden
    >
      <polygon points={areaPoints} fill="currentColor" opacity={0.12} />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}


const CHIP_LABEL: Record<ChipKey, string> = {
  stale: "Stale > 48h",
  opened: "Opened, not signed",
  expires: "Expires this week",
};

function FilterBar({
  filter,
  chip,
  query,
  onFilterChange,
  onChipChange,
  onQueryChange,
}: {
  filter: FilterKey;
  chip: ChipKey | null;
  query: string;
  onFilterChange: (f: FilterKey) => void;
  onChipChange: (c: ChipKey | null) => void;
  onQueryChange: (q: string) => void;
}): JSX.Element {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs
          value={filter}
          onValueChange={(v: string) => onFilterChange(v as FilterKey)}
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
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search title or recipient"
            className="pl-9"
            aria-label="Search documents"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-caption text-muted-foreground">Quick filters</span>
        {(Object.keys(CHIP_LABEL) as ChipKey[]).map((k) => {
          const active = chip === k;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={active}
              onClick={() => onChipChange(active ? null : k)}
              className={cn(
                "text-caption inline-flex h-7 items-center rounded-full border px-3 font-medium transition-colors",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {CHIP_LABEL[k]}
            </button>
          );
        })}
        {chip ? (
          <button
            type="button"
            onClick={() => onChipChange(null)}
            className="text-caption text-muted-foreground hover:text-foreground ml-1 underline underline-offset-4"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

// Fixed column widths so page-to-page layout is stable regardless of how
// long the titles are. The Title column is pinned to the left via
// `position: sticky`; everything to the right of it scrolls horizontally
// inside the card. The `pl-6 / pr-6` edge padding lives on the sticky cell
// itself so it travels with the scroll.
const STICKY_TITLE = "sticky left-0 z-20 bg-card shadow-[1px_0_0_0_var(--color-border)]";
const STICKY_TITLE_CELL =
  "sticky left-0 z-10 bg-card group-hover:bg-muted/50 shadow-[1px_0_0_0_var(--color-border)]";

function DocumentsTable({
  docs,
  emptyHint,
}: {
  docs: ApiDocumentListItem[];
  emptyHint: string;
}): JSX.Element {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className={cn(
                  "text-caption text-muted-foreground pl-6 min-w-[280px]",
                  STICKY_TITLE
                )}
              >
                Title
              </TableHead>
              <TableHead className="text-caption text-muted-foreground min-w-[200px]">
                Recipient
              </TableHead>
              <TableHead className="text-caption text-muted-foreground min-w-[240px]">
                Email
              </TableHead>
              <TableHead className="text-caption text-muted-foreground min-w-[140px]">
                Status
              </TableHead>
              <TableHead className="text-caption text-muted-foreground min-w-[220px]">
                Last activity
              </TableHead>
              <TableHead
                className="pr-6 text-right min-w-[104px]"
                aria-label="Actions"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground py-12 text-center text-body"
                >
                  {emptyHint}
                </TableCell>
              </TableRow>
            ) : (
              docs.map((doc) => <DocumentRow key={doc.id} doc={doc} />)
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DocumentRow({ doc }: { doc: ApiDocumentListItem }): JSX.Element {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [voidOpen, setVoidOpen] = React.useState(false);
  const lastActivity = lastActivityIso(doc);
  const lastActivityLabel = lastActivity ? absoluteLocalTime(lastActivity) : "—";
  const lastActivityRelative = lastActivity ? relativeTime(lastActivity) : undefined;

  const remindable = doc.status === "SENT" || doc.status === "VIEWED";
  // HIPAA + audit integrity: we never hard-delete a signed document. Void is
  // only offered for in-flight/DRAFT docs; after SIGNED/VOIDED/EXPIRED the
  // record is frozen so the audit trail stays authoritative.
  const voidable =
    doc.status === "DRAFT" ||
    doc.status === "SENT" ||
    doc.status === "VIEWED";

  const resend = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return resendDocument(token, doc.id);
    },
    onSuccess: () => {
      toast.success("Reminder sent", {
        description: doc.recipient?.email
          ? `Delivered to ${doc.recipient.email}`
          : undefined,
      });
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (err) => {
      toast.error("Could not send reminder", {
        description:
          err instanceof ApiError ? err.message : "Try again in a moment.",
      });
    },
  });

  const voidMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return voidDocument(token, doc.id);
    },
    onSuccess: () => {
      toast.success("Document voided");
      setVoidOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      void queryClient.invalidateQueries({ queryKey: ["document", doc.id] });
    },
    onError: (err) => {
      toast.error("Could not void document", {
        description:
          err instanceof ApiError ? err.message : "Try again in a moment.",
      });
    },
  });

  return (
    <TableRow className="group">
      <TableCell
        className={cn("pl-6 text-body-sm min-w-[280px]", STICKY_TITLE_CELL)}
        title={doc.title}
      >
        <Link
          href={`/dashboard/documents/${doc.id}`}
          className="text-foreground hover:text-primary flex items-center gap-2 font-medium underline-offset-4 hover:underline"
        >
          <FileText
            className="text-muted-foreground h-4 w-4 shrink-0"
            strokeWidth={1.75}
            aria-hidden
          />
          <span className="truncate">{doc.title}</span>
        </Link>
      </TableCell>
      <TableCell className="min-w-[200px]">
        {doc.recipient ? (
          <div className="flex min-w-0 items-center gap-2">
            <Avatar size="sm">
              <AvatarFallback>{initials(doc.recipient.name)}</AvatarFallback>
            </Avatar>
            <span
              className="text-body-sm text-foreground truncate"
              title={doc.recipient.name}
            >
              {doc.recipient.name}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground text-body-sm">—</span>
        )}
      </TableCell>
      <TableCell
        className="text-body-sm text-muted-foreground min-w-[240px]"
        title={doc.recipient?.email ?? undefined}
      >
        {doc.recipient ? (
          <a
            href={`mailto:${doc.recipient.email}`}
            className="hover:text-foreground truncate underline-offset-4 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {doc.recipient.email}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="min-w-[140px]">
        <StatusBadge status={doc.status} />
      </TableCell>
      <TableCell
        className="text-body-sm text-muted-foreground min-w-[220px] tabular-nums"
        title={lastActivityRelative}
      >
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {lastActivityLabel}
        </span>
      </TableCell>
      <TableCell className="pr-6 text-right min-w-[104px]">
        <div className="inline-flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                aria-label={`More actions for ${doc.title}`}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/documents/${doc.id}`}>
                  <ArrowUpRight aria-hidden strokeWidth={1.75} />
                  Open
                </Link>
              </DropdownMenuItem>
              {remindable ? (
                <DropdownMenuItem
                  onClick={() => resend.mutate()}
                  disabled={resend.isPending}
                >
                  <Mail aria-hidden strokeWidth={1.75} />
                  {resend.isPending ? "Sending…" : "Remind recipient"}
                </DropdownMenuItem>
              ) : null}
              {voidable ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setVoidOpen(true)}
                  >
                    <CircleSlash aria-hidden strokeWidth={1.75} />
                    Void document
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <Link
            href={`/dashboard/documents/${doc.id}`}
            className="text-muted-foreground group-hover:text-primary inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
            aria-label={`Open ${doc.title}`}
          >
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Void this document?</DialogTitle>
              <DialogDescription>
                Voiding invalidates the signing link and marks{" "}
                <span className="text-foreground font-medium">
                  {doc.title}
                </span>{" "}
                as voided. The audit trail is preserved for compliance, but no
                one will be able to sign it. This cannot be undone.
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
      </TableCell>
    </TableRow>
  );
}


function PaginationFooter({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (next: number) => void;
}): JSX.Element | null {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-body-sm text-muted-foreground tabular-nums">
        Showing {from}–{to} of {total}
      </p>
      <div className="inline-flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          <span className="ml-1 hidden sm:inline">Previous</span>
        </Button>
        <span className="text-body-sm text-muted-foreground px-2 tabular-nums">
          Page {page} of {totalPages}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <span className="mr-1 hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}


type ActivityItem = {
  id: string;
  documentId: string;
  title: string;
  actor: string;
  event: "signed" | "viewed" | "sent" | "created";
  timestamp: string;
};

const ACTIVITY_VISUAL: Record<
  ActivityItem["event"],
  { icon: typeof CheckCircle2; label: string; tone: string }
> = {
  signed: {
    icon: CheckCircle2,
    label: "signed",
    tone: "bg-success/10 text-success",
  },
  viewed: { icon: FileText, label: "viewed", tone: "bg-info/10 text-info" },
  sent: { icon: Send, label: "sent", tone: "bg-primary/10 text-primary" },
  created: {
    icon: FileText,
    label: "created",
    tone: "bg-muted text-muted-foreground",
  },
};

function ActivityCard({ items }: { items: ActivityItem[] }): JSX.Element {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-body text-foreground font-semibold">Activity</h3>
          <span className="text-caption text-muted-foreground">Last 5</span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <p className="text-body-sm text-muted-foreground py-4">
            Nothing yet. Send your first document to see activity here.
          </p>
        ) : (
          <ol className="space-y-4">
            {items.map((item) => {
              const visual = ACTIVITY_VISUAL[item.event];
              const Icon = visual.icon;
              return (
                <li key={item.id} className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      visual.tone
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm text-foreground">
                      <span className="font-medium">{item.actor}</span>{" "}
                      <span className="text-muted-foreground">
                        {visual.label}
                      </span>{" "}
                      <Link
                        href={`/dashboard/documents/${item.documentId}`}
                        className="hover:text-primary underline-offset-4 hover:underline"
                      >
                        {item.title}
                      </Link>
                    </p>
                    <time
                      dateTime={item.timestamp}
                      className="text-caption text-muted-foreground"
                      title={new Date(item.timestamp).toLocaleString()}
                    >
                      {relativeTime(item.timestamp)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function TemplatesCard(): JSX.Element {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <LayoutTemplate
            className="text-muted-foreground h-4 w-4"
            strokeWidth={2}
            aria-hidden
          />
          <h3 className="text-body text-foreground font-semibold">Templates</h3>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-body-sm text-muted-foreground">
          Save reusable forms once — send them in two clicks. Coming next.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled
          className="mt-3"
          aria-disabled
        >
          New template
        </Button>
      </CardContent>
    </Card>
  );
}


function CommandCenterSkeleton(): JSX.Element {
  return (
    <div className="space-y-8">
      <PageHeader />
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
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="shadow-sm">
          <CardContent className="space-y-3 py-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="space-y-3 py-4">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

function lastActivityIso(d: ApiDocumentListItem): string | null {
  return d.signedAt ?? d.sentAt ?? d.updatedAt ?? d.createdAt ?? null;
}

function matchesChip(d: ApiDocumentListItem, chip: ChipKey): boolean {
  const now = Date.now();
  if (chip === "opened") {
    return d.status === "VIEWED";
  }
  if (chip === "stale") {
    if (d.status !== "SENT" && d.status !== "VIEWED") return false;
    if (!d.sentAt) return false;
    return now - new Date(d.sentAt).getTime() > STALE_THRESHOLD_MS;
  }
  if (chip === "expires") {
    if (d.status !== "SENT" && d.status !== "VIEWED") return false;
    if (!d.expiresAt) return false;
    const until = new Date(d.expiresAt).getTime() - now;
    return until > 0 && until < EXPIRES_SOON_MS;
  }
  return true;
}

function computeKpis(docs: ApiDocumentListItem[]): Kpis {
  const now = Date.now();
  const thisWeekStart = now - 7 * MS_DAY;
  const prevWeekStart = now - 14 * MS_DAY;

  let drafts = 0;
  let out = 0;
  let signedThisWeek = 0;
  let signedPrevWeek = 0;
  let createdThisWeek = 0;
  let createdPrevWeek = 0;
  let sentThisWeek = 0;
  let sentPrevWeek = 0;
  let stale = 0;
  let staleYesterday = 0;

  const draftsBuckets = new Array<number>(7).fill(0);
  const outBuckets = new Array<number>(7).fill(0);
  const signedBuckets = new Array<number>(7).fill(0);

  for (const d of docs) {
    if (d.status === "DRAFT") drafts += 1;
    if (d.status === "SENT" || d.status === "VIEWED") out += 1;

    const createdMs = new Date(d.createdAt).getTime();
    const sentMs = d.sentAt ? new Date(d.sentAt).getTime() : null;
    const signedMs = d.signedAt ? new Date(d.signedAt).getTime() : null;

    if (createdMs >= thisWeekStart) createdThisWeek += 1;
    else if (createdMs >= prevWeekStart) createdPrevWeek += 1;

    if (sentMs !== null) {
      if (sentMs >= thisWeekStart) sentThisWeek += 1;
      else if (sentMs >= prevWeekStart) sentPrevWeek += 1;
    }

    if (signedMs !== null) {
      if (signedMs >= thisWeekStart) signedThisWeek += 1;
      else if (signedMs >= prevWeekStart) signedPrevWeek += 1;
    }

    if (d.status === "DRAFT") {
      bucketInto(draftsBuckets, createdMs, now);
    }
    if (sentMs !== null) {
      bucketInto(outBuckets, sentMs, now);
    }
    if (signedMs !== null) {
      bucketInto(signedBuckets, signedMs, now);
    }

    if (
      (d.status === "SENT" || d.status === "VIEWED") &&
      sentMs !== null &&
      now - sentMs > STALE_THRESHOLD_MS
    ) {
      stale += 1;
      if (now - sentMs > STALE_THRESHOLD_MS + MS_DAY) {
        staleYesterday += 1;
      }
    }
  }

  return {
    drafts: {
      value: drafts,
      helper:
        createdThisWeek === 0
          ? "No new drafts this week"
          : `${createdThisWeek} created this week`,
      delta: createdThisWeek - createdPrevWeek,
      sparkline: draftsBuckets,
    },
    out: {
      value: out,
      helper:
        sentThisWeek === 0
          ? "Nothing sent this week"
          : `${sentThisWeek} sent this week`,
      delta: sentThisWeek - sentPrevWeek,
      sparkline: outBuckets,
    },
    signed: {
      value: signedThisWeek,
      helper:
        signedThisWeek === 0
          ? "No completions this week"
          : "vs. previous 7 days",
      delta: signedThisWeek - signedPrevWeek,
      sparkline: signedBuckets,
    },
    stale: {
      value: stale,
      helper:
        stale === 0
          ? "Nothing stuck"
          : `${staleYesterday} stuck since yesterday`,
      delta: null,
      sparkline: null,
    },
  };
}

function bucketInto(buckets: number[], ts: number, now: number): void {
  const diffDays = Math.floor((now - ts) / MS_DAY);
  if (diffDays < 0 || diffDays > 6) return;
  // Index 0 = 6 days ago, index 6 = today (left-to-right chronological)
  const idx = 6 - diffDays;
  const current = buckets[idx] ?? 0;
  buckets[idx] = current + 1;
}

function computeAttention(docs: ApiDocumentListItem[]): AttentionItem[] {
  const now = Date.now();
  const items: Array<AttentionItem & { score: number }> = [];

  for (const d of docs) {
    // Expiring soon beats stale beats long-lived drafts.
    if (
      (d.status === "SENT" || d.status === "VIEWED") &&
      d.expiresAt !== null
    ) {
      const until = new Date(d.expiresAt).getTime() - now;
      if (until > 0 && until < EXPIRES_SOON_MS) {
        items.push({
          kind: "expiring",
          doc: d,
          detail: `Expires ${relativeTime(d.expiresAt)}`,
          score: 300 - until / MS_HOUR,
        });
        continue;
      }
    }
    if (
      (d.status === "SENT" || d.status === "VIEWED") &&
      d.sentAt !== null
    ) {
      const since = now - new Date(d.sentAt).getTime();
      if (since > STALE_THRESHOLD_MS) {
        items.push({
          kind: "stale",
          doc: d,
          detail: `Sent ${relativeTime(d.sentAt)}${d.recipient ? ` to ${d.recipient.name}` : ""}`,
          score: 200 + since / MS_HOUR,
        });
        continue;
      }
    }
    if (d.status === "DRAFT") {
      const age = now - new Date(d.createdAt).getTime();
      if (age > 3 * MS_DAY) {
        items.push({
          kind: "draft",
          doc: d,
          detail: `Drafted ${relativeTime(d.createdAt)}`,
          score: 100 + age / MS_DAY,
        });
      }
    }
  }

  items.sort((a, b) => b.score - a.score);
  return items.slice(0, 3).map(({ score: _score, ...rest }) => rest);
}

function computeActivity(docs: ApiDocumentListItem[]): ActivityItem[] {
  const events: ActivityItem[] = [];
  for (const d of docs) {
    const recipientName = d.recipient?.name ?? "Recipient";
    if (d.signedAt) {
      events.push({
        id: `${d.id}:signed`,
        documentId: d.id,
        title: d.title,
        actor: recipientName,
        event: "signed",
        timestamp: d.signedAt,
      });
    }
    if (d.sentAt) {
      events.push({
        id: `${d.id}:sent`,
        documentId: d.id,
        title: d.title,
        actor: "You",
        event: "sent",
        timestamp: d.sentAt,
      });
    }
    if (!d.sentAt && !d.signedAt) {
      events.push({
        id: `${d.id}:created`,
        documentId: d.id,
        title: d.title,
        actor: "You",
        event: "created",
        timestamp: d.createdAt,
      });
    }
  }
  events.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  return events.slice(0, 5);
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

// Mirrors formatAbsoluteLocal in document-activity-timeline.tsx so the grid
// and the audit timeline speak the same dialect: a fixed local datetime with
// an explicit timezone rather than a moving "X hours ago" target.
const ABSOLUTE_LOCAL_FMT = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZoneName: "short",
});

function absoluteLocalTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return ABSOLUTE_LOCAL_FMT.format(d);
}
