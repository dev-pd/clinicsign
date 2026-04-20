import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";

import { AppProviders } from "@/components/app-providers";
import { fonts } from "@/lib/fonts";

import "./globals.css";

/** Avoid static prerender without Clerk keys during `next build` in fresh checkouts. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ClinicSign",
  description: "HIPAA-aware document signing for medical practices",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className={fonts} suppressHydrationWarning>
        <body className="min-h-screen bg-background antialiased">
          <AppProviders>{children}</AppProviders>
        </body>
      </html>
    </ClerkProvider>
  );
}
