import { auth } from "@clerk/nextjs/server";

import { DocumentsCommandCenter } from "@/components/dashboard/documents-command-center";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProductCopy } from "@/lib/product";
import { getServerApiBaseUrl } from "@/lib/server-api";

type MeResponse = {
  user: {
    id: string;
    name: string;
    email: string;
    organization: { id: string; name: string };
  };
};

export default async function DashboardPage(): Promise<JSX.Element> {
  const product = getProductCopy();
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
        <DocumentsCommandCenter
          welcome={{
            name: data.user.name,
            organizationName: data.user.organization.name,
          }}
        />
      </DashboardShell>
    );
  }

  if (res.status === 404) {
    return (
      <DashboardShell>
        <Card className="border-warning/40 bg-warning/10">
          <CardHeader>
            <CardTitle>{product.dashboard.syncCardTitle}</CardTitle>
          </CardHeader>
          <CardContent className="text-body text-muted-foreground">
            <p>
              {product.dashboard.syncCardBodyBeforeWebhook}{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                POST /api/webhooks/clerk
              </code>{" "}
              {product.dashboard.syncCardBodyAfterWebhook}
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
