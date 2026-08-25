import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

const CLIENT_TYPES = ["clinic", "doctor", "agency"] as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.orgId, (session.user as any).orgId)))
    .limit(1);

  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(client);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    name,
    type,
    treatmentCategories,
    targetMarkets,
    monthlyBudget,
    budgetCurrency,
    notes,
  } = body;

  if (type !== undefined && !CLIENT_TYPES.includes(type)) {
    return NextResponse.json(
      { error: `type must be one of: ${CLIENT_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const [updated] = await db
    .update(clients)
    .set({
      name,
      type,
      treatmentCategories,
      targetMarkets,
      monthlyBudget,
      budgetCurrency,
      notes,
      updatedAt: new Date(),
    })
    .where(and(eq(clients.id, id), eq(clients.orgId, (session.user as any).orgId)))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}
