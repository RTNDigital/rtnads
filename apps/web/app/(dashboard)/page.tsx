import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { clients, campaigns, leads, campaignInsights } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, desc, isNotNull } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCards } from "./components/stat-cards";
import { CampaignPerformanceTable } from "./components/campaign-performance-table";
import { LeadTrendChart } from "./components/lead-trend-chart";
import { CountryChart } from "./components/country-chart";
import { SpendTrendChart } from "./components/spend-trend-chart";
import { PeriodToggle } from "./components/period-toggle";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  const orgId = (session?.user as any)?.orgId as string;

  const params = await searchParams;
  const periodDays = params.period === "30" ? 30 : 7;

  const now = new Date();
  const periodStart = new Date(now);
  periodStart.setDate(now.getDate() - periodDays);
  const prevPeriodStart = new Date(periodStart);
  prevPeriodStart.setDate(periodStart.getDate() - periodDays);

  const orgFilter = eq(clients.orgId, orgId);

  const [
    [activeClientsResult],
    [liveCampaignsResult],
    [periodLeadsResult],
    [prevLeadsResult],
    [periodSpendResult],
    [prevSpendResult],
    [periodAvgResult],
    [prevAvgResult],
    campaignPerformance,
    leadTrend,
    spendTrend,
    countryDistribution,
  ] = await Promise.all([
    // Active clients
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(clients)
      .where(orgFilter),

    // Live campaigns
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaigns)
      .innerJoin(clients, eq(campaigns.clientId, clients.id))
      .where(and(orgFilter, eq(campaigns.metaStatus, "ACTIVE"))),

    // Period leads
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(leads)
      .innerJoin(clients, eq(leads.clientId, clients.id))
      .where(and(orgFilter, gte(leads.createdAt, periodStart))),

    // Previous period leads
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(leads)
      .innerJoin(clients, eq(leads.clientId, clients.id))
      .where(
        and(orgFilter, gte(leads.createdAt, prevPeriodStart), lte(leads.createdAt, periodStart)),
      ),

    // Period spend
    db
      .select({
        total: sql<number>`coalesce(sum(${campaignInsights.spend}), 0)::float`,
      })
      .from(campaignInsights)
      .innerJoin(campaigns, eq(campaignInsights.campaignId, campaigns.id))
      .innerJoin(clients, eq(campaigns.clientId, clients.id))
      .where(and(orgFilter, gte(campaignInsights.date, periodStart))),

    // Previous period spend
    db
      .select({
        total: sql<number>`coalesce(sum(${campaignInsights.spend}), 0)::float`,
      })
      .from(campaignInsights)
      .innerJoin(campaigns, eq(campaignInsights.campaignId, campaigns.id))
      .innerJoin(clients, eq(campaigns.clientId, clients.id))
      .where(
        and(orgFilter, gte(campaignInsights.date, prevPeriodStart), lte(campaignInsights.date, periodStart)),
      ),

    // Period avg CTR & CPL
    db
      .select({
        avgCtr: sql<number>`case when coalesce(sum(${campaignInsights.impressions}), 0) > 0 then (sum(${campaignInsights.clicks})::float / sum(${campaignInsights.impressions}) * 100) else 0 end`,
        avgCpl: sql<number>`case when coalesce(sum(${campaignInsights.leads}), 0) > 0 then (sum(${campaignInsights.spend})::float / sum(${campaignInsights.leads})) else 0 end`,
      })
      .from(campaignInsights)
      .innerJoin(campaigns, eq(campaignInsights.campaignId, campaigns.id))
      .innerJoin(clients, eq(campaigns.clientId, clients.id))
      .where(and(orgFilter, gte(campaignInsights.date, periodStart))),

    // Previous period avg CTR & CPL
    db
      .select({
        avgCtr: sql<number>`case when coalesce(sum(${campaignInsights.impressions}), 0) > 0 then (sum(${campaignInsights.clicks})::float / sum(${campaignInsights.impressions}) * 100) else 0 end`,
        avgCpl: sql<number>`case when coalesce(sum(${campaignInsights.leads}), 0) > 0 then (sum(${campaignInsights.spend})::float / sum(${campaignInsights.leads})) else 0 end`,
      })
      .from(campaignInsights)
      .innerJoin(campaigns, eq(campaignInsights.campaignId, campaigns.id))
      .innerJoin(clients, eq(campaigns.clientId, clients.id))
      .where(
        and(orgFilter, gte(campaignInsights.date, prevPeriodStart), lte(campaignInsights.date, periodStart)),
      ),

    // Campaign performance table
    db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        clientName: clients.name,
        status: campaigns.approvalStatus,
        impressions: sql<number>`coalesce(sum(${campaignInsights.impressions}), 0)::int`,
        clicks: sql<number>`coalesce(sum(${campaignInsights.clicks}), 0)::int`,
        ctr: sql<number>`case when coalesce(sum(${campaignInsights.impressions}), 0) > 0 then (coalesce(sum(${campaignInsights.clicks}), 0)::float / sum(${campaignInsights.impressions}) * 100) else 0 end`,
        leads: sql<number>`coalesce(sum(${campaignInsights.leads}), 0)::int`,
        cpl: sql<number>`case when coalesce(sum(${campaignInsights.leads}), 0) > 0 then (coalesce(sum(${campaignInsights.spend}), 0)::float / sum(${campaignInsights.leads})) else 0 end`,
        spend: sql<number>`coalesce(sum(${campaignInsights.spend}), 0)::float`,
      })
      .from(campaigns)
      .innerJoin(clients, eq(campaigns.clientId, clients.id))
      .leftJoin(
        campaignInsights,
        and(
          eq(campaignInsights.campaignId, campaigns.id),
          gte(campaignInsights.date, periodStart),
        ),
      )
      .where(orgFilter)
      .groupBy(campaigns.id, clients.name)
      .orderBy(desc(sql`coalesce(sum(${campaignInsights.spend}), 0)`)),

    // Lead trend
    db
      .select({
        date: sql<string>`to_char(${leads.createdAt}, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(leads)
      .innerJoin(clients, eq(leads.clientId, clients.id))
      .where(and(orgFilter, gte(leads.createdAt, periodStart)))
      .groupBy(sql`to_char(${leads.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${leads.createdAt}, 'YYYY-MM-DD')`),

    // Spend trend (daily)
    db
      .select({
        date: sql<string>`to_char(${campaignInsights.date}, 'YYYY-MM-DD')`,
        spend: sql<number>`coalesce(sum(${campaignInsights.spend}), 0)::float`,
      })
      .from(campaignInsights)
      .innerJoin(campaigns, eq(campaignInsights.campaignId, campaigns.id))
      .innerJoin(clients, eq(campaigns.clientId, clients.id))
      .where(and(orgFilter, gte(campaignInsights.date, periodStart)))
      .groupBy(sql`to_char(${campaignInsights.date}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${campaignInsights.date}, 'YYYY-MM-DD')`),

    // Country distribution
    db
      .select({
        country: leads.country,
        count: sql<number>`count(*)::int`,
      })
      .from(leads)
      .innerJoin(clients, eq(leads.clientId, clients.id))
      .where(and(orgFilter, isNotNull(leads.country)))
      .groupBy(leads.country)
      .orderBy(desc(sql`count(*)`))
      .limit(10),
  ]);

  const periodLabel = periodDays === 30 ? "Son 30 Gün" : "Son 7 Gün";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Suspense fallback={null}>
          <PeriodToggle />
        </Suspense>
      </div>

      <StatCards
        activeClients={activeClientsResult.count}
        liveCampaigns={liveCampaignsResult.count}
        periodLeads={periodLeadsResult.count}
        periodSpend={periodSpendResult.total}
        avgCtr={periodAvgResult.avgCtr}
        avgCpl={periodAvgResult.avgCpl}
        prevLeads={prevLeadsResult.count}
        prevSpend={prevSpendResult.total}
        prevCtr={prevAvgResult.avgCtr}
        prevCpl={prevAvgResult.avgCpl}
      />

      <Card>
        <CardHeader>
          <CardTitle>Kampanya Performansı ({periodLabel})</CardTitle>
        </CardHeader>
        <CardContent>
          <CampaignPerformanceTable campaigns={campaignPerformance} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Harcama Trendi ({periodLabel})</CardTitle>
          </CardHeader>
          <CardContent>
            <SpendTrendChart data={spendTrend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lead Trendi ({periodLabel})</CardTitle>
          </CardHeader>
          <CardContent>
            <LeadTrendChart data={leadTrend} emptyMessage={`${periodLabel}de lead verisi yok.`} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ülke Dağılımı</CardTitle>
        </CardHeader>
        <CardContent>
          <CountryChart
            data={countryDistribution.filter(
              (d): d is { country: string; count: number } => d.country !== null,
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
