import { db } from "@/lib/db";
import {
  alerts, clients, campaigns, campaignInsights, metaAdAccounts,
} from "@/lib/db/schema";
import { eq, and, gte, sql, isNotNull } from "drizzle-orm";

const DEDUPE_HOURS = 24;

async function hasRecentAlert(
  orgId: string,
  clientId: string,
  type: string,
  campaignId?: string,
): Promise<boolean> {
  const since = new Date();
  since.setHours(since.getHours() - DEDUPE_HOURS);

  const conditions = [
    eq(alerts.orgId, orgId),
    eq(alerts.clientId, clientId),
    eq(alerts.type, type as any),
    gte(alerts.createdAt, since),
  ];
  if (campaignId) {
    conditions.push(eq(alerts.campaignId, campaignId));
  }

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(alerts)
    .where(and(...conditions));

  return result.count > 0;
}

async function createAlert(data: {
  orgId: string;
  clientId: string;
  campaignId?: string;
  type: "budget_warning" | "budget_exceeded" | "cpl_exceeded" | "campaign_paused" | "campaign_error";
  severity: "warning" | "critical";
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const isDuplicate = await hasRecentAlert(data.orgId, data.clientId, data.type, data.campaignId);
  if (isDuplicate) return;

  await db.insert(alerts).values({
    orgId: data.orgId,
    clientId: data.clientId,
    campaignId: data.campaignId,
    type: data.type,
    severity: data.severity,
    message: data.message,
    metadata: data.metadata || {},
  });
}

export async function evaluateAlerts(dbAccountId: string): Promise<number> {
  let alertCount = 0;

  const [account] = await db
    .select()
    .from(metaAdAccounts)
    .where(eq(metaAdAccounts.id, dbAccountId))
    .limit(1);
  if (!account) return 0;

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, account.clientId))
    .limit(1);
  if (!client) return 0;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // --- Budget check ---
  if (client.monthlyBudget && client.monthlyBudget > 0) {
    const [spendResult] = await db
      .select({
        total: sql<number>`coalesce(sum(${campaignInsights.spend}), 0)::float`,
      })
      .from(campaignInsights)
      .innerJoin(campaigns, eq(campaignInsights.campaignId, campaigns.id))
      .where(
        and(
          eq(campaigns.clientId, client.id),
          gte(campaignInsights.date, monthStart),
        ),
      );

    const totalSpend = spendResult.total;
    const budget = client.monthlyBudget;
    const ratio = totalSpend / budget;

    if (ratio >= 1) {
      await createAlert({
        orgId: client.orgId,
        clientId: client.id,
        type: "budget_exceeded",
        severity: "critical",
        message: `${client.name}: Aylık bütçe aşıldı ($${totalSpend.toFixed(0)} / $${budget})`,
        metadata: { totalSpend, budget, ratio },
      });
      alertCount++;
    } else if (ratio >= 0.8) {
      await createAlert({
        orgId: client.orgId,
        clientId: client.id,
        type: "budget_warning",
        severity: "warning",
        message: `${client.name}: Aylık bütçenin %${Math.round(ratio * 100)}'i harcandı ($${totalSpend.toFixed(0)} / $${budget})`,
        metadata: { totalSpend, budget, ratio },
      });
      alertCount++;
    }
  }

  // --- CPL spike check ---
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(now.getDate() - 14);

  const clientCampaigns = await db
    .select({ id: campaigns.id, name: campaigns.name })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.clientId, client.id),
        isNotNull(campaigns.metaCampaignId),
      ),
    );

  for (const campaign of clientCampaigns) {
    const [currentCpl] = await db
      .select({
        cpl: sql<number>`case when coalesce(sum(${campaignInsights.leads}), 0) > 0 then sum(${campaignInsights.spend})::float / sum(${campaignInsights.leads}) else 0 end`,
        leads: sql<number>`coalesce(sum(${campaignInsights.leads}), 0)::int`,
      })
      .from(campaignInsights)
      .where(
        and(
          eq(campaignInsights.campaignId, campaign.id),
          gte(campaignInsights.date, sevenDaysAgo),
        ),
      );

    const [prevCpl] = await db
      .select({
        cpl: sql<number>`case when coalesce(sum(${campaignInsights.leads}), 0) > 0 then sum(${campaignInsights.spend})::float / sum(${campaignInsights.leads}) else 0 end`,
        leads: sql<number>`coalesce(sum(${campaignInsights.leads}), 0)::int`,
      })
      .from(campaignInsights)
      .where(
        and(
          eq(campaignInsights.campaignId, campaign.id),
          gte(campaignInsights.date, fourteenDaysAgo),
          sql`${campaignInsights.date} < ${sevenDaysAgo}`,
        ),
      );

    if (currentCpl.leads > 0 && prevCpl.leads > 0 && prevCpl.cpl > 0) {
      const spikeRatio = currentCpl.cpl / prevCpl.cpl;
      if (spikeRatio >= 1.5) {
        await createAlert({
          orgId: client.orgId,
          clientId: client.id,
          campaignId: campaign.id,
          type: "cpl_exceeded",
          severity: "warning",
          message: `${campaign.name}: CPL %${Math.round((spikeRatio - 1) * 100)} arttı ($${currentCpl.cpl.toFixed(2)} vs $${prevCpl.cpl.toFixed(2)})`,
          metadata: { currentCpl: currentCpl.cpl, prevCpl: prevCpl.cpl, spikeRatio },
        });
        alertCount++;
      }
    }
  }

  // --- Campaign status change check ---
  const pausedCampaigns = await db
    .select({ id: campaigns.id, name: campaigns.name, metaStatus: campaigns.metaStatus })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.clientId, client.id),
        isNotNull(campaigns.metaCampaignId),
        sql`${campaigns.metaStatus} IN ('PAUSED', 'WITH_ISSUES', 'ERROR')`,
        eq(campaigns.approvalStatus, "live"),
      ),
    );

  for (const campaign of pausedCampaigns) {
    const type = campaign.metaStatus === "PAUSED" ? "campaign_paused" as const : "campaign_error" as const;
    const severity = campaign.metaStatus === "PAUSED" ? "warning" as const : "critical" as const;

    await createAlert({
      orgId: client.orgId,
      clientId: client.id,
      campaignId: campaign.id,
      type,
      severity,
      message: `${campaign.name}: Kampanya ${campaign.metaStatus} durumunda (onaylı ama aktif değil)`,
      metadata: { metaStatus: campaign.metaStatus },
    });
    alertCount++;
  }

  return alertCount;
}
