import { SignedIn, SignedOut } from "@clerk/nextjs";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileSignature,
  Lock,
  MailCheck,
  PenLine,
  Send,
  ShieldCheck,
  Sparkles,
  Timer,
  Upload,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Logomark } from "@/components/brand/logomark";
import { Button } from "@/components/ui/button";
import type { ProductCopy } from "@/lib/product";
import { getProductCopy } from "@/lib/product";

const TRUST_ICONS = [Lock, ShieldCheck, MailCheck, Sparkles] as const;
const HOW_ICONS = [Upload, Send, FileSignature] as const;

const FEATURE_ICON_BY_TITLE: Record<
  string,
  typeof PenLine | typeof MailCheck | typeof FileSignature | typeof ClipboardList | typeof ShieldCheck | typeof Timer
> = {
  "Drag-to-place fields": PenLine,
  "Magic-link signing": MailCheck,
  "Flattened signed PDF": FileSignature,
  "Full audit trail": ClipboardList,
  "Private by default": ShieldCheck,
  "Fast enough to demo": Timer,
  "Fast to try": Timer,
};

export default function HomePage(): JSX.Element {
  const product = getProductCopy();
  return (
    <main className="bg-background text-foreground">
      <SiteNav product={product} />
      <Hero product={product} />
      <TrustBar product={product} />
      <HowItWorks product={product} />
      <FeatureGrid product={product} />
      <SecuritySection product={product} />
      <FinalCta product={product} />
      <SiteFooter product={product} />
    </main>
  );
}

function SiteNav({ product }: { product: ProductCopy }): JSX.Element {
  return (
    <header className="border-border/60 bg-background/80 sticky top-0 z-20 border-b backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 md:px-10">
        <Link href="/" className="flex items-center gap-2">
          <Logomark className="h-7 w-7" />
          <span className="text-h4 tracking-tight">{product.brandName}</span>
        </Link>
        <nav className="flex items-center gap-2">
          <SignedOut>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/sign-up">Get started</Link>
            </Button>
          </SignedOut>
          <SignedIn>
            <Button size="sm" asChild>
              <Link href="/dashboard">
                Go to dashboard
                <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </SignedIn>
        </nav>
      </div>
    </header>
  );
}

function Hero({ product }: { product: ProductCopy }): JSX.Element {
  const h = product.home;
  return (
    <section className="relative overflow-hidden">
      <BackgroundOrbs />
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:px-10 md:py-28 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16">
        <div className="space-y-7">
          <span className="border-border/70 bg-card text-caption text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 shadow-sm">
            <span className="bg-success inline-block h-1.5 w-1.5 rounded-full" />
            {h.heroEyebrow}
          </span>
          <h1 className="text-display text-foreground leading-tight">
            {h.heroTitleBeforeAccent}{" "}
            <span className="text-primary">{h.heroTitleAccent}</span>
          </h1>
          <p className="text-body-lg text-muted-foreground max-w-xl">
            {h.heroDescription}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <SignedOut>
              <Button size="lg" className="h-12 px-6 text-body" asChild>
                <Link href="/sign-up">
                  Start for free
                  <ArrowRight className="ml-2 h-5 w-5" aria-hidden />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 px-6 text-body"
                asChild
              >
                <Link href="/sign-in">I already have an account</Link>
              </Button>
            </SignedOut>
            <SignedIn>
              <Button size="lg" className="h-12 px-6 text-body" asChild>
                <Link href="/dashboard">
                  Open your dashboard
                  <ArrowRight className="ml-2 h-5 w-5" aria-hidden />
                </Link>
              </Button>
            </SignedIn>
          </div>
          <p className="text-body-sm text-muted-foreground">{h.heroFootnote}</p>
        </div>

        <div className="relative">
          <ProductIllustration product={product} />
        </div>
      </div>
    </section>
  );
}

