import { auth } from "@clerk/nextjs/server";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerApiBaseUrl } from "@/lib/server-api";

type MeResponse = {
  user: {
    id: string;
    name: string;
    email: string;
    clinic: { name: string };
  };
};

export default async function DashboardPage(): Promise<JSX.Element> {
  const { getToken } = await auth();
  const token = await getToken();
  const res = await fetch(`${getServerApiBaseUrl()}/api/me`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  if (res.ok) {
    const data = (await res.json()) as MeResponse;
    return (
      <DashboardShell>
        <Card>
          <CardHeader>
            <CardTitle>Welcome, {data.user.name}</CardTitle>
          </CardHeader>
          <CardContent className="text-body text-muted-foreground">
            <p>{data.user.clinic.name}</p>
            <p className="mt-2">{data.user.email}</p>
          </CardContent>
        </Card>
      </DashboardShell>
    );
  }

  if (res.status === 404) {
    return (
      <DashboardShell>
        <Card className="border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/40">
          <CardHeader>
            <CardTitle>Syncing your account</CardTitle>
          </CardHeader>
          <CardContent className="text-body text-muted-foreground">
            <p>
              Your Clerk session is active, but your ClinicSign profile is not in our database yet.
              For new signups this is usually the Clerk webhook creating your clinic — confirm the
              Clerk webhook endpoint reaches{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">POST /api/webhooks/clerk</code>{" "}
              and retry in a moment.
            </p>
          </CardContent>
        </Card>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <Card>
        <CardContent className="text-body text-destructive pt-6">
          Could not load your profile (HTTP {res.status}). Try again shortly.
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
