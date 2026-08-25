import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

function verifySignature(payload: string, signature: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret || !signature) return false;

  const expectedSig = "sha256=" + crypto
    .createHmac("sha256", appSecret)
    .update(payload)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSig),
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const body = JSON.parse(rawBody);

  if (body.object !== "page") {
    return NextResponse.json({ received: true });
  }

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== "leadgen") continue;

      const leadData = change.value;
      const metaLeadId = leadData.leadgen_id;

      const existing = await db.select({ id: leads.id })
        .from(leads)
        .where(eq(leads.metaLeadId, metaLeadId))
        .limit(1);
      if (existing.length > 0) continue;

      if (!leadData.client_id) continue;

      await db.insert(leads).values({
        metaLeadId,
        leadFormId: null,
        clientId: leadData.client_id,
        source: "meta_webhook",
        formData: leadData.field_data || {},
      }).onConflictDoNothing();
    }
  }

  return NextResponse.json({ received: true });
}
