import { db } from "@/lib/db";
import { platformRules } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { cached } from "./cache";

type PlatformRule = typeof platformRules.$inferSelect;

export async function getActiveRules(platform: "meta" | "google" = "meta"): Promise<PlatformRule[]> {
  return cached(`rules:${platform}`, () =>
    db.select().from(platformRules).where(
      eq(platformRules.platform, platform)
    )
  );
}

export async function getRuleByType(ruleType: string): Promise<PlatformRule | undefined> {
  const all = await getActiveRules();
  return all.find((r) => r.ruleType === ruleType);
}
