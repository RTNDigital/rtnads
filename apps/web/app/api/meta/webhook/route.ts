import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leads, metaAdAccounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { metaFetch } from "@/lib/meta/client";
import crypto from "crypto";

function verifySignature(payload: string, signature: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret || !signature) return false;

  const expectedSig = "sha256=" + crypto
    .createHmac("sha256", appSecret)
    .update(payload)
    .digest("hex");

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSig);
  if (sigBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

interface MetaFieldDatum {
  name: string;
  values: string[];
}

interface MetaLeadDetails {
  id: string;
  created_time?: string;
  field_data?: MetaFieldDatum[];
}

const FIELD_NAME_MAP: Record<string, "name" | "email" | "phone" | "whatsapp" | "country" | "city"> = {
  full_name: "name",
  name: "name",
  email: "email",
  phone_number: "phone",
  phone: "phone",
  whatsapp: "whatsapp",
  whatsapp_number: "whatsapp",
  country: "country",
  city: "city",
};

function parseFieldData(fieldData: MetaFieldDatum[] | undefined): {
  name?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  country?: string;
  city?: string;
  formData: Record<string, string>;
} {
  const result: Record<string, string> = {};
  const formData: Record<string, string> = {};

  for (const field of fieldData || []) {
    const value = field.values?.[0] ?? "";
    formData[field.name] = value;

    const mappedKey = FIELD_NAME_MAP[field.name.toLowerCase()];
    if (mappedKey) {
      result[mappedKey] = value;
    }
  }

  return { ...result, formData };
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

      const leadData = change.value as {
        leadgen_id: string;
        page_id?: string;
        form_id?: string;
        adgroup_id?: string;
        ad_id?: string;
        created_time?: number;
      };
      const metaLeadId = leadData.leadgen_id;
      if (!metaLeadId) continue;

      const existing = await db.select({ id: leads.id })
        .from(leads)
        .where(eq(leads.metaLeadId, metaLeadId))
        .limit(1);
      if (existing.length > 0) continue;

      if (!leadData.page_id) continue;

      const [account] = await db.select({ clientId: metaAdAccounts.clientId })
        .from(metaAdAccounts)
        .where(eq(metaAdAccounts.pageId, leadData.page_id))
        .limit(1);
      if (!account) continue;

      let leadDetails: MetaLeadDetails;
      try {
        leadDetails = await metaFetch<MetaLeadDetails>(`/${metaLeadId}`, {
          params: { fields: "id,created_time,field_data" },
        });
      } catch {
        continue;
      }

      const { name, email, phone, whatsapp, country, city, formData } = parseFieldData(leadDetails.field_data);

      await db.insert(leads).values({
        metaLeadId,
        leadFormId: null,
        clientId: account.clientId,
        source: "meta_webhook",
        formData,
        name,
        email,
        phone,
        whatsapp,
        country,
        city,
      }).onConflictDoNothing();
    }
  }

  return NextResponse.json({ received: true });
}
