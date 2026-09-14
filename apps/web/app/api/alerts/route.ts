import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { alerts } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq, and, desc, inArray } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = (session.user as any).orgId as string;

  const results = await db
    .select()
    .from(alerts)
    .where(eq(alerts.orgId, orgId))
    .orderBy(desc(alerts.createdAt))
    .limit(50);

  const unreadCount = results.filter((a) => !a.isRead).length;

  return NextResponse.json({ alerts: results, unreadCount });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = (session.user as any).orgId as string;
  const body = await request.json();

  if (body.markAllRead) {
    await db
      .update(alerts)
      .set({ isRead: true })
      .where(and(eq(alerts.orgId, orgId), eq(alerts.isRead, false)));

    return NextResponse.json({ success: true });
  }

  if (body.alertIds && Array.isArray(body.alertIds)) {
    await db
      .update(alerts)
      .set({ isRead: true })
      .where(and(eq(alerts.orgId, orgId), inArray(alerts.id, body.alertIds)));

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
