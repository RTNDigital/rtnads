import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { campaigns, clients, metaAdAccounts } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { updateCampaignStatus } from "@/lib/meta/campaigns";
import type { UserRole } from "@rtnads/shared";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const orgId = (session.user as any).orgId as string;

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, id))
    .limit(1);

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, campaign.clientId), eq(clients.orgId, orgId)))
    .limit(1);

  if (!client) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();

  if (body.metaStatus === "ACTIVE" || body.metaStatus === "PAUSED") {
    const role = (session.user as any).role as UserRole;
    if (role !== "admin" && role !== "manager") {
      return NextResponse.json({ error: "Only admins and managers can change campaign status" }, { status: 403 });
    }
    if (!campaign.metaCampaignId) {
      return NextResponse.json({ error: "Campaign not published to Meta yet" }, { status: 400 });
    }
    if (!campaign.metaAdAccountId) {
      return NextResponse.json({ error: "No ad account linked" }, { status: 400 });
    }
    const [account] = await db.select().from(metaAdAccounts)
      .where(eq(metaAdAccounts.id, campaign.metaAdAccountId)).limit(1);
    if (!account) {
      return NextResponse.json({ error: "Ad account not found" }, { status: 404 });
    }
    await updateCampaignStatus(campaign.metaCampaignId, body.metaStatus, account.accountId);
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (body.name !== undefined) updateData.name = body.name;
  if (body.dailyBudget !== undefined) updateData.dailyBudget = body.dailyBudget;
  if (body.targetCountries !== undefined) updateData.targetCountries = body.targetCountries;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.treatmentCategory !== undefined) updateData.treatmentCategory = body.treatmentCategory;
  if (body.objective !== undefined) updateData.objective = body.objective;
  if (body.budgetCurrency !== undefined) updateData.budgetCurrency = body.budgetCurrency;
  if (body.headline !== undefined) updateData.headline = body.headline;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.adCopy !== undefined) updateData.adCopy = body.adCopy;
  if (body.metaStatus !== undefined) updateData.metaStatus = body.metaStatus;

  const [updated] = await db
    .update(campaigns)
    .set(updateData)
    .where(eq(campaigns.id, id))
    .returning();

  return NextResponse.json(updated);
}
