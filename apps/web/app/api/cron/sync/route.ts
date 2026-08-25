import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { metaAdAccounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { incrementalCampaignSync, incrementalInsightsSync } from "@/lib/meta/sync";

export async function POST(request: Request) {
  const cronSecret = request.headers.get("x-cron-secret");
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const syncType = url.searchParams.get("type") || "campaigns";

  const accounts = await db.select().from(metaAdAccounts)
    .where(eq(metaAdAccounts.status, "active"));

  const results: { accountId: string; itemsSynced: number; errors: any[] }[] = [];

  for (const account of accounts) {
    try {
      if (syncType === "insights") {
        const result = await incrementalInsightsSync(account.id, account.accountId);
        results.push({ accountId: account.accountId, ...result });
      } else {
        const result = await incrementalCampaignSync(account.id, account.accountId, account.clientId);
        results.push({ accountId: account.accountId, ...result });
      }
    } catch (e: any) {
      results.push({ accountId: account.accountId, itemsSynced: 0, errors: [{ message: e.message }] });
    }
  }

  return NextResponse.json({ syncType, accounts: results.length, results });
}
