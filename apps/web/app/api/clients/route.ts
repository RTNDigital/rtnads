import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clients, clientOnboardingChecks } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { ONBOARDING_CHECKS } from "@/lib/constants/onboarding-checks";

const CLIENT_TYPES = ["clinic", "doctor", "agency"] as const;

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = (session.user as any).orgId;
  const allClients = await db.select().from(clients).where(eq(clients.orgId, orgId));

  return NextResponse.json(allClients);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = (session.user as any).orgId;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!CLIENT_TYPES.includes(body.type)) {
    return NextResponse.json(
      { error: `type must be one of: ${CLIENT_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const [client] = await db.insert(clients).values({
    orgId,
    name: body.name,
    type: body.type,
    treatmentCategories: body.treatmentCategories || [],
    targetMarkets: body.targetMarkets || [],
    monthlyBudget: body.monthlyBudget,
    budgetCurrency: body.budgetCurrency || "USD",
    notes: body.notes,
  }).returning();

  const checkValues = ONBOARDING_CHECKS.map((check) => ({
    clientId: client.id,
    checkKey: check.key,
    status: "pending" as const,
  }));
  await db.insert(clientOnboardingChecks).values(checkValues);

  return NextResponse.json(client, { status: 201 });
}
