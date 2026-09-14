import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/google/auth";
import { listAccessibleCustomers } from "@/lib/google/client";
import { db } from "@/lib/db";
import { googleAdAccounts } from "@/lib/db/schema";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const stateParam = req.nextUrl.searchParams.get("state");

  if (!code || !stateParam) {
    return NextResponse.redirect(new URL("/clients?error=missing_params", req.url));
  }

  let state: { clientId: string; orgId: string };
  try {
    state = JSON.parse(Buffer.from(stateParam, "base64").toString());
  } catch {
    return NextResponse.redirect(new URL("/clients?error=invalid_state", req.url));
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
