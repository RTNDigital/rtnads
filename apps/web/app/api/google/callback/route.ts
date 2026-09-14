import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { exchangeCode } from "@/lib/google/auth";
import { listAccessibleCustomers } from "@/lib/google/client";
import { db } from "@/lib/db";
import { googleAdAccounts, clients } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createHmac } from "crypto";

function verifyState(payload: string, signature: string): boolean {
  const secret = process.env.GOOGLE_CLIENT_SECRET || "";
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  return expected === signature;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const code = req.nextUrl.searchParams.get("code");
  const stateParam = req.nextUrl.searchParams.get("state");

  if (!code || !stateParam) {
    return NextResponse.redirect(new URL("/clients?error=missing_params", req.url));
  }

  let state: { clientId: string; orgId: string };
  try {
    const decoded = JSON.parse(Buffer.from(stateParam, "base64").toString());
    if (!verifyState(decoded.payload, decoded.signature)) {
      return NextResponse.redirect(new URL("/clients?error=invalid_state", req.url));
    }
    state = JSON.parse(decoded.payload);
  } catch {
    return NextResponse.redirect(new URL("/clients?error=invalid_state", req.url));
  }

  const sessionOrgId = (session.user as any).orgId as string;
  if (state.orgId !== sessionOrgId) {
    return NextResponse.redirect(new URL("/clients?error=unauthorized", req.url));
  }

  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, state.clientId), eq(clients.orgId, sessionOrgId)))
    .limit(1);

  if (!client) {
    return NextResponse.redirect(new URL("/clients?error=client_not_found", req.url));
  }

  try {
    const { refreshToken } = await exchangeCode(code);

    const response = await listAccessibleCustomers(refreshToken);
    const resourceNames = (response as any).resource_names as string[] | undefined;

    if (!resourceNames || resourceNames.length === 0) {
      return NextResponse.redirect(
        new URL("/clients?error=no_google_ads_accounts", req.url),
      );
    }

    const customerId = resourceNames[0].replace("customers/", "");

    await db.insert(googleAdAccounts).values({
      clientId: state.clientId,
      customerId,
      name: `Google Ads ${customerId}`,
      refreshToken,
      status: "active",
    });

    return NextResponse.redirect(
      new URL(`/clients/${state.clientId}?google=connected`, req.url),
    );
  } catch (e: any) {
    console.error("[google/callback] OAuth error:", e.message);
    return NextResponse.redirect(
      new URL(`/clients/${state.clientId}?error=google_auth_failed`, req.url),
    );
  }
}
