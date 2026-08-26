import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { campaigns, clients } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

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

  const [updated] = await db
    .update(campaigns)
    .set(updateData)
    .where(eq(campaigns.id, id))
    .returning();

  return NextResponse.json(updated);
}
