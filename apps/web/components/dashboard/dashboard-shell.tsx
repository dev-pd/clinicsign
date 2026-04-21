"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

type DashboardShellProps = {
  children: React.ReactNode;
};

export function DashboardShell({ children }: DashboardShellProps): JSX.Element {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-border flex h-14 items-center justify-between border-b px-4 md:px-8">
        <Link
          href="/dashboard"
          className="text-body font-medium tracking-tight text-foreground"
        >
          ClinicSign
        </Link>
        <UserButton afterSignOutUrl="/" />
      </header>
      <main className="mx-auto max-w-6xl p-4 md:p-8">{children}</main>
    </div>
  );
}
