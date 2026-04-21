"use client";

import * as React from "react";
import { UserButton } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Logomark } from "@/components/brand/logomark";
import { cn } from "@/lib/utils";

type DashboardShellProps = {
  children: React.ReactNode;
};

const DASHBOARD_HREF = "/dashboard";
const NEW_DOC_HREF = "/dashboard/documents/new";

function NavLink({
  href,
  children,
  onSameHref,
}: {
  href: string;
  children: React.ReactNode;
  onSameHref?: () => void;
}): JSX.Element {
  const pathname = usePathname() ?? "";
  const isActive =
    href === DASHBOARD_HREF
      ? pathname === DASHBOARD_HREF
      : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "text-body-sm rounded-md px-3 py-1.5 font-medium transition-colors",
        isActive
          ? "bg-accent/60 text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
      )}
      onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
        if (pathname !== href) return;
        e.preventDefault();
        onSameHref?.();
      }}
    >
      {children}
    </Link>
  );
}

export function DashboardShell({ children }: DashboardShellProps): JSX.Element {
  const queryClient = useQueryClient();
  const router = useRouter();

  function refreshDocumentsList(): void {
    void queryClient.invalidateQueries({ queryKey: ["documents"] });
    router.refresh();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function remountNewDocumentRoute(): void {
    window.location.reload();
  }

  return (
    <div className="bg-background min-h-screen">
      <header className="border-border bg-background/90 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 md:px-8">
          <div className="flex items-center gap-6">
            <Link
              href={DASHBOARD_HREF}
              className="flex items-center gap-2"
              aria-label="ClinicSign — go to dashboard"
            >
              <Logomark className="h-7 w-7" />
              <span className="text-h4 text-foreground hidden tracking-tight sm:inline">
                ClinicSign
              </span>
            </Link>
            <nav
              className="flex items-center gap-1"
              aria-label="Dashboard navigation"
            >
              <NavLink
                href={DASHBOARD_HREF}
                onSameHref={refreshDocumentsList}
              >
                Documents
              </NavLink>
              <NavLink href={NEW_DOC_HREF} onSameHref={remountNewDocumentRoute}>
                New document
              </NavLink>
            </nav>
          </div>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
        {children}
      </main>
    </div>
  );
}
