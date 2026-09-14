import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { campaigns, adSets, ads, creatives, metaAdAccounts } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq, inArray } from "drizzle-orm";
import { createCampaign as metaCreateCampaign } from "@/lib/meta/campaigns";
import { createAdSet as metaCreateAdSet } from "@/lib/meta/adsets";
import { createAd as metaCreateAd } from "@/lib/meta/ads";
import { createCreative as metaCreateCreative } from "@/lib/meta/creatives";
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

  const publishLog: { step: string; metaId?: string; error?: string }[] = [];

  try {
    // Step 1: Create campaign on Meta
    let metaCampaignId = campaign.metaCampaignId;
    if (!metaCampaignId) {
      metaCampaignId = await metaCreateCampaign(account.accountId, {
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

      publishLog.push({ step: "campaign", metaId: metaCampaignId });
    } else {
      publishLog.push({ step: "campaign", metaId: metaCampaignId });
    }

    // Step 2: Create ad sets
    const dbAdSets = await db.select().from(adSets).where(eq(adSets.campaignId, id));

    for (const adSet of dbAdSets) {
      if (adSet.metaAdsetId) {
        publishLog.push({ step: `adset:${adSet.name}`, metaId: adSet.metaAdsetId });
        continue;
      }

      try {
        const metaAdSetId = await metaCreateAdSet(account.accountId, {
          name: adSet.name,
          campaign_id: metaCampaignId,
          optimization_goal: adSet.optimizationGoal || "LEAD_GENERATION",
          billing_event: "IMPRESSIONS",
          bid_strategy: adSet.bidStrategy || "LOWEST_COST_WITHOUT_CAP",
          targeting: (adSet.targeting as Record<string, unknown>) || {},
          status: "PAUSED",
        });

        await db.update(adSets).set({
          metaAdsetId: metaAdSetId,
          status: "active",
          updatedAt: new Date(),
        }).where(eq(adSets.id, adSet.id));

        publishLog.push({ step: `adset:${adSet.name}`, metaId: metaAdSetId });

        // Step 3: Create ads for this ad set
        const dbAds = await db.select().from(ads).where(eq(ads.adSetId, adSet.id));

        for (const ad of dbAds) {
          if (ad.metaAdId) {
            publishLog.push({ step: `ad:${ad.id.slice(0, 8)}`, metaId: ad.metaAdId });
            continue;
          }

          try {
            let metaCreativeId: string | undefined;

            // Create creative on Meta if the ad has a local creative
            if (ad.creativeId) {
              const [creative] = await db.select().from(creatives)
                .where(eq(creatives.id, ad.creativeId)).limit(1);

              if (creative && !creative.metaCreativeId && account.pageId) {
                const creativePayload: any = {
                  name: `Creative for ${adSet.name}`,
                  object_story_spec: {
                    page_id: account.pageId,
                    link_data: creative.mediaUrl ? {
                      message: campaign.adCopy || campaign.name,
                      link: `https://example.com`,
                      name: campaign.headline || campaign.name,
                      description: campaign.description || "",
                      image_hash: undefined,
                      call_to_action: { type: "LEARN_MORE" },
                    } : undefined,
                  },
                };

                metaCreativeId = await metaCreateCreative(account.accountId, creativePayload);

                await db.update(creatives).set({
                  metaCreativeId,
                  syncedAt: new Date(),
                }).where(eq(creatives.id, creative.id));
              } else if (creative?.metaCreativeId) {
                metaCreativeId = creative.metaCreativeId;
              }
            }

            if (!metaCreativeId) {
              publishLog.push({
                step: `ad:${ad.id.slice(0, 8)}`,
                error: "No creative available",
              });
              continue;
            }

            const metaAdId = await metaCreateAd(account.accountId, {
              name: `Ad - ${adSet.name}`,
              adset_id: metaAdSetId,
              creative: { creative_id: metaCreativeId },
              status: "PAUSED",
            });

            await db.update(ads).set({
              metaAdId,
              status: "active",
              updatedAt: new Date(),
            }).where(eq(ads.id, ad.id));

            publishLog.push({ step: `ad:${ad.id.slice(0, 8)}`, metaId: metaAdId });
          } catch (e: any) {
            publishLog.push({
              step: `ad:${ad.id.slice(0, 8)}`,
              error: e instanceof MetaApiError ? mapMetaErrorToMessage(e.code) : e.message,
            });
          }
        }
      } catch (e: any) {
        publishLog.push({
          step: `adset:${adSet.name}`,
          error: e instanceof MetaApiError ? mapMetaErrorToMessage(e.code) : e.message,
        });
      }
    }

    return NextResponse.json({
      metaCampaignId,
      publishLog,
      hasErrors: publishLog.some((l) => l.error),
    });
  } catch (e) {
    if (e instanceof MetaApiError) {
      return NextResponse.json(
        { error: mapMetaErrorToMessage(e.code), code: e.code, publishLog },
        { status: 502 },
      );
    }
    throw e;
  }
}
