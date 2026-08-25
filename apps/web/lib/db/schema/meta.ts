import { pgTable, text, timestamp, uuid, jsonb, integer, real } from "drizzle-orm/pg-core";
import { clients } from "./clients";

export const metaAdAccounts = pgTable("meta_ad_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }).notNull(),
  accountId: text("account_id").notNull(),
  name: text("name"),
  accessToken: text("access_token").notNull(),
  pageId: text("page_id"),
  pixelId: text("pixel_id"),
  whatsappBusinessId: text("whatsapp_business_id"),
  currency: text("currency").default("USD"),
  timezone: text("timezone"),
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => clients.id).notNull(),
  metaAdAccountId: uuid("meta_ad_account_id").references(() => metaAdAccounts.id),
  metaCampaignId: text("meta_campaign_id"),
  name: text("name").notNull(),
  campaignType: text("campaign_type", { enum: ["standard", "event"] }).notNull().default("standard"),
  objective: text("objective"),
  treatmentCategory: text("treatment_category"),
  targetCountries: jsonb("target_countries").$type<string[]>().default([]),
  dailyBudget: integer("daily_budget"),
  lifetimeBudget: integer("lifetime_budget"),
  budgetCurrency: text("budget_currency").default("USD"),
  incentiveRate: integer("incentive_rate"),
  status: text("status").default("draft"),
  approvalStatus: text("approval_status", {
    enum: ["draft", "pending_approval", "approved", "live", "paused", "rejected"],
  }).notNull().default("draft"),
  approvedBy: uuid("approved_by"),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  createdBy: uuid("created_by"),
  eventId: uuid("event_id"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const adSets = pgTable("ad_sets", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }).notNull(),
  metaAdsetId: text("meta_adset_id"),
  name: text("name").notNull(),
  targeting: jsonb("targeting").$type<Record<string, unknown>>().default({}),
  optimizationGoal: text("optimization_goal"),
  bidStrategy: text("bid_strategy"),
  adFormat: text("ad_format", { enum: ["lead_form", "landing_page", "whatsapp", "ig_dm", "funnel"] }),
  status: text("status").default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const leadForms = pgTable("lead_forms", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => clients.id).notNull(),
  metaFormId: text("meta_form_id"),
  name: text("name").notNull(),
  locale: text("locale").notNull().default("en"),
  treatmentCategory: text("treatment_category"),
  questions: jsonb("questions").$type<{
    type: "short_answer" | "multiple_choice";
    text: string;
    required: boolean;
    options?: string[];
  }[]>().default([]),
  templateUsed: text("template_used"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ads = pgTable("ads", {
  id: uuid("id").primaryKey().defaultRandom(),
  adSetId: uuid("ad_set_id").references(() => adSets.id, { onDelete: "cascade" }).notNull(),
  metaAdId: text("meta_ad_id"),
  creativeId: uuid("creative_id"),
  leadFormId: uuid("lead_form_id").references(() => leadForms.id),
  status: text("status").default("draft"),
  performanceData: jsonb("performance_data").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const creatives = pgTable("creatives", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceAdAccountId: uuid("source_ad_account_id").references(() => metaAdAccounts.id),
  metaCreativeId: text("meta_creative_id"),
  type: text("type", { enum: ["image", "video", "carousel"] }).notNull(),
  treatmentCategory: text("treatment_category"),
  targetCountry: text("target_country"),
  language: text("language"),
  thumbnailUrl: text("thumbnail_url"),
  mediaUrl: text("media_url"),
  syncedAt: timestamp("synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const creativePerformance = pgTable("creative_performance", {
  id: uuid("id").primaryKey().defaultRandom(),
  creativeId: uuid("creative_id").references(() => creatives.id, { onDelete: "cascade" }).notNull(),
  dateRangeStart: timestamp("date_range_start").notNull(),
  dateRangeEnd: timestamp("date_range_end").notNull(),
  impressions: integer("impressions").default(0),
  clicks: integer("clicks").default(0),
  ctr: real("ctr").default(0),
  leads: integer("leads").default(0),
  cpl: real("cpl").default(0),
  spend: real("spend").default(0),
  roas: real("roas"),
  conversionRate: real("conversion_rate"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
