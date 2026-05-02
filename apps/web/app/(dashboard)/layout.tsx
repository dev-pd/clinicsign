import type { Metadata } from "next";

import { getProductCopy } from "@/lib/product";

export async function generateMetadata(): Promise<Metadata> {
  const p = getProductCopy();
  const brand = p.brandName;
  return {
    title: {
      template: `%s · ${brand}`,
      default: `Dashboard · ${brand}`,
    },
  };
}

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): JSX.Element {
  return <>{children}</>;
}