function BackgroundOrbs(): JSX.Element {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div className="bg-primary/10 absolute -left-24 top-10 h-80 w-80 rounded-full blur-3xl" />
      <div className="bg-info/10 absolute -right-20 top-40 h-96 w-96 rounded-full blur-3xl" />
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, oklch(0.85 0.01 95) 1px, transparent 0)",
          backgroundSize: "28px 28px",
          maskImage:
            "radial-gradient(ellipse at top, black 0%, transparent 70%)",
        }}
      />
    </div>
  );
}

function ProductIllustration({
  product,
}: {
  product: ProductCopy;
}): JSX.Element {
  return (
    <div className="relative mx-auto w-full max-w-lg">
      <div
        aria-hidden
        className="bg-primary/10 absolute -inset-6 rounded-[28px] blur-2xl"
      />
      <div className="bg-card border-border relative overflow-hidden rounded-lg border shadow-lg">
        <div className="border-border/60 flex items-center gap-2 border-b px-5 py-3">
          <span className="bg-destructive/60 h-2.5 w-2.5 rounded-full" />
          <span className="bg-warning/60 h-2.5 w-2.5 rounded-full" />
          <span className="bg-success/60 h-2.5 w-2.5 rounded-full" />
          <span className="text-caption text-muted-foreground ml-3 truncate">
            Agreement · Sample recipient
          </span>
          <span className="bg-success/10 text-success border-success/20 text-micro ml-auto inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 font-medium tracking-wide uppercase">
            <span className="bg-success h-1.5 w-1.5 rounded-full" />
            Complete
          </span>
        </div>

        <div className="space-y-5 px-6 py-7">
          <div>
            <div className="text-h4 text-foreground">Sample document</div>
            <div className="text-body-sm text-muted-foreground mt-1">
              Please review and complete the fields below.
            </div>
          </div>

          <div className="space-y-2">
            <div className="bg-muted h-1.5 w-4/5 rounded-full" />
            <div className="bg-muted h-1.5 w-full rounded-full" />
            <div className="bg-muted h-1.5 w-3/4 rounded-full" />
          </div>

          <div className="grid grid-cols-[1fr_1fr] gap-4">
            <FilledField label="Full name" value="Jane Doe" icon="text" />
            <FilledField label="Date" value="Apr 21, 2026" icon="date" />
          </div>

          <div className="space-y-2">
            <div className="bg-muted h-1.5 w-3/5 rounded-full" />
            <div className="bg-muted h-1.5 w-11/12 rounded-full" />
            <div className="bg-muted h-1.5 w-2/3 rounded-full" />
          </div>

          <div>
            <div className="text-caption text-muted-foreground mb-1.5">
              Signature
            </div>
            <div className="border-primary/50 bg-primary/5 relative flex h-16 items-center justify-start rounded-md border px-4">
              <SignatureGlyph className="text-primary h-12" />
              <span className="bg-primary/10 text-primary text-micro absolute right-2 top-2 rounded-sm px-2 py-0.5 font-medium tracking-wide uppercase">
                Signed
              </span>
            </div>
          </div>

          <div className="border-border/50 flex items-center gap-2 border-t pt-4">
            <CheckCircle2
              className="text-success h-4 w-4"
              strokeWidth={2}
              aria-hidden
            />
            <span className="text-body-sm text-muted-foreground">
              {product.id === "clinic"
                ? "Flattened copy emailed to patient and provider"
                : "Flattened copy emailed to recipient and sender"}
            </span>
          </div>
        </div>
      </div>

      <FloatingBadge
        className="-left-4 top-8 rotate-[-4deg]"
        icon={<Timer className="text-info h-4 w-4" strokeWidth={2} aria-hidden />}
        label="2 min to sign"
      />
      <FloatingBadge
        className="-right-2 bottom-16 rotate-[3deg]"
        icon={
          <ShieldCheck
            className="text-primary h-4 w-4"
            strokeWidth={2}
            aria-hidden
          />
        }
        label="Encrypted · Audited"
      />
    </div>
  );
}

