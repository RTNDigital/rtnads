import { db } from "@/lib/db";
import {
  metaAdAccounts, campaigns, adSets, ads,
  leadForms, creatives, syncLogs,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { listCampaigns } from "./campaigns";
import { listAdSets } from "./adsets";
import { listAds } from "./ads";
import { getCreatives } from "./creatives";
import { listLeadForms } from "./lead-forms";
import { getInsights } from "./insights";
import type { SyncType } from "@rtnads/shared";

async function createSyncLog(accountId: string, syncType: SyncType) {
  const [log] = await db.insert(syncLogs).values({
    accountId,
    syncType,
    status: "running",
  }).returning();
  return log;
}

async function completeSyncLog(logId: string, itemsSynced: number, errors: { message: string; entity?: string }[]) {
  await db.update(syncLogs).set({
    status: errors.length > 0 ? "failed" : "completed",
    itemsSynced,
    errors,
    completedAt: new Date(),
  }).where(eq(syncLogs.id, logId));
}

export async function fullSync(
  dbAccountId: string,
  metaAccountId: string,
  pageId: string | null,
  clientId: string,
): Promise<{ itemsSynced: number; errors: { message: string; entity?: string }[] }> {
  const log = await createSyncLog(dbAccountId, "full");
  let itemsSynced = 0;
  const errors: { message: string; entity?: string }[] = [];

  try {
    const metaCampaigns = await listCampaigns(metaAccountId);
    for (const mc of metaCampaigns) {
      await db.insert(campaigns).values({
        clientId,
        metaAdAccountId: dbAccountId,
        metaCampaignId: mc.id,
        name: mc.name,
        objective: mc.objective,
        status: mc.effective_status === "ACTIVE" ? "live" : "paused",
        metaStatus: mc.effective_status,
        approvalStatus: mc.effective_status === "ACTIVE" ? "live" : "paused",
        dailyBudget: mc.daily_budget ? Math.round(parseInt(mc.daily_budget) / 100) : null,
        lifetimeBudget: mc.lifetime_budget ? Math.round(parseInt(mc.lifetime_budget) / 100) : null,
        startDate: mc.start_time ? new Date(mc.start_time) : null,
        endDate: mc.stop_time ? new Date(mc.stop_time) : null,
      }).onConflictDoUpdate({
        target: campaigns.metaCampaignId,
        set: {
          name: mc.name,
          metaStatus: mc.effective_status,
          dailyBudget: mc.daily_budget ? Math.round(parseInt(mc.daily_budget) / 100) : null,
          updatedAt: new Date(),
        },
      });
      itemsSynced++;

      try {
        const metaAdSets = await listAdSets(mc.id, metaAccountId);
        for (const mas of metaAdSets) {
          const [parentCampaign] = await db.select({ id: campaigns.id })
            .from(campaigns)
            .where(eq(campaigns.metaCampaignId, mc.id))
            .limit(1);
          if (!parentCampaign) continue;

          await db.insert(adSets).values({
            campaignId: parentCampaign.id,
            metaAdsetId: mas.id,
            name: mas.name,
            targeting: mas.targeting,
            optimizationGoal: mas.optimization_goal,
            bidStrategy: mas.bid_strategy,
            status: mas.effective_status === "ACTIVE" ? "active" : "paused",
          }).onConflictDoUpdate({
            target: adSets.metaAdsetId,
            set: {
              name: mas.name,
              targeting: mas.targeting,
              status: mas.effective_status === "ACTIVE" ? "active" : "paused",
              updatedAt: new Date(),
            },
          });
          itemsSynced++;

          try {
            const metaAds = await listAds(mas.id, metaAccountId);
            for (const ma of metaAds) {
              const [parentAdSet] = await db.select({ id: adSets.id })
                .from(adSets)
                .where(eq(adSets.metaAdsetId, mas.id))
                .limit(1);
              if (!parentAdSet) continue;

              await db.insert(ads).values({
                adSetId: parentAdSet.id,
                metaAdId: ma.id,
                status: ma.effective_status === "ACTIVE" ? "active" : "paused",
              }).onConflictDoUpdate({
                target: ads.metaAdId,
                set: {
                  status: ma.effective_status === "ACTIVE" ? "active" : "paused",
                  updatedAt: new Date(),
                },
              });
              itemsSynced++;
            }
          } catch (e: any) {
            errors.push({ message: e.message, entity: `ads for adset ${mas.id}` });
          }
        }
      } catch (e: any) {
        errors.push({ message: e.message, entity: `adsets for campaign ${mc.id}` });
      }
    }

    if (pageId) {
      try {
        const metaForms = await listLeadForms(pageId);
        for (const mf of metaForms) {
          await db.insert(leadForms).values({
            clientId,
            metaFormId: mf.id,
            name: mf.name,
            locale: mf.locale || "en",
          }).onConflictDoUpdate({
            target: leadForms.metaFormId,
            set: { name: mf.name, locale: mf.locale || "en" },
          });
          itemsSynced++;
        }
      } catch (e: any) {
        errors.push({ message: e.message, entity: "lead forms" });
      }
    }

    try {
      const metaCreatives = await getCreatives(metaAccountId);
      for (const mc of metaCreatives) {
        await db.insert(creatives).values({
          sourceAdAccountId: dbAccountId,
          metaCreativeId: mc.id,
          type: mc.video_id ? "video" : "image",
          thumbnailUrl: mc.thumbnail_url,
          mediaUrl: mc.image_url,
          syncedAt: new Date(),
        }).onConflictDoUpdate({
          target: creatives.metaCreativeId,
          set: { thumbnailUrl: mc.thumbnail_url, syncedAt: new Date() },
        });
        itemsSynced++;
      }
    } catch (e: any) {
      errors.push({ message: e.message, entity: "creatives" });
    }

    await db.update(metaAdAccounts).set({ lastSyncedAt: new Date() }).where(eq(metaAdAccounts.id, dbAccountId));
  } catch (e: any) {
    errors.push({ message: e.message, entity: "full sync" });
  }

  await completeSyncLog(log.id, itemsSynced, errors);
  return { itemsSynced, errors };
}

export async function incrementalCampaignSync(
  dbAccountId: string,
  metaAccountId: string,
  clientId: string,
): Promise<{ itemsSynced: number; errors: { message: string; entity?: string }[] }> {
  const log = await createSyncLog(dbAccountId, "campaigns");
  let itemsSynced = 0;
  const errors: { message: string; entity?: string }[] = [];

  try {
    const [account] = await db.select({ lastSyncedAt: metaAdAccounts.lastSyncedAt })
      .from(metaAdAccounts)
      .where(eq(metaAdAccounts.id, dbAccountId))
      .limit(1);

    const filters: { updated_since?: string } = {};
    if (account?.lastSyncedAt) {
      filters.updated_since = Math.floor(account.lastSyncedAt.getTime() / 1000).toString();
    }

    const metaCampaigns = await listCampaigns(metaAccountId, filters);
    for (const mc of metaCampaigns) {
      await db.insert(campaigns).values({
        clientId,
        metaAdAccountId: dbAccountId,
        metaCampaignId: mc.id,
        name: mc.name,
        objective: mc.objective,
        status: mc.effective_status === "ACTIVE" ? "live" : "paused",
        metaStatus: mc.effective_status,
        approvalStatus: mc.effective_status === "ACTIVE" ? "live" : "paused",
      }).onConflictDoUpdate({
        target: campaigns.metaCampaignId,
        set: {
          name: mc.name,
          metaStatus: mc.effective_status,
          updatedAt: new Date(),
        },
      });
      itemsSynced++;
    }

    await db.update(metaAdAccounts).set({ lastSyncedAt: new Date() }).where(eq(metaAdAccounts.id, dbAccountId));
  } catch (e: any) {
    errors.push({ message: e.message, entity: "incremental campaign sync" });
  }

  await completeSyncLog(log.id, itemsSynced, errors);
  return { itemsSynced, errors };
}

export async function incrementalInsightsSync(
  dbAccountId: string,
  metaAccountId: string,
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

    const insights = await getInsights(
      `act_${metaAccountId}`,
      { level: "campaign", dateRange: { since, until }, timeIncrement: 1 },
      metaAccountId,
    );

    // TODO: `creativePerformance` rows are keyed by `creativeId`, but these insights
    // are fetched at the campaign level, so there is no creative to attach them to.
    // Persisting requires switching this fetch to level: "ad" and mapping each
    // insight to its creative via the `ads` table (ad -> creativeId). Until that
    // mapping is implemented, we only count the fetched insights here and do not
    // persist them, so the sync log accurately reflects that the operation ran
    // without silently dropping data into the wrong shape.
    itemsSynced = insights.length;
  } catch (e: any) {
    errors.push({ message: e.message, entity: "insights sync" });
  }

  await completeSyncLog(log.id, itemsSynced, errors);
  return { itemsSynced, errors };
}
