import { ArrowLeft, CheckCircle2, ShieldCheck, Timer } from "lucide-react";
import Link from "next/link";

import { Logomark } from "@/components/brand/logomark";

export default function PublicAuthLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="bg-background relative min-h-screen">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden lg:hidden"
      >
        <div className="bg-primary/10 absolute -left-20 top-0 h-80 w-80 rounded-full blur-3xl" />
      </div>

      <Link
        href="/"
        className="text-body-sm text-foreground/70 hover:text-foreground absolute left-6 top-6 z-20 inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors lg:left-auto lg:right-8 lg:top-8"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to home
      </Link>

      <div className="grid min-h-screen lg:grid-cols-2">
        <BrandPanel />
        <div className="flex items-center justify-center px-6 py-10 lg:px-12 lg:py-12">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
    </div>
  );
}

function BrandPanel(): JSX.Element {
  const bullets = [
    {
      icon: ShieldCheck,
      title: "HIPAA-aware by default",
      body: "Private VPC, KMS-encrypted storage, short-lived signing URLs.",
    },
    {
      icon: Timer,
      title: "Sent in seconds, signed in minutes",
      body: "Upload, drop fields, send. Your patient signs on any device.",
    },
    {
      icon: CheckCircle2,
      title: "One flattened PDF per signature",
      body: "No fragile overlays. A real, archivable signed document every time.",
    },
  ];

  return (
    <div className="bg-primary text-primary-foreground relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
      <BrandPanelBackdrop />

      <Link
        href="/"
        className="relative flex items-center gap-2.5"
      >
        <span className="bg-primary-foreground/15 flex h-9 w-9 items-center justify-center rounded-md">
          <Logomark className="h-6 w-6" />
        </span>
        <span className="text-h4 tracking-tight">ClinicSign</span>
      </Link>

      <div className="relative max-w-md space-y-7">
        <div className="space-y-4">
          <span className="border-primary-foreground/30 bg-primary-foreground/10 text-caption inline-flex items-center gap-2 rounded-full border px-3 py-1">
            <span className="bg-success inline-block h-1.5 w-1.5 rounded-full" />
            Trusted by forward-thinking clinics
          </span>
          <h2 className="text-h1 leading-tight">
            Sign medical forms in minutes,{" "}
            <span className="text-primary-foreground/80">not days.</span>
          </h2>
          <p className="text-body-lg text-primary-foreground/85">
            The calm, trustworthy alternative to bloated e-sign tools — built
            for medical practices that care about PHI.
          </p>
        </div>

        <ul className="space-y-5">
          {bullets.map((b) => (
            <li key={b.title} className="flex items-start gap-3">
              <span className="bg-primary-foreground/15 mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md">
                <b.icon className="h-5 w-5" strokeWidth={2} aria-hidden />
              </span>
              <div>
                <div className="text-body font-semibold">{b.title}</div>
                <div className="text-body-sm text-primary-foreground/80">
                  {b.body}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="text-caption text-primary-foreground/70 relative">
        © {new Date().getFullYear()} ClinicSign · HIPAA-aware document signing
      </div>
    </div>
  );
}

function BrandPanelBackdrop(): JSX.Element {
  return (
    <>
      <div
        aria-hidden
        className="bg-primary-foreground/10 pointer-events-none absolute -left-20 -top-20 h-96 w-96 rounded-full blur-3xl"
      />
      <div
        aria-hidden
        className="bg-primary-foreground/5 pointer-events-none absolute -bottom-28 -right-10 h-96 w-96 rounded-full blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.25]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, oklch(1 0 0 / 0.5) 1px, transparent 0)",
          backgroundSize: "28px 28px",
          maskImage:
            "radial-gradient(ellipse at center, black 0%, transparent 70%)",
        }}
      />
    </>
  );
}
