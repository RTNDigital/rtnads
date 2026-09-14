import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAuthUrl } from "@/lib/google/auth";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createHmac } from "crypto";

function signState(payload: string): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET || "";
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { clientId } = body;

  if (!clientId) {
    return NextResponse.json({ error: "clientId required" }, { status: 400 });
  }

  const orgId = (session.user as any).orgId as string;

  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.orgId, orgId)))
    .limit(1);

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const payload = JSON.stringify({ clientId, orgId });
  const signature = signState(payload);
  const signedState = Buffer.from(JSON.stringify({ payload, signature })).toString("base64");

  const url = getAuthUrl(signedState);

  return NextResponse.json({ url });
}
