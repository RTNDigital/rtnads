import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { clients } from "./clients";

export const googleAdAccounts = pgTable("google_ad_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }).notNull(),
  customerId: text("customer_id").notNull(),
  name: text("name"),
  refreshToken: text("refresh_token").notNull(),
  managerCustomerId: text("manager_customer_id"),
  currency: text("currency").default("USD"),
  timezone: text("timezone"),
  status: text("status").default("active"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
