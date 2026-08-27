import { tool } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { campaigns, clients, adSets, ads, campaignInsights, metaAdAccounts } from "@/lib/db/schema";
import { eq, and, gte, sql, desc } from "drizzle-orm";

export function createCampaignQueryTools(orgId: string) {
  return {
    getCampaignList: tool({
      description: "Get list of campaigns for the current organization. Can filter by client or status.",
      inputSchema: z.object({
        clientId: z.string().optional().describe("Filter by client ID"),
        status: z.string().optional().describe("Filter by status: draft, active, paused, completed"),
      }),
      execute: async ({ clientId, status }) => {
        const orgClients = await db.select({ id: clients.id }).from(clients).where(eq(clients.orgId, orgId));
        const orgClientIds = orgClients.map((c) => c.id);

        let allCampaigns = await db.select().from(campaigns);
        allCampaigns = allCampaigns.filter((c) => orgClientIds.includes(c.clientId));

        if (clientId) {
          allCampaigns = allCampaigns.filter((c) => c.clientId === clientId);
        }
        if (status) {
          allCampaigns = allCampaigns.filter((c) => c.status === status);
        }

        return allCampaigns.map((c) => ({
          id: c.id,
          name: c.name,
          clientId: c.clientId,
          status: c.status,
          treatmentCategory: c.treatmentCategory,
          targetCountries: c.targetCountries,
          dailyBudget: c.dailyBudget,
          budgetCurrency: c.budgetCurrency,
          approvalStatus: c.approvalStatus,
          createdAt: c.createdAt,
        }));
      },
    }),

    getCampaignDetails: tool({
      description: "Get detailed information about a specific campaign including its ad sets and ads.",
      inputSchema: z.object({
        campaignId: z.string().describe("The campaign UUID"),
      }),
      execute: async ({ campaignId }) => {
        const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
        if (!campaign) return { error: "Campaign not found" };

        const orgClients = await db.select({ id: clients.id }).from(clients).where(eq(clients.orgId, orgId));
        if (!orgClients.some((c) => c.id === campaign.clientId)) {
          return { error: "Campaign not found" };
        }

        const campaignAdSets = await db.select().from(adSets).where(eq(adSets.campaignId, campaignId));
        const adSetIds = campaignAdSets.map((a) => a.id);

        let campaignAds: (typeof ads.$inferSelect)[] = [];
        for (const adSetId of adSetIds) {
          const setAds = await db.select().from(ads).where(eq(ads.adSetId, adSetId));
          campaignAds.push(...setAds);
        }

        return {
          ...campaign,
          adSets: campaignAdSets,
          ads: campaignAds,
        };
      },
    }),

    getCampaignInsights: tool({
      description: "Get performance insights for a campaign. Returns daily metrics like impressions, clicks, CTR, leads, CPL, spend. Use to analyze campaign performance and make optimization recommendations.",
      inputSchema: z.object({
        campaignId: z.string().describe("Campaign UUID"),
        days: z.number().optional().default(7).describe("Number of days to look back (default 7)"),
      }),
      execute: async ({ campaignId, days }) => {
        const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
        if (!campaign) return { error: "Campaign not found" };

        const orgClients = await db.select({ id: clients.id }).from(clients).where(eq(clients.orgId, orgId));
        if (!orgClients.some((c) => c.id === campaign.clientId)) {
          return { error: "Campaign not found" };
        }

        const since = new Date();
        since.setDate(since.getDate() - days);

        const daily = await db
          .select()
          .from(campaignInsights)
          .where(and(eq(campaignInsights.campaignId, campaignId), gte(campaignInsights.date, since)))
          .orderBy(desc(campaignInsights.date));

        const [totals] = await db
          .select({
            impressions: sql<number>`coalesce(sum(${campaignInsights.impressions}), 0)::int`,
            clicks: sql<number>`coalesce(sum(${campaignInsights.clicks}), 0)::int`,
            leads: sql<number>`coalesce(sum(${campaignInsights.leads}), 0)::int`,
            spend: sql<number>`coalesce(sum(${campaignInsights.spend}), 0)::float`,
          })
          .from(campaignInsights)
          .where(and(eq(campaignInsights.campaignId, campaignId), gte(campaignInsights.date, since)));

        const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions * 100) : 0;
        const cpl = totals.leads > 0 ? totals.spend / totals.leads : 0;

        return {
          campaignName: campaign.name,
          period: `${days} days`,
          summary: { ...totals, ctr: +ctr.toFixed(2), cpl: +cpl.toFixed(2) },
          daily: daily.map((d) => ({
            date: d.date.toISOString().split("T")[0],
            impressions: d.impressions,
            clicks: d.clicks,
            leads: d.leads,
            spend: d.spend,
            ctr: d.ctr,
            cpl: d.cpl,
          })),
        };
      },
    }),

    getClientDetails: tool({
      description: "Get detailed information about a client including their ad accounts and active campaigns.",
      inputSchema: z.object({
        clientId: z.string().describe("Client UUID"),
      }),
      execute: async ({ clientId }) => {
        const [client] = await db
          .select()
          .from(clients)
          .where(and(eq(clients.id, clientId), eq(clients.orgId, orgId)))
          .limit(1);

        if (!client) return { error: "Client not found" };

        const adAccounts = await db
          .select()
          .from(metaAdAccounts)
          .where(eq(metaAdAccounts.clientId, clientId));

        const clientCampaigns = await db
          .select({
            id: campaigns.id,
            name: campaigns.name,
            status: campaigns.approvalStatus,
            metaStatus: campaigns.metaStatus,
            treatmentCategory: campaigns.treatmentCategory,
            dailyBudget: campaigns.dailyBudget,
            budgetCurrency: campaigns.budgetCurrency,
          })
          .from(campaigns)
          .where(eq(campaigns.clientId, clientId));

        return {
          ...client,
          adAccounts: adAccounts.map((a) => ({
            id: a.id,
            accountId: a.accountId,
            name: a.name,
            status: a.status,
          })),
          campaigns: clientCampaigns,
          activeCampaigns: clientCampaigns.filter((c) => c.metaStatus === "ACTIVE").length,
          totalDailyBudget: clientCampaigns.reduce((sum, c) => sum + (c.dailyBudget ?? 0), 0),
        };
      },
    }),
  };
}
