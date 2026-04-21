"use client";

import { UserButton } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

type DashboardShellProps = {
  children: React.ReactNode;
};

const DASHBOARD_HREF = "/dashboard";
const NEW_DOC_HREF = "/dashboard/documents/new";

function NavLink({
  href,
  children,
  className,
  onSameHref,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  onSameHref?: () => void;
}): JSX.Element {
  const pathname = usePathname() ?? "";

  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        if (pathname !== href) {
          return;
        }
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
    <div className="min-h-screen bg-background">
      <header className="border-border flex h-14 flex-wrap items-center justify-between gap-4 border-b px-4 md:px-8">
        <div className="flex flex-wrap items-center gap-4 md:gap-8">
          <NavLink
            href={DASHBOARD_HREF}
            className="text-body font-medium tracking-tight text-foreground"
            onSameHref={refreshDocumentsList}
          >
            ClinicSign
          </NavLink>
          <nav className="flex items-center gap-4" aria-label="Dashboard">
            <NavLink
              href={DASHBOARD_HREF}
              className={cn(
                "text-body text-muted-foreground hover:text-foreground",
                "rounded-md px-2 py-1 transition-colors"
              )}
              onSameHref={refreshDocumentsList}
            >
              Documents
            </NavLink>
            <NavLink
              href={NEW_DOC_HREF}
              className={cn(
                "text-body text-muted-foreground hover:text-foreground",
                "rounded-md px-2 py-1 transition-colors"
              )}
              onSameHref={remountNewDocumentRoute}
            >
              New document
            </NavLink>
          </nav>
        </div>
        <UserButton afterSignOutUrl="/" />
      </header>
      <main className="mx-auto max-w-6xl p-4 md:p-8">{children}</main>
    </div>
  );
}
