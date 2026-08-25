import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ads } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const adSetId = url.searchParams.get("adSetId");
  if (!adSetId) return NextResponse.json({ error: "adSetId required" }, { status: 400 });

  const allAds = await db.select().from(ads).where(eq(ads.adSetId, adSetId));
  return NextResponse.json(allAds);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const [ad] = await db.insert(ads).values({
    adSetId: body.adSetId,
    creativeId: body.creativeId,
    leadFormId: body.leadFormId,
    status: "draft",
  }).returning();

  return NextResponse.json(ad, { status: 201 });
}
