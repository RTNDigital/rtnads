import { tool } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { campaigns, clients, adSets, ads } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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
  };
}