function FilledField({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: "text" | "date";
}): JSX.Element {
  return (
    <div>
      <div className="text-caption text-muted-foreground mb-1.5">{label}</div>
      <div className="border-primary/40 bg-primary/5 flex h-10 items-center gap-2 rounded-md border px-3">
        {icon === "text" ? (
          <PenLine className="text-primary h-4 w-4" aria-hidden />
        ) : (
          <ClipboardList className="text-primary h-4 w-4" aria-hidden />
        )}
        <span className="text-body-sm text-foreground truncate">{value}</span>
      </div>
    </div>
  );
}

function FloatingBadge({
  className = "",
  icon,
  label,
}: {
  className?: string;
  icon: React.ReactNode;
  label: string;
}): JSX.Element {
  return (
    <div
      className={`absolute ${className} bg-card border-border flex items-center gap-2 rounded-full border px-3 py-1.5 shadow-md`}
    >
      {icon}
      <span className="text-caption text-foreground">{label}</span>
    </div>
  );
}

function SignatureGlyph({ className = "" }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 240 60"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M6 42 C 22 10, 38 10, 44 30 S 60 54, 72 40 74 20 60 22 54 42 70 46 96 30 112 20 122 36 108 48 84 46 76 30 Q 132 12, 176 20 T 230 20"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function TrustBar({ product }: { product: ProductCopy }): JSX.Element {
  const items = product.home.trustBarItems.map((label, i) => ({
    icon: TRUST_ICONS[i] ?? Lock,
    label,
  }));
  return (
    <section className="border-border/60 border-y bg-secondary/30">
      <div className="mx-auto grid max-w-6xl gap-4 px-6 py-6 sm:grid-cols-2 md:px-10 lg:grid-cols-4">
        {items.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="text-body-sm text-muted-foreground flex items-center gap-2.5"
          >
            <Icon
              className="text-primary h-4 w-4 shrink-0"
              strokeWidth={2}
              aria-hidden
            />
            {label}
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks({ product }: { product: ProductCopy }): JSX.Element {
  const h = product.home;
  const steps = h.howItWorksSteps.map((s, i) => ({
    ...s,
    icon: HOW_ICONS[i] ?? Upload,
  }));
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 md:px-10">
      <SectionHeader
        eyebrow={h.howItWorksEyebrow}
        title={h.howItWorksTitle}
        subtitle={h.howItWorksSubtitle}
      />
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {steps.map((s, i) => (
          <div
            key={s.title}
            className="bg-card border-border relative rounded-lg border p-8 shadow-sm"
          >
            <div className="text-micro text-muted-foreground absolute right-5 top-5 font-semibold tracking-wide">
              {String(i + 1).padStart(2, "0")}
            </div>
            <div className="bg-primary/10 text-primary inline-flex h-12 w-12 items-center justify-center rounded-full">
              <s.icon className="h-6 w-6" strokeWidth={2} aria-hidden />
            </div>
            <h3 className="text-h3 text-foreground mt-5">{s.title}</h3>
            <p className="text-body text-muted-foreground mt-2">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FeatureGrid({ product }: { product: ProductCopy }): JSX.Element {
  const h = product.home;
  const features = h.featureCards.map((f) => {
    const Icon = FEATURE_ICON_BY_TITLE[f.title] ?? PenLine;
    return { ...f, icon: Icon };
  });
  return (
    <section className="bg-secondary/30 border-border/60 border-y">
      <div className="mx-auto max-w-6xl px-6 py-24 md:px-10">
        <SectionHeader
          eyebrow={h.featureEyebrow}
          title={h.featureTitle}
          subtitle={h.featureSubtitle}
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-card border-border hover:border-primary/40 rounded-lg border p-6 shadow-sm transition-colors"
            >
              <div className="bg-primary/10 text-primary inline-flex h-10 w-10 items-center justify-center rounded-md">
                <f.icon className="h-5 w-5" strokeWidth={2} aria-hidden />
              </div>
              <h3 className="text-h4 text-foreground mt-4">{f.title}</h3>
              <p className="text-body text-muted-foreground mt-2 leading-relaxed">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SecuritySection({ product }: { product: ProductCopy }): JSX.Element {
  const h = product.home;
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 md:px-10">
      <div className="bg-card border-border grid gap-10 rounded-lg border p-8 shadow-sm md:p-12 lg:grid-cols-[1fr_1.25fr] lg:items-center">
        <div>
          <div className="bg-primary/10 text-primary inline-flex items-center gap-2 rounded-full px-3 py-1">
            <ShieldCheck className="h-4 w-4" strokeWidth={2} aria-hidden />
            <span className="text-caption font-medium">{h.securityBadge}</span>
          </div>
          <h2 className="text-h1 text-foreground mt-5">
            {h.securityH2Lead}{" "}
            <span className="text-primary">{h.securityH2Accent}</span>
          </h2>
          <p className="text-body-lg text-muted-foreground mt-4">
            {h.securityIntro}
          </p>
        </div>
        <ul className="space-y-3">
          {h.securityBullets.map((b) => (
            <li
              key={b}
              className="border-border/70 flex items-start gap-3 rounded-md border px-4 py-3"
            >
              <CheckCircle2
                className="text-primary mt-0.5 h-5 w-5 shrink-0"
                strokeWidth={2}
                aria-hidden
              />
              <span className="text-body text-foreground">{b}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function FinalCta({ product }: { product: ProductCopy }): JSX.Element {
  const h = product.home;
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 md:px-10">
      <div className="bg-primary text-primary-foreground relative overflow-hidden rounded-2xl px-8 py-14 md:px-12 md:py-16">
        <div className="bg-primary-foreground/15 pointer-events-none absolute -left-16 -top-14 h-72 w-72 rounded-full blur-3xl" />
        <div className="bg-primary-foreground/10 pointer-events-none absolute -bottom-16 -right-12 h-72 w-72 rounded-full blur-3xl" />

        <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2 className="text-h1">{h.finalCtaTitle}</h2>
            <p className="text-body-lg text-primary-foreground/85 mt-3">
              {h.finalCtaBody}
            </p>
          </div>
          <div>
            <SignedOut>
              <Link
                href="/sign-up"
                className="bg-background text-primary hover:bg-background/90 inline-flex h-12 items-center justify-center gap-2 rounded-md px-6 text-body font-medium shadow-sm transition-colors"
              >
                Create your account
                <ArrowRight className="h-5 w-5" aria-hidden />
              </Link>
            </SignedOut>
            <SignedIn>
              <Link
                href="/dashboard"
                className="bg-background text-primary hover:bg-background/90 inline-flex h-12 items-center justify-center gap-2 rounded-md px-6 text-body font-medium shadow-sm transition-colors"
              >
                Open dashboard
                <ArrowRight className="h-5 w-5" aria-hidden />
              </Link>
            </SignedIn>
          </div>
        </div>
      </div>
    </section>
  );
}

function SiteFooter({ product }: { product: ProductCopy }): JSX.Element {
  const year = new Date().getFullYear();
  return (
    <footer className="border-border/60 border-t">
      <div className="text-body-sm text-muted-foreground mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 md:flex-row md:items-center md:justify-between md:px-10">
        <div className="flex items-center gap-2">
          <Logomark className="h-5 w-5" />
          <span className="text-foreground">{product.brandName}</span>
          <span>· {product.home.footerDescriptor}</span>
        </div>
        <span>
          © {year} {product.brandName}
        </span>
      </div>
    </footer>
  );
}

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}): JSX.Element {
  return (
    <div className="max-w-2xl">
      <div className="text-primary text-micro font-semibold tracking-wide uppercase">
        {eyebrow}
      </div>
      <h2 className="text-h1 text-foreground mt-3">{title}</h2>
      <p className="text-body-lg text-muted-foreground mt-3">{subtitle}</p>
    </div>
  );
}
