import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { campaigns, metaAdAccounts } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { createCampaign as metaCreateCampaign } from "@/lib/meta/campaigns";
import { MetaApiError, mapMetaErrorToMessage } from "@/lib/meta/client";
import type { UserRole } from "@rtnads/shared";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as UserRole;
  if (role !== "admin" && role !== "manager") {
    return NextResponse.json({ error: "Only admins and managers can publish campaigns" }, { status: 403 });
  }

  const { id } = await params;
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!campaign.metaAdAccountId) return NextResponse.json({ error: "No ad account linked" }, { status: 400 });

  const [account] = await db.select().from(metaAdAccounts)
    .where(eq(metaAdAccounts.id, campaign.metaAdAccountId)).limit(1);
  if (!account) return NextResponse.json({ error: "Ad account not found" }, { status: 404 });

  try {
    const metaCampaignId = await metaCreateCampaign(account.accountId, {
      name: campaign.name,
      objective: campaign.objective || "OUTCOME_LEADS",
      status: "PAUSED",
      daily_budget: campaign.dailyBudget ? campaign.dailyBudget * 100 : undefined,
      lifetime_budget: campaign.lifetimeBudget ? campaign.lifetimeBudget * 100 : undefined,
      special_ad_categories: [],
      start_time: campaign.startDate?.toISOString(),
      stop_time: campaign.endDate?.toISOString(),
    });

    await db.update(campaigns).set({
      metaCampaignId,
      approvalStatus: "approved",
      approvedBy: session.user.id,
      approvedAt: new Date(),
      metaStatus: "PAUSED",
      updatedAt: new Date(),
    }).where(eq(campaigns.id, id));

    return NextResponse.json({ metaCampaignId });
  } catch (e) {
    if (e instanceof MetaApiError) {
      return NextResponse.json(
        { error: mapMetaErrorToMessage(e.code), code: e.code },
        { status: 502 },
      );
    }
    throw e;
  }
}
