import { db } from "@/lib/db";
import { leadFormTemplates } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { cached } from "./cache";

type LeadFormTemplate = typeof leadFormTemplates.$inferSelect;

export async function getTemplatesForCategory(
  category: string,
  locale: string = "en",
): Promise<LeadFormTemplate[]> {
  return cached(`templates:${category}:${locale}`, () =>
    db.select().from(leadFormTemplates).where(
      and(
        eq(leadFormTemplates.treatmentCategory, category),
        eq(leadFormTemplates.locale, locale),
      )
    )
  );
}

export async function getAllTemplates(): Promise<LeadFormTemplate[]> {
  return cached("templates:all", () => db.select().from(leadFormTemplates));
}
