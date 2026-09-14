import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { clients, campaigns, campaignInsights } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportFilters } from "./components/report-filters";
import { ReportSummary } from "./components/report-summary";
import { ReportBreakdownTable } from "./components/report-breakdown-table";
import { ReportCampaignTable } from "./components/report-campaign-table";
import { ReportCharts } from "./components/report-charts";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  const orgId = (session?.user as any)?.orgId as string;

  const orgClients = await db
    .select({ id: clients.id, name: clients.name, monthlyBudget: clients.monthlyBudget })
    .from(clients)
    .where(eq(clients.orgId, orgId))
    .orderBy(clients.name);

  if (orgClients.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Raporlar</h1>
        <p className="text-muted-foreground">Henüz müşteri eklenmemiş.</p>
      </div>
    );
  }

  const params = await searchParams;
  const selectedClientId =
    typeof params.clientId === "string" && orgClients.some((c) => c.id === params.clientId)
      ? params.clientId
      : orgClients[0].id;
  const periodParam = typeof params.period === "string" ? params.period : "7";

  const now = new Date();
  let periodStart: Date;
  let periodLabel: string;

  if (periodParam === "month") {
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    periodLabel = now.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
  } else {
    const days = periodParam === "30" ? 30 : 7;
    periodStart = new Date(now);
    periodStart.setDate(now.getDate() - days);
    periodLabel = days === 30 ? "Son 30 Gün" : "Son 7 Gün";
  }

  const selectedClient = orgClients.find((c) => c.id === selectedClientId)!;
  const clientCampaignFilter = and(
    eq(campaigns.clientId, selectedClientId),
    gte(campaignInsights.date, periodStart),
  );

  const [
    [summaryResult],
    dailyBreakdown,
    campaignBreakdown,
    chartData,
  ] = await Promise.all([
    db
      .select({
        totalSpend: sql<number>`coalesce(sum(${campaignInsights.spend}), 0)::float`,
        totalImpressions: sql<number>`coalesce(sum(${campaignInsights.impressions}), 0)::int`,
        totalClicks: sql<number>`coalesce(sum(${campaignInsights.clicks}), 0)::int`,
        totalLeads: sql<number>`coalesce(sum(${campaignInsights.leads}), 0)::int`,
        avgCtr: sql<number>`case when coalesce(sum(${campaignInsights.impressions}), 0) > 0 then (sum(${campaignInsights.clicks})::float / sum(${campaignInsights.impressions}) * 100) else 0 end`,
        avgCpl: sql<number>`case when coalesce(sum(${campaignInsights.leads}), 0) > 0 then (sum(${campaignInsights.spend})::float / sum(${campaignInsights.leads})) else 0 end`,
      })
      .from(campaignInsights)
      .innerJoin(campaigns, eq(campaignInsights.campaignId, campaigns.id))
      .where(clientCampaignFilter),

    db
      .select({
        date: sql<string>`to_char(${campaignInsights.date}, 'YYYY-MM-DD')`,
        spend: sql<number>`coalesce(sum(${campaignInsights.spend}), 0)::float`,
        impressions: sql<number>`coalesce(sum(${campaignInsights.impressions}), 0)::int`,
        clicks: sql<number>`coalesce(sum(${campaignInsights.clicks}), 0)::int`,
        ctr: sql<number>`case when coalesce(sum(${campaignInsights.impressions}), 0) > 0 then (sum(${campaignInsights.clicks})::float / sum(${campaignInsights.impressions}) * 100) else 0 end`,
        leads: sql<number>`coalesce(sum(${campaignInsights.leads}), 0)::int`,
        cpl: sql<number>`case when coalesce(sum(${campaignInsights.leads}), 0) > 0 then (sum(${campaignInsights.spend})::float / sum(${campaignInsights.leads})) else 0 end`,
        cpc: sql<number>`case when coalesce(sum(${campaignInsights.clicks}), 0) > 0 then (sum(${campaignInsights.spend})::float / sum(${campaignInsights.clicks})) else 0 end`,
      })
      .from(campaignInsights)
      .innerJoin(campaigns, eq(campaignInsights.campaignId, campaigns.id))
      .where(clientCampaignFilter)
      .groupBy(sql`to_char(${campaignInsights.date}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${campaignInsights.date}, 'YYYY-MM-DD')`),

    db
      .select({
        name: campaigns.name,
        spend: sql<number>`coalesce(sum(${campaignInsights.spend}), 0)::float`,
        impressions: sql<number>`coalesce(sum(${campaignInsights.impressions}), 0)::int`,
        clicks: sql<number>`coalesce(sum(${campaignInsights.clicks}), 0)::int`,
        leads: sql<number>`coalesce(sum(${campaignInsights.leads}), 0)::int`,
        ctr: sql<number>`case when coalesce(sum(${campaignInsights.impressions}), 0) > 0 then (sum(${campaignInsights.clicks})::float / sum(${campaignInsights.impressions}) * 100) else 0 end`,
        cpl: sql<number>`case when coalesce(sum(${campaignInsights.leads}), 0) > 0 then (sum(${campaignInsights.spend})::float / sum(${campaignInsights.leads})) else 0 end`,
      })
      .from(campaignInsights)
      .innerJoin(campaigns, eq(campaignInsights.campaignId, campaigns.id))
      .where(clientCampaignFilter)
      .groupBy(campaigns.id, campaigns.name)
      .orderBy(desc(sql`coalesce(sum(${campaignInsights.spend}), 0)`)),

    db
      .select({
        date: sql<string>`to_char(${campaignInsights.date}, 'YYYY-MM-DD')`,
        spend: sql<number>`coalesce(sum(${campaignInsights.spend}), 0)::float`,
        leads: sql<number>`coalesce(sum(${campaignInsights.leads}), 0)::int`,
      })
      .from(campaignInsights)
      .innerJoin(campaigns, eq(campaignInsights.campaignId, campaigns.id))
      .where(clientCampaignFilter)
      .groupBy(sql`to_char(${campaignInsights.date}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${campaignInsights.date}, 'YYYY-MM-DD')`),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Raporlar</h1>
      </div>

      {/* Print header — only visible when printing */}
      <div className="hidden print:block">
        <h2 className="text-xl font-bold">{selectedClient.name} — Performans Raporu</h2>
        <p className="text-sm text-muted-foreground">
          {periodLabel} | Oluşturulma: {now.toLocaleDateString("tr-TR")}
        </p>
      </div>

      <Suspense fallback={null}>
        <ReportFilters
          clients={orgClients.map((c) => ({ id: c.id, name: c.name }))}
          selectedClientId={selectedClientId}
          selectedPeriod={periodParam}
        />
      </Suspense>

      <ReportSummary
        totalSpend={summaryResult.totalSpend}
        monthlyBudget={selectedClient.monthlyBudget}
        totalImpressions={summaryResult.totalImpressions}
        totalClicks={summaryResult.totalClicks}
        totalLeads={summaryResult.totalLeads}
        avgCtr={summaryResult.avgCtr}
        avgCpl={summaryResult.avgCpl}
      />

      <Card>
        <CardHeader>
          <CardTitle>Harcama & Lead Trendi</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportCharts data={chartData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Günlük Detay</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportBreakdownTable data={dailyBreakdown} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kampanya Bazlı Özet</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportCampaignTable data={campaignBreakdown} />
        </CardContent>
      </Card>
    </div>
  );
}
