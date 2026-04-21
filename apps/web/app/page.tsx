import { SignedIn, SignedOut } from "@clerk/nextjs";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function HomePage(): JSX.Element {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="max-w-md text-center">
        <h1 className="text-display text-foreground">ClinicSign</h1>
        <p className="mt-4 text-body text-muted-foreground">
          HIPAA-aware document signing for medical practices. Sign in with Google
          to manage documents, or use a signing link sent by your provider.
        </p>
      </div>
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <SignedOut>
          <Button size="lg" asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/sign-up">Create account</Link>
          </Button>
        </SignedOut>
        <SignedIn>
          <Button size="lg" asChild>
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </SignedIn>
      </div>
    </main>
  );
}
