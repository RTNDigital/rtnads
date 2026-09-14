import { db } from "@/lib/db";
import {
  googleAdAccounts, campaigns, campaignInsights, syncLogs,
} from "@/lib/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { getCustomerClient } from "./client";

async function createSyncLog(accountId: string, syncType: "campaigns" | "insights") {
  const [log] = await db.insert(syncLogs).values({
    accountId,
    syncType,
    status: "running",
  }).returning();
  return log;
}

async function completeSyncLog(
  logId: string,
  itemsSynced: number,
  errors: { message: string; entity?: string }[],
) {
  await db.update(syncLogs).set({
    status: errors.length > 0 ? "failed" : "completed",
    itemsSynced,
    errors,
    completedAt: new Date(),
  }).where(eq(syncLogs.id, logId));
}

export async function incrementalCampaignSync(
  dbAccountId: string,
  customerId: string,
  clientId: string,
  refreshToken: string,
  managerCustomerId?: string | null,
): Promise<{ itemsSynced: number; errors: { message: string; entity?: string }[] }> {
  const log = await createSyncLog(dbAccountId, "campaigns");
  let itemsSynced = 0;
  const errors: { message: string; entity?: string }[] = [];

  try {
    const customer = getCustomerClient(
      customerId,
      refreshToken,
      managerCustomerId || undefined,
    );

    const googleCampaigns = await customer.query(`
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign.start_date,
        campaign.end_date,
        campaign_budget.amount_micros
      FROM campaign
      WHERE campaign.status != 'REMOVED'
      ORDER BY campaign.id
    `);

    for (const row of googleCampaigns) {
      const gc = row.campaign;
      if (!gc || !gc.id) continue;

      const statusStr = gc.status != null ? String(gc.status) : null;
      const isActive = statusStr === "ENABLED" || statusStr === "2";
      const budgetMicros = row.campaign_budget?.amount_micros;
      const dailyBudget = budgetMicros ? Math.round(Number(budgetMicros) / 1_000_000) : null;
      const channelType = gc.advertising_channel_type != null ? String(gc.advertising_channel_type) : null;

      await db.insert(campaigns).values({
        clientId,
        googleAdAccountId: dbAccountId,
        googleCampaignId: String(gc.id),
        platform: "google",
        name: gc.name || "Unnamed Campaign",
        objective: channelType,
        status: isActive ? "live" : "paused",
        metaStatus: statusStr,
        approvalStatus: isActive ? "live" : "paused",
        dailyBudget,
      }).onConflictDoUpdate({
        target: campaigns.googleCampaignId,
        set: {
          name: gc.name || "Unnamed Campaign",
          metaStatus: statusStr,
          dailyBudget,
          updatedAt: new Date(),
        },
      });
      itemsSynced++;
    }

    await db.update(googleAdAccounts)
      .set({ lastSyncedAt: new Date() })
      .where(eq(googleAdAccounts.id, dbAccountId));
  } catch (e: any) {
    errors.push({ message: e.message, entity: "google campaign sync" });
  }

  await completeSyncLog(log.id, itemsSynced, errors);
  return { itemsSynced, errors };
}

export async function incrementalInsightsSync(
  dbAccountId: string,
  customerId: string,
  refreshToken: string,
  managerCustomerId?: string | null,
): Promise<{ itemsSynced: number; errors: { message: string; entity?: string }[] }> {
  const log = await createSyncLog(dbAccountId, "insights");
  let itemsSynced = 0;
  const errors: { message: string; entity?: string }[] = [];

  try {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);

    const since = sevenDaysAgo.toISOString().split("T")[0];
    const until = today.toISOString().split("T")[0];

    const dbCampaigns = await db
      .select({ id: campaigns.id, googleCampaignId: campaigns.googleCampaignId })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.googleAdAccountId, dbAccountId),
          isNotNull(campaigns.googleCampaignId),
        ),
      );

    const customer = getCustomerClient(
      customerId,
      refreshToken,
      managerCustomerId || undefined,
    );

    for (const campaign of dbCampaigns) {
      try {
        const metrics = await customer.query(`
          SELECT
            segments.date,
            metrics.impressions,
            metrics.clicks,
            metrics.ctr,
            metrics.cost_micros,
            metrics.conversions,
            metrics.cost_per_conversion,
            metrics.average_cpc,
            metrics.average_cpm
          FROM campaign
          WHERE campaign.id = ${campaign.googleCampaignId}
            AND segments.date BETWEEN '${since}' AND '${until}'
        `);

        for (const row of metrics) {
          const m = row.metrics;
          const date = row.segments?.date;
          if (!m || !date) continue;

          const spend = m.cost_micros ? Number(m.cost_micros) / 1_000_000 : 0;
          const leads = m.conversions ? Math.round(Number(m.conversions)) : 0;
          const cpl = leads > 0 ? spend / leads : 0;

          await db
            .insert(campaignInsights)
            .values({
              campaignId: campaign.id,
              date: new Date(date),
              impressions: Number(m.impressions) || 0,
              clicks: Number(m.clicks) || 0,
              ctr: Number(m.ctr) || 0,
              reach: 0,
              spend,
              leads,
              cpl,
              cpc: m.average_cpc ? Number(m.average_cpc) / 1_000_000 : 0,
              cpm: m.average_cpm ? Number(m.average_cpm) / 1_000_000 : 0,
              frequency: 0,
            })
            .onConflictDoUpdate({
              target: [campaignInsights.campaignId, campaignInsights.date],
              set: {
                impressions: Number(m.impressions) || 0,
                clicks: Number(m.clicks) || 0,
                ctr: Number(m.ctr) || 0,
                spend,
                leads,
                cpl,
                cpc: m.average_cpc ? Number(m.average_cpc) / 1_000_000 : 0,
                cpm: m.average_cpm ? Number(m.average_cpm) / 1_000_000 : 0,
                updatedAt: new Date(),
              },
            });

          itemsSynced++;
        }
      } catch (e: any) {
        errors.push({
          message: e.message,
          entity: `insights for google campaign ${campaign.googleCampaignId}`,
        });
      }
    }
  } catch (e: any) {
    errors.push({ message: e.message, entity: "google insights sync" });
  }

  await completeSyncLog(log.id, itemsSynced, errors);
  return { itemsSynced, errors };
}
