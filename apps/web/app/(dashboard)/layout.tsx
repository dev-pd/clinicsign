import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    template: "%s · ClinicSign",
    default: "Dashboard · ClinicSign",
  },
};

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): JSX.Element {
  return <>{children}</>;
}
