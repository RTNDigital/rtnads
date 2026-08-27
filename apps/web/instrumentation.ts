export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const cron = await import("node-cron");
    const { db } = await import("@/lib/db");
    const { metaAdAccounts } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const { incrementalCampaignSync, incrementalInsightsSync } = await import("@/lib/meta/sync");

    async function runSync(type: "campaigns" | "insights") {
      const accounts = await db
        .select()
        .from(metaAdAccounts)
        .where(eq(metaAdAccounts.status, "active"));

      for (const account of accounts) {
        try {
          if (type === "insights") {
            await incrementalInsightsSync(account.id, account.accountId);
          } else {
            await incrementalCampaignSync(account.id, account.accountId, account.clientId);
          }
        } catch (e) {
          console.error(`[cron] ${type} sync failed for ${account.accountId}:`, e);
        }
      }
      console.log(`[cron] ${type} sync completed for ${accounts.length} accounts`);
    }

    // Insights sync: every hour at minute 0
    cron.schedule("0 * * * *", () => {
      runSync("insights").catch(console.error);
    });

    // Campaign sync: every 6 hours at minute 15
    cron.schedule("15 */6 * * *", () => {
      runSync("campaigns").catch(console.error);
    });

    console.log("[cron] Scheduled: insights (hourly), campaigns (every 6h)");
  }
}
