import { pgTable, text, timestamp, uuid, jsonb, integer, pgEnum } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  type: text("type", { enum: ["clinic", "doctor", "agency"] }).notNull(),
  treatmentCategories: jsonb("treatment_categories").$type<string[]>().default([]),
  targetMarkets: jsonb("target_markets").$type<{
    country: string;
    languages: string[];
    audienceNote?: string;
    preferredFormats?: string[];
  }[]>().default([]),
  monthlyBudget: integer("monthly_budget"),
  budgetCurrency: text("budget_currency").default("USD"),
  onboardingStatus: text("onboarding_status", { enum: ["pending", "in_progress", "ready"] }).notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const clientOnboardingChecks = pgTable("client_onboarding_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }).notNull(),
  checkKey: text("check_key").notNull(),
  status: text("status", { enum: ["pass", "fail", "pending"] }).notNull().default("pending"),
  notes: text("notes"),
  checkedAt: timestamp("checked_at"),
  checkedBy: uuid("checked_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }).notNull(),
  eventDate: timestamp("event_date").notNull(),
  eventTimeStart: text("event_time_start"),
  eventTimeEnd: text("event_time_end"),
  city: text("city").notNull(),
  country: text("country").notNull(),
  locationAddress: text("location_address"),
  doctorName: text("doctor_name"),
  isFreeConsultation: text("is_free_consultation", { enum: ["yes", "no"] }).default("yes"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
