/**
 * EmptyState
 * Consistent empty state across the app. Use whenever a list, table, or
 * feed has no data. Never show a raw "No results" message.
 */

import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: EmptyStateAction;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps): JSX.Element {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-16 text-center",
        className
      )}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-accent">
        <Icon className="h-7 w-7 text-accent-foreground" aria-hidden="true" />
      </div>
      <h3 className="text-h4 text-foreground">{title}</h3>
      <p className="mt-2 max-w-sm text-body text-muted-foreground">
        {description}
      </p>
      {action ? (
        <div className="mt-6">
          {action.href ? (
            <Button asChild>
              <a href={action.href}>{action.label}</a>
            </Button>
          ) : (
            <Button onClick={action.onClick}>{action.label}</Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
