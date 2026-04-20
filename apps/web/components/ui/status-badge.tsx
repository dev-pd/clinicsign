/**
 * StatusBadge
 * Renders a colored pill for document status, matching the design system.
 * Every status badge across the app uses this component. Do not build
 * custom status indicators elsewhere.
 */

import { cn } from "@/lib/utils";
import type { DocumentStatus } from "@clinicsign/shared-types";

interface StatusBadgeProps {
  status: DocumentStatus;
  className?: string;
}

const STATUS_STYLES: Record<
  DocumentStatus,
  { label: string; container: string; dot: string }
> = {
  DRAFT: {
    label: "Draft",
    container: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/50",
  },
  SENT: {
    label: "Sent",
    container: "bg-info/10 text-info",
    dot: "bg-info",
  },
  VIEWED: {
    label: "Viewed",
    container: "bg-info/15 text-info",
    dot: "bg-info",
  },
  SIGNED: {
    label: "Signed",
    container: "bg-success/10 text-success",
    dot: "bg-success",
  },
  EXPIRED: {
    label: "Expired",
    container: "bg-warning/10 text-warning-foreground",
    dot: "bg-warning",
  },
  VOIDED: {
    label: "Voided",
    container: "bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps): JSX.Element {
  const styles = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-0.5 text-caption font-medium",
        styles.container,
        className
      )}
      aria-label={`Status: ${styles.label}`}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full", styles.dot)}
        aria-hidden="true"
      />
      {styles.label}
    </span>
  );
}
