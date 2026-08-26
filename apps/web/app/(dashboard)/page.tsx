import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { clients, campaigns, leads, campaignInsights } from "@/lib/db/schema";
import { eq, and, gte, sql, desc, isNotNull } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCards } from "./components/stat-cards";
import { CampaignPerformanceTable } from "./components/campaign-performance-table";
import { LeadTrendChart } from "./components/lead-trend-chart";
import { CountryChart } from "./components/country-chart";

export default async function DashboardPage() {
  const session = await auth();
  const orgId = (session?.user as any)?.orgId as string;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);

  const [activeClientsResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(clients)
    .where(eq(clients.orgId, orgId));

  const [liveCampaignsResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(campaigns)
    .innerJoin(clients, eq(campaigns.clientId, clients.id))
    .where(and(eq(clients.orgId, orgId), eq(campaigns.metaStatus, "ACTIVE")));

  const [monthLeadsResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .innerJoin(clients, eq(leads.clientId, clients.id))
    .where(and(eq(clients.orgId, orgId), gte(leads.createdAt, monthStart)));

  const [monthSpendResult] = await db
    .select({ total: sql<number>`coalesce(sum(${campaignInsights.spend}), 0)::float` })
    .from(campaignInsights)
    .innerJoin(campaigns, eq(campaignInsights.campaignId, campaigns.id))
    .innerJoin(clients, eq(campaigns.clientId, clients.id))
    .where(and(eq(clients.orgId, orgId), gte(campaignInsights.date, monthStart)));

  const campaignPerformance = await db
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
        gte(campaignInsights.date, sevenDaysAgo),
      ),
    )
    .where(eq(clients.orgId, orgId))
    .groupBy(campaigns.id, clients.name)
    .orderBy(desc(sql`coalesce(sum(${campaignInsights.spend}), 0)`));

  const leadTrend = await db
    .select({
      date: sql<string>`to_char(${leads.createdAt}, 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(leads)
    .innerJoin(clients, eq(leads.clientId, clients.id))
    .where(and(eq(clients.orgId, orgId), gte(leads.createdAt, sevenDaysAgo)))
    .groupBy(sql`to_char(${leads.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${leads.createdAt}, 'YYYY-MM-DD')`);

  const countryDistribution = await db
    .select({
      country: leads.country,
      count: sql<number>`count(*)::int`,
    })
    .from(leads)
    .innerJoin(clients, eq(leads.clientId, clients.id))
    .where(and(eq(clients.orgId, orgId), isNotNull(leads.country)))
    .groupBy(leads.country)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <StatCards
        activeClients={activeClientsResult.count}
        liveCampaigns={liveCampaignsResult.count}
        monthLeads={monthLeadsResult.count}
        monthSpend={monthSpendResult.total}
      />

      <Card>
        <CardHeader>
          <CardTitle>Kampanya Performansı (Son 7 Gün)</CardTitle>
        </CardHeader>
        <CardContent>
          <CampaignPerformanceTable campaigns={campaignPerformance} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lead Trendi (Son 7 Gün)</CardTitle>
          </CardHeader>
          <CardContent>
            <LeadTrendChart data={leadTrend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ülke Dağılımı</CardTitle>
          </CardHeader>
          <CardContent>
            <CountryChart data={countryDistribution.filter((d): d is { country: string; count: number } => d.country !== null)} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
