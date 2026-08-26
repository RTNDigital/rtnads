import { db } from "@/lib/db";
import { agencyDisclaimers } from "@/lib/db/schema";
import { cached } from "./cache";

type DisclaimerText = typeof agencyDisclaimers.$inferSelect;

export async function getDisclaimer(locale: string): Promise<string | null> {
  const all = await getAllDisclaimers();
  const found = all.find((d) => d.locale === locale);
  return found?.disclaimerText ?? null;
}

export async function getAllDisclaimers(): Promise<DisclaimerText[]> {
  return cached("disclaimers:all", () => db.select().from(agencyDisclaimers));
}
