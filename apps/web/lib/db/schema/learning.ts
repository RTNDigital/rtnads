import { pgTable, text, timestamp, uuid, jsonb, integer, real } from "drizzle-orm/pg-core";
import { campaigns } from "./meta";
import { clients } from "./clients";
import { users } from "./users";

export const performanceSnapshots = pgTable("performance_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").references(() => campaigns.id),
  adSetId: uuid("ad_set_id"),
  adId: uuid("ad_id"),
  date: timestamp("date").notNull(),
  impressions: integer("impressions").default(0),
  clicks: integer("clicks").default(0),
  ctr: real("ctr").default(0),
  spend: real("spend").default(0),
  leads: integer("leads").default(0),
  cpl: real("cpl").default(0),
  conversions: integer("conversions").default(0),
  roas: real("roas"),
  treatmentCategory: text("treatment_category"),
  targetCountry: text("target_country"),
  adFormat: text("ad_format"),
  creativeType: text("creative_type"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const strategyOutcomes = pgTable("strategy_outcomes", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").references(() => campaigns.id).notNull(),
  treatmentCategory: text("treatment_category"),
  targetCountry: text("target_country"),
  adFormat: text("ad_format"),
  creativeTypesUsed: jsonb("creative_types_used").$type<string[]>().default([]),
  totalSpend: real("total_spend").default(0),
  totalLeads: integer("total_leads").default(0),
  avgCpl: real("avg_cpl"),
  leadQualityScore: real("lead_quality_score"),
  outcome: text("outcome", { enum: ["successful", "mediocre", "failed"] }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const knowledgeUpdates = pgTable("knowledge_updates", {
  id: uuid("id").primaryKey().defaultRandom(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  effectiveDate: timestamp("effective_date"),
  expiresAt: timestamp("expires_at"),
  updatedBy: uuid("updated_by").references(() => users.id),
  source: text("source", { enum: ["official_doc", "meta_policy", "google_policy", "internal"] }),
  affectsRules: jsonb("affects_rules").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const operationalFeedback = pgTable("operational_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").references(() => campaigns.id),
  clientId: uuid("client_id").references(() => clients.id),
  userId: uuid("user_id").references(() => users.id).notNull(),
  feedbackType: text("feedback_type", { enum: ["audience", "creative", "budget", "general"] }).notNull(),
  content: text("content").notNull(),
  impact: text("impact", { enum: ["positive", "negative", "neutral"] }).default("neutral"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ruleChangelog = pgTable("rule_changelog", {
  id: uuid("id").primaryKey().defaultRandom(),
  ruleId: uuid("rule_id"),
  tableName: text("table_name").notNull(),
  fieldChanged: text("field_changed").notNull(),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  changedBy: uuid("changed_by").references(() => users.id),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
});
