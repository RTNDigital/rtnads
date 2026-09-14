export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const cron = await import("node-cron");
    const { db } = await import("@/lib/db");
    const { metaAdAccounts } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const { incrementalCampaignSync, incrementalInsightsSync } = await import("@/lib/meta/sync");
    const { incrementalCampaignSync: googleCampaignSync, incrementalInsightsSync: googleInsightsSync } = await import("@/lib/google/sync");
    const { googleAdAccounts: googleAccountsTable } = await import("@/lib/db/schema");
    const { evaluateAlerts } = await import("@/lib/alerts/evaluate");

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

          const alertCount = await evaluateAlerts(account.id);
          if (alertCount > 0) {
            console.log(`[cron] ${alertCount} alerts generated for ${account.accountId}`);
          }
        } catch (e) {
          console.error(`[cron] ${type} sync failed for ${account.accountId}:`, e);
        }
      }
      console.log(`[cron] ${type} sync completed for ${accounts.length} meta accounts`);
    }

    async function runGoogleSync(type: "campaigns" | "insights") {
      const accounts = await db
        .select()
        .from(googleAccountsTable)
        .where(eq(googleAccountsTable.status, "active"));

      for (const account of accounts) {
        try {
          if (type === "insights") {
            await googleInsightsSync(
              account.id, account.customerId,
              account.refreshToken, account.managerCustomerId,
            );
          } else {
            await googleCampaignSync(
              account.id, account.customerId, account.clientId,
              account.refreshToken, account.managerCustomerId,
            );
          }

          const alertCount = await evaluateAlerts(account.id);
          if (alertCount > 0) {
            console.log(`[cron] ${alertCount} alerts generated for google ${account.customerId}`);
          }
        } catch (e) {
          console.error(`[cron] google ${type} sync failed for ${account.customerId}:`, e);
        }
      }
      console.log(`[cron] google ${type} sync completed for ${accounts.length} accounts`);
    }

    // Meta insights sync: every hour at minute 0
    cron.schedule("0 * * * *", () => {
      runSync("insights").catch(console.error);
      runGoogleSync("insights").catch(console.error);
    });

    // Campaign sync: every 6 hours at minute 15
    cron.schedule("15 */6 * * *", () => {
      runSync("campaigns").catch(console.error);
      runGoogleSync("campaigns").catch(console.error);
    });

    console.log("[cron] Scheduled: insights (hourly), campaigns (every 6h) — Meta + Google");
  }
}
