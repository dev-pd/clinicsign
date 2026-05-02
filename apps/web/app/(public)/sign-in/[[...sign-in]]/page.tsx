import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";

import { clerkAppearance } from "@/lib/clerk-appearance";
import { getProductCopy } from "@/lib/product";

export async function generateMetadata(): Promise<Metadata> {
  const p = getProductCopy();
  return { title: p.auth.signInTitle };
}

export default function SignInPage(): JSX.Element {
  const p = getProductCopy();
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-h2 text-foreground">Welcome back</h1>
        <p className="text-body text-muted-foreground">
          Sign in to manage your documents and signing requests.
        </p>
      </div>

      <SignIn
        path="/sign-in"
        routing="path"
        signUpUrl="/sign-up"
        forceRedirectUrl="/dashboard"
        fallbackRedirectUrl="/dashboard"
        appearance={clerkAppearance}
      />

      <p className="text-body-sm text-muted-foreground text-center">
        {p.auth.signUpPrompt}{" "}
        <Link
          href="/sign-up"
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
