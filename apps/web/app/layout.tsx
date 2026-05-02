import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";

import { AppProviders } from "@/components/app-providers";
import { fonts } from "@/lib/fonts";
import { getProductCopy } from "@/lib/product";

import "./globals.css";

/** Avoid static prerender without Clerk keys during `next build` in fresh checkouts. */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const p = getProductCopy();
  return {
    title: p.meta.defaultTitle,
    description: p.meta.description,
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={fonts} suppressHydrationWarning>
      <body className="min-h-screen bg-background antialiased">
        <ClerkProvider>
          <AppProviders>{children}</AppProviders>
        </ClerkProvider>
      </body>
    </html>
  );
}
