"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

import { cn } from "@/lib/utils";

type DashboardShellProps = {
  children: React.ReactNode;
};

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <Link
      href={href}
      className={cn(
        "text-body text-muted-foreground hover:text-foreground",
        "rounded-md px-2 py-1 transition-colors"
      )}
    >
      {children}
    </Link>
  );
}

export function DashboardShell({ children }: DashboardShellProps): JSX.Element {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-border flex h-14 flex-wrap items-center justify-between gap-4 border-b px-4 md:px-8">
        <div className="flex flex-wrap items-center gap-4 md:gap-8">
          <Link
            href="/dashboard"
            className="text-body font-medium tracking-tight text-foreground"
          >
            ClinicSign
          </Link>
          <nav className="flex items-center gap-4" aria-label="Dashboard">
            <NavLink href="/dashboard">Documents</NavLink>
            <NavLink href="/dashboard/documents/new">New document</NavLink>
          </nav>
        </div>
        <UserButton afterSignOutUrl="/" />
      </header>
      <main className="mx-auto max-w-6xl p-4 md:p-8">{children}</main>
    </div>
  );
}
