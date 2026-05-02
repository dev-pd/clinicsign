import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";

import { clerkAppearance } from "@/lib/clerk-appearance";
import { getProductCopy } from "@/lib/product";

export async function generateMetadata(): Promise<Metadata> {
  const p = getProductCopy();
  return { title: p.auth.signUpTitle };
}

export default function SignUpPage(): JSX.Element {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-h2 text-foreground">Create your account</h1>
        <p className="text-body text-muted-foreground">
          Start sending signing requests in under a minute. No credit card
          required.
        </p>
      </div>

      <SignUp
        path="/sign-up"
        routing="path"
        signInUrl="/sign-in"
        forceRedirectUrl="/dashboard"
        fallbackRedirectUrl="/dashboard"
        appearance={clerkAppearance}
      />

      <p className="text-body-sm text-muted-foreground text-center">
        Already have an account?{" "}
        <Link
          href="/sign-in"
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
