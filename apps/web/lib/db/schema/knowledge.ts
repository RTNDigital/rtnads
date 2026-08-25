import { pgTable, text, timestamp, uuid, jsonb, integer, boolean } from "drizzle-orm/pg-core";

export const platformRules = pgTable("platform_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  platform: text("platform", { enum: ["meta", "google"] }).notNull(),
  ruleType: text("rule_type").notNull(),
  countryScope: jsonb("country_scope").$type<string[]>().default([]),
  clientTypeScope: text("client_type_scope"),
  ruleContent: jsonb("rule_content").$type<Record<string, unknown>>().notNull(),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const incentiveCountries = pgTable("incentive_countries", {
  id: uuid("id").primaryKey().defaultRandom(),
  countryCode: text("country_code").notNull().unique(),
  countryName: text("country_name").notNull(),
  incentiveRate: integer("incentive_rate").notNull(),
  source: text("source").default("EK-53"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const agencyDisclaimers = pgTable("agency_disclaimers", {
  id: uuid("id").primaryKey().defaultRandom(),
  locale: text("locale").notNull().unique(),
  disclaimerText: text("disclaimer_text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const leadFormTemplates = pgTable("lead_form_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  treatmentCategory: text("treatment_category").notNull(),
  locale: text("locale").notNull().default("en"),
  questions: jsonb("questions").$type<{
    type: "short_answer" | "multiple_choice";
    text: string;
    required: boolean;
    options?: string[];
  }[]>().notNull(),
  avgCpl: integer("avg_cpl"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
