import { db } from "@/lib/db";
import { clients, clientOnboardingChecks } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OnboardingChecklist } from "./onboarding";
import { ONBOARDING_CHECKS } from "@/lib/constants/onboarding-checks";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.orgId, (session?.user as any)?.orgId)))
    .limit(1);

  if (!client) notFound();

  const checks = await db
    .select()
    .from(clientOnboardingChecks)
    .where(eq(clientOnboardingChecks.clientId, id));

  const passedCount = checks.filter((c) => c.status === "pass").length;
  const totalCount = checks.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{client.name}</h1>
          <div className="flex gap-2 mt-1">
            <Badge variant="outline" className="capitalize">{client.type}</Badge>
            <Badge
              className={
                client.onboardingStatus === "ready"
                  ? "bg-green-100 text-green-800"
                  : client.onboardingStatus === "in_progress"
                  ? "bg-blue-100 text-blue-800"
                  : "bg-yellow-100 text-yellow-800"
              }
            >
              {client.onboardingStatus === "ready"
                ? `Ready (${passedCount}/${totalCount})`
                : `${passedCount}/${totalCount} complete`}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Monthly Budget</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {client.monthlyBudget
                ? `${client.budgetCurrency} ${client.monthlyBudget.toLocaleString()}`
                : "Not set"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {(client.treatmentCategories as string[] || []).map((cat) => (
                <Badge key={cat} variant="secondary" className="capitalize">
                  {cat.replace("_", " ")}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Type</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold capitalize">{client.type}</p>
            {client.type === "agency" && (
              <p className="text-xs text-muted-foreground mt-1">Disclaimer required</p>
            )}
          </CardContent>
        </Card>
      </div>

      <OnboardingChecklist
        clientId={client.id}
        checks={checks}
        checkDefinitions={ONBOARDING_CHECKS}
      />
    </div>
  );
}
