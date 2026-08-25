import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { adSets, campaigns } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const campaignId = url.searchParams.get("campaignId");
  if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });

  const sets = await db.select().from(adSets).where(eq(adSets.campaignId, campaignId));
  return NextResponse.json(sets);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const [adSet] = await db.insert(adSets).values({
    campaignId: body.campaignId,
    name: body.name,
    targeting: body.targeting || {},
    optimizationGoal: body.optimizationGoal,
    bidStrategy: body.bidStrategy,
    adFormat: body.adFormat,
    status: "draft",
  }).returning();

  return NextResponse.json(adSet, { status: 201 });
}
