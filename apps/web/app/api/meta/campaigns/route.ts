import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { campaigns, metaAdAccounts, clients } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { createCampaign as metaCreateCampaign, updateCampaignStatus } from "@/lib/meta/campaigns";
import { checkCampaignPolicies } from "@/lib/meta/policy-checker";
import { MetaApiError, mapMetaErrorToMessage } from "@/lib/meta/client";
import type { UserRole } from "@rtnads/shared";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = (session.user as any).orgId;
  const allCampaigns = await db
    .select()
    .from(campaigns)
    .leftJoin(metaAdAccounts, eq(campaigns.metaAdAccountId, metaAdAccounts.id))
    .innerJoin(clients, eq(campaigns.clientId, clients.id))
    .where(eq(clients.orgId, orgId));

  return NextResponse.json(allCampaigns);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  const [client] = await db.select().from(clients).where(eq(clients.id, body.clientId)).limit(1);
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const policyResults = await checkCampaignPolicies({
    adCopy: body.adCopy,
    headline: body.headline,
    description: body.description,
    targetCountries: body.targetCountries || [],
    adFormat: body.adFormat,
    leadFormQuestions: body.leadFormQuestions,
    hasWhatsAppField: body.hasWhatsAppField,
    hasDisclaimer: body.hasDisclaimer,
  }, client.type as any);

  const blockers = policyResults.filter((r) => r.level === "blocker");
  if (blockers.length > 0) {
    return NextResponse.json({ error: "Policy check failed", blockers }, { status: 422 });
  }

  const [campaign] = await db.insert(campaigns).values({
    clientId: body.clientId,
    metaAdAccountId: body.metaAdAccountId,
    name: body.name,
    campaignType: body.campaignType || "standard",
    objective: body.objective,
    treatmentCategory: body.treatmentCategory,
    targetCountries: body.targetCountries || [],
    dailyBudget: body.dailyBudget,
    lifetimeBudget: body.lifetimeBudget,
    budgetCurrency: body.budgetCurrency || "USD",
    status: "draft",
    approvalStatus: "draft",
    createdBy: session.user.id,
    startDate: body.startDate ? new Date(body.startDate) : null,
    endDate: body.endDate ? new Date(body.endDate) : null,
  }).returning();

  return NextResponse.json({ campaign, policyResults }, { status: 201 });
}
