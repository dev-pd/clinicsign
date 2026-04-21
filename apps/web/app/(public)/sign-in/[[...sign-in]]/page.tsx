import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sign in · ClinicSign",
};

export default function SignInPage(): JSX.Element {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <SignIn
        path="/sign-in"
        routing="path"
        signUpUrl="/sign-up"
        forceRedirectUrl="/dashboard"
        fallbackRedirectUrl="/dashboard"
      />
      <Link
        href="/"
        className="text-body text-muted-foreground underline-offset-4 hover:underline"
      >
        Back to home
      </Link>
    </main>
  );
}
