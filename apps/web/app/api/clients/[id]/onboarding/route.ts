import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientOnboardingChecks, clients } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const orgId = (session.user as any).orgId;

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.orgId, orgId)))
    .limit(1);

  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const checks = await db
    .select()
    .from(clientOnboardingChecks)
    .where(eq(clientOnboardingChecks.clientId, id));

  return NextResponse.json(checks);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const orgId = (session.user as any).orgId;

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.orgId, orgId)))
    .limit(1);

  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { checkKey, status, notes } = await request.json();

  const [updated] = await db
    .update(clientOnboardingChecks)
    .set({
      status,
      notes,
      checkedAt: new Date(),
      checkedBy: session.user.id,
    })
    .where(
      and(
        eq(clientOnboardingChecks.clientId, id),
        eq(clientOnboardingChecks.checkKey, checkKey)
      )
    )
    .returning();

  if (!updated) return NextResponse.json({ error: "Check not found" }, { status: 404 });

  const allChecks = await db
    .select()
    .from(clientOnboardingChecks)
    .where(eq(clientOnboardingChecks.clientId, id));

  const allPassed = allChecks.every((c) => c.status === "pass");
  const anyInProgress = allChecks.some((c) => c.status !== "pending");

  const newOnboardingStatus = allPassed ? "ready" : anyInProgress ? "in_progress" : "pending";

  await db
    .update(clients)
    .set({ onboardingStatus: newOnboardingStatus, updatedAt: new Date() })
    .where(and(eq(clients.id, id), eq(clients.orgId, orgId)));

  return NextResponse.json({ check: updated, onboardingStatus: newOnboardingStatus });
}
