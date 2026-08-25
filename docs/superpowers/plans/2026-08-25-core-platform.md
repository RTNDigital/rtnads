# Core Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the RTNADS monorepo with Next.js web app, PostgreSQL database, auth with roles, and client management — the foundation all other sub-projects build on.

**Architecture:** Turborepo monorepo with a Next.js 15 App Router web app (`apps/web`), a shared types package (`packages/shared`), PostgreSQL via Neon with Drizzle ORM, and Auth.js for role-based auth (admin/manager/junior). Dashboard shell with sidebar navigation and client CRUD with onboarding checklist.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, Drizzle ORM, Neon PostgreSQL, Auth.js v5, Turborepo, pnpm

**Spec:** `docs/superpowers/specs/2026-08-25-rtnads-platform-design.md`

## Global Constraints

- Node.js 22+ (LTS)
- pnpm as package manager
- TypeScript strict mode everywhere
- All database columns use snake_case
- All TypeScript types use camelCase
- No Türkçe in code — all code, variables, comments in English
- Roles: `admin`, `manager`, `junior` — stored as string enum
- Client types: `clinic`, `doctor`, `agency` — stored as string enum
- Onboarding status: `pending`, `in_progress`, `ready` — stored as string enum
- Campaign types: `standard`, `event` — stored as string enum
- Approval statuses: `draft`, `pending_approval`, `approved`, `live`, `paused`, `rejected` — stored as string enum

---

### Task 1: Monorepo Scaffold & Next.js App

**Files:**
- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/app/globals.css`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: running Next.js dev server at localhost:3000, `@rtnads/shared` package importable from `apps/web`

- [ ] **Step 1: Initialize monorepo root**

```bash
cd /Users/rasitdogan/Desktop/Projects/rtnads
pnpm init
```

Edit `package.json`:
```json
{
  "name": "rtnads",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint"
  },
  "devDependencies": {
    "turbo": "^2"
  },
  "packageManager": "pnpm@9.15.0"
}
```

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Create `turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "dev": {
      "cache": false,
      "persistent": true
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "lint": {
      "dependsOn": ["^build"]
    }
  }
}
```

- [ ] **Step 2: Create Next.js app**

```bash
mkdir -p apps/web
cd apps/web
pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --use-pnpm --yes
```

- [ ] **Step 3: Create shared package**

Create `packages/shared/package.json`:
```json
{
  "name": "@rtnads/shared",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "lint": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5"
  }
}
```

Create `packages/shared/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist"
  },
  "include": ["src"]
}
```

Create `packages/shared/src/index.ts`:
```typescript
export const APP_NAME = "RTNADS";

export type UserRole = "admin" | "manager" | "junior";
export type ClientType = "clinic" | "doctor" | "agency";
export type OnboardingStatus = "pending" | "in_progress" | "ready";
export type CampaignType = "standard" | "event";
export type ApprovalStatus = "draft" | "pending_approval" | "approved" | "live" | "paused" | "rejected";
export type AdFormat = "lead_form" | "landing_page" | "whatsapp" | "ig_dm" | "funnel";
```

- [ ] **Step 4: Add shared package as dependency to web app**

```bash
cd /Users/rasitdogan/Desktop/Projects/rtnads
pnpm add @rtnads/shared --filter web --workspace
```

Update `apps/web/next.config.ts` to transpile the workspace package:
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@rtnads/shared"],
};

export default nextConfig;
```

- [ ] **Step 5: Install root dependencies and verify dev server**

```bash
cd /Users/rasitdogan/Desktop/Projects/rtnads
pnpm install
pnpm turbo dev --filter web
```

Open browser at http://localhost:3000 — should show default Next.js page.

- [ ] **Step 6: Set up shadcn/ui**

```bash
cd apps/web
pnpm dlx shadcn@latest init -d
pnpm dlx shadcn@latest add button card input label separator sheet sidebar table badge dialog dropdown-menu form select textarea toast tabs
```

- [ ] **Step 7: Verify imports work and commit**

Update `apps/web/app/page.tsx`:
```tsx
import { APP_NAME } from "@rtnads/shared";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">{APP_NAME}</h1>
      <p className="text-muted-foreground">Reklam Karar-Zekâsı Platformu</p>
      <Button>Get Started</Button>
    </main>
  );
}
```

```bash
cd /Users/rasitdogan/Desktop/Projects/rtnads
git add -A
git commit -m "feat: scaffold monorepo with Next.js, Turborepo, and shared types"
```

---

### Task 2: Database Schema & Drizzle Setup

**Files:**
- Create: `apps/web/lib/db/index.ts`
- Create: `apps/web/lib/db/schema/organizations.ts`
- Create: `apps/web/lib/db/schema/users.ts`
- Create: `apps/web/lib/db/schema/clients.ts`
- Create: `apps/web/lib/db/schema/meta.ts`
- Create: `apps/web/lib/db/schema/knowledge.ts`
- Create: `apps/web/lib/db/schema/learning.ts`
- Create: `apps/web/lib/db/schema/index.ts`
- Create: `apps/web/drizzle.config.ts`
- Create: `apps/web/.env.local` (git-ignored)

**Interfaces:**
- Consumes: `@rtnads/shared` types (UserRole, ClientType, etc.)
- Produces: `db` instance, all Drizzle table schemas, `drizzle-kit push` creates tables in Neon

- [ ] **Step 1: Install Drizzle and Neon driver**

```bash
cd apps/web
pnpm add drizzle-orm @neondatabase/serverless
pnpm add -D drizzle-kit
```

- [ ] **Step 2: Create `.env.local` with database URL**

Create `apps/web/.env.local`:
```env
DATABASE_URL=postgresql://...your-neon-connection-string...
```

Add to `.gitignore` (at monorepo root):
```
.env.local
.env*.local
```

- [ ] **Step 3: Create database connection**

Create `apps/web/lib/db/index.ts`:
```typescript
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

- [ ] **Step 4: Create organizations and users schema**

Create `apps/web/lib/db/schema/organizations.ts`:
```typescript
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

Create `apps/web/lib/db/schema/users.ts`:
```typescript
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "manager", "junior"] }).notNull().default("junior"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

- [ ] **Step 5: Create clients schema**

Create `apps/web/lib/db/schema/clients.ts`:
```typescript
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
```

- [ ] **Step 6: Create Meta integration schema**

Create `apps/web/lib/db/schema/meta.ts`:
```typescript
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
```

- [ ] **Step 7: Create knowledge base schema**

Create `apps/web/lib/db/schema/knowledge.ts`:
```typescript
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
```

- [ ] **Step 8: Create learning tables schema**

Create `apps/web/lib/db/schema/learning.ts`:
```typescript
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
```

- [ ] **Step 9: Create schema barrel export and Drizzle config**

Create `apps/web/lib/db/schema/index.ts`:
```typescript
export * from "./organizations";
export * from "./users";
export * from "./clients";
export * from "./meta";
export * from "./knowledge";
export * from "./learning";
```

Create `apps/web/drizzle.config.ts`:
```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

Add scripts to `apps/web/package.json`:
```json
"db:push": "drizzle-kit push",
"db:studio": "drizzle-kit studio",
"db:generate": "drizzle-kit generate"
```

- [ ] **Step 10: Push schema to Neon and verify**

```bash
cd apps/web
pnpm db:push
```

Verify tables were created. Then run:
```bash
pnpm db:studio
```

Open Drizzle Studio in browser and confirm all tables exist.

- [ ] **Step 11: Commit**

```bash
cd /Users/rasitdogan/Desktop/Projects/rtnads
git add -A
git commit -m "feat: add database schema with Drizzle ORM and Neon PostgreSQL

Core, Meta, Knowledge, and Learning tables covering the full
data model from the design spec."
```

---

### Task 3: Auth System with Roles

**Files:**
- Create: `apps/web/lib/auth.ts`
- Create: `apps/web/app/api/auth/[...nextauth]/route.ts`
- Create: `apps/web/app/(auth)/login/page.tsx`
- Create: `apps/web/app/(auth)/register/page.tsx`
- Create: `apps/web/app/(auth)/layout.tsx`
- Create: `apps/web/lib/auth-utils.ts`
- Create: `apps/web/middleware.ts`

**Interfaces:**
- Consumes: `db` from Task 2, `users` and `organizations` tables
- Produces: `auth()` function returning session with `user.id`, `user.role`, `user.orgId`; protected route middleware; `<LoginForm>`, `<RegisterForm>` components

- [ ] **Step 1: Install auth dependencies**

```bash
cd apps/web
pnpm add next-auth@beta @auth/drizzle-adapter bcryptjs
pnpm add -D @types/bcryptjs
```

- [ ] **Step 2: Add auth secrets to `.env.local`**

Append to `apps/web/.env.local`:
```env
AUTH_SECRET=your-random-secret-here-generate-with-openssl
AUTH_URL=http://localhost:3000
```

- [ ] **Step 3: Create auth configuration**

Create `apps/web/lib/auth.ts`:
```typescript
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { users } from "./db/schema";
import { eq } from "drizzle-orm";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, credentials.email as string))
          .limit(1);

        if (!user) return null;

        const passwordMatch = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!passwordMatch) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          orgId: user.orgId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.orgId = (user as any).orgId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        (session.user as any).role = token.role;
        (session.user as any).orgId = token.orgId;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
```

- [ ] **Step 4: Create auth route handler**

Create `apps/web/app/api/auth/[...nextauth]/route.ts`:
```typescript
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 5: Create auth utility functions**

Create `apps/web/lib/auth-utils.ts`:
```typescript
import { auth } from "./auth";
import { redirect } from "next/navigation";
import type { UserRole } from "@rtnads/shared";

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

export async function requireRole(allowedRoles: UserRole[]) {
  const session = await requireAuth();
  const role = (session.user as any).role as UserRole;
  if (!allowedRoles.includes(role)) redirect("/");
  return session;
}
```

- [ ] **Step 6: Create middleware for route protection**

Create `apps/web/middleware.ts`:
```typescript
import { auth } from "./lib/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthPage = req.nextUrl.pathname.startsWith("/login") ||
    req.nextUrl.pathname.startsWith("/register");

  if (isAuthPage && isLoggedIn) {
    return Response.redirect(new URL("/", req.url));
  }

  if (!isAuthPage && !isLoggedIn) {
    return Response.redirect(new URL("/login", req.url));
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 7: Create auth layout**

Create `apps/web/app/(auth)/layout.tsx`:
```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <div className="w-full max-w-md p-6">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Create login page**

Create `apps/web/app/(auth)/login/page.tsx`:
```tsx
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return <LoginForm />;
}
```

Create `apps/web/app/(auth)/login/login-form.tsx`:
```tsx
"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME } from "@rtnads/shared";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email or password");
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl text-center">{APP_NAME}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 9: Create register API route and seed admin user**

Create `apps/web/app/api/register/route.ts`:
```typescript
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users, organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  const { name, email, password } = await request.json();

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return NextResponse.json({ error: "Email already exists" }, { status: 400 });
  }

  let [org] = await db.select().from(organizations).limit(1);
  if (!org) {
    [org] = await db.insert(organizations).values({
      name: "RTN House",
      slug: "rtn-house",
    }).returning();
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const isFirstUser = (await db.select().from(users).limit(1)).length === 0;

  const [user] = await db.insert(users).values({
    orgId: org.id,
    name,
    email,
    passwordHash,
    role: isFirstUser ? "admin" : "junior",
  }).returning();

  return NextResponse.json({ id: user.id, email: user.email, role: user.role });
}
```

- [ ] **Step 10: Verify login flow works**

Start dev server, register a user via API:
```bash
curl -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Rasit","email":"admin@rtnhouse.com","password":"test1234"}'
```

Then log in via the UI at `/login`. Should redirect to `/` after login.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add auth system with role-based access (admin/manager/junior)"
```

---

### Task 4: Dashboard Shell & Navigation

**Files:**
- Create: `apps/web/app/(dashboard)/layout.tsx`
- Create: `apps/web/app/(dashboard)/page.tsx`
- Create: `apps/web/components/sidebar-nav.tsx`
- Create: `apps/web/components/user-nav.tsx`

**Interfaces:**
- Consumes: `auth()` from Task 3
- Produces: authenticated dashboard layout with sidebar navigation, route groups for dashboard pages

- [ ] **Step 1: Create sidebar navigation component**

Create `apps/web/components/sidebar-nav.tsx`:
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@rtnads/shared";

const navItems = [
  { label: "Dashboard", href: "/", icon: "LayoutDashboard" },
  { label: "Clients", href: "/clients", icon: "Users" },
  { label: "Campaigns", href: "/campaigns", icon: "Megaphone" },
  { label: "Creatives", href: "/creatives", icon: "Image" },
  { label: "Chat", href: "/chat", icon: "MessageSquare" },
  { label: "Knowledge", href: "/knowledge", icon: "BookOpen" },
  { label: "Settings", href: "/settings", icon: "Settings" },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r bg-card">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          {APP_NAME}
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map((item) => {
          const isActive = item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Create user navigation component**

Create `apps/web/components/user-nav.tsx`:
```tsx
import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export async function UserNav() {
  const session = await auth();
  if (!session?.user) return null;

  const role = (session.user as any).role;

  return (
    <div className="flex items-center gap-3">
      <Badge variant="outline" className="capitalize">{role}</Badge>
      <span className="text-sm text-muted-foreground">{session.user.email}</span>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <Button variant="ghost" size="sm" type="submit">
          Sign Out
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Create dashboard layout**

Create `apps/web/app/(dashboard)/layout.tsx`:
```tsx
import { requireAuth } from "@/lib/auth-utils";
import { SidebarNav } from "@/components/sidebar-nav";
import { UserNav } from "@/components/user-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();

  return (
    <div className="flex h-screen">
      <SidebarNav />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-end border-b px-6">
          <UserNav />
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create dashboard home page**

Create `apps/web/app/(dashboard)/page.tsx`:
```tsx
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">
        Welcome, {session?.user?.name}
      </h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Clients
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">0</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Live Campaigns
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">0</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Spend (Month)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">$0</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify dashboard renders with sidebar and commit**

Start dev server, log in, verify dashboard with sidebar navigation appears.

```bash
git add -A
git commit -m "feat: add dashboard shell with sidebar navigation and user nav"
```

---

### Task 5: Client Management

**Files:**
- Create: `apps/web/app/(dashboard)/clients/page.tsx`
- Create: `apps/web/app/(dashboard)/clients/new/page.tsx`
- Create: `apps/web/app/(dashboard)/clients/[id]/page.tsx`
- Create: `apps/web/app/(dashboard)/clients/[id]/onboarding.tsx`
- Create: `apps/web/app/api/clients/route.ts`
- Create: `apps/web/app/api/clients/[id]/route.ts`
- Create: `apps/web/app/api/clients/[id]/onboarding/route.ts`
- Create: `apps/web/lib/constants/onboarding-checks.ts`

**Interfaces:**
- Consumes: `db` from Task 2, `requireAuth()` from Task 3, `clients` and `clientOnboardingChecks` tables
- Produces: Client CRUD UI, onboarding checklist UI, API routes for client management

- [ ] **Step 1: Define onboarding check constants**

Create `apps/web/lib/constants/onboarding-checks.ts`:
```typescript
export const ONBOARDING_CHECKS = [
  { key: "facebook_page_active", label: "Facebook page is active", category: "Meta" },
  { key: "whatsapp_business_connected", label: "WhatsApp Business connected to page", category: "Meta" },
  { key: "instagram_connected", label: "Instagram account connected", category: "Meta" },
  { key: "pixel_installed", label: "Meta Pixel installed", category: "Meta" },
  { key: "pixel_connected_to_account", label: "Ad account connected to Pixel", category: "Meta" },
  { key: "domain_verified", label: "Domain verified", category: "Meta" },
  { key: "lead_destination_set", label: "Lead destination configured (CRM/Telegram)", category: "Lead Management" },
  { key: "lead_notification_tested", label: "Lead notification flow tested", category: "Lead Management" },
  { key: "tax_info_correct", label: "Ad account tax information verified", category: "Incentive" },
  { key: "client_type_set", label: "Client type determined (clinic/doctor/agency)", category: "Incentive" },
  { key: "target_markets_set", label: "Target markets and languages defined", category: "Strategy" },
  { key: "monthly_budget_set", label: "Monthly ad budget entered", category: "Budget" },
] as const;

export type OnboardingCheckKey = typeof ONBOARDING_CHECKS[number]["key"];
```

- [ ] **Step 2: Create clients API routes**

Create `apps/web/app/api/clients/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clients, clientOnboardingChecks } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { ONBOARDING_CHECKS } from "@/lib/constants/onboarding-checks";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = (session.user as any).orgId;
  const allClients = await db.select().from(clients).where(eq(clients.orgId, orgId));

  return NextResponse.json(allClients);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = (session.user as any).orgId;
  const body = await request.json();

  const [client] = await db.insert(clients).values({
    orgId,
    name: body.name,
    type: body.type,
    treatmentCategories: body.treatmentCategories || [],
    targetMarkets: body.targetMarkets || [],
    monthlyBudget: body.monthlyBudget,
    budgetCurrency: body.budgetCurrency || "USD",
    notes: body.notes,
  }).returning();

  const checkValues = ONBOARDING_CHECKS.map((check) => ({
    clientId: client.id,
    checkKey: check.key,
    status: "pending" as const,
  }));
  await db.insert(clientOnboardingChecks).values(checkValues);

  return NextResponse.json(client, { status: 201 });
}
```

Create `apps/web/app/api/clients/[id]/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.orgId, (session.user as any).orgId)))
    .limit(1);

  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(client);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const [updated] = await db
    .update(clients)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(clients.id, id), eq(clients.orgId, (session.user as any).orgId)))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}
```

Create `apps/web/app/api/clients/[id]/onboarding/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientOnboardingChecks, clients } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const checks = await db
    .select()
    .from(clientOnboardingChecks)
    .where(eq(clientOnboardingChecks.clientId, id));

  return NextResponse.json(checks);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { checkKey, status, notes } = await request.json();

  const [updated] = await db
    .update(clientOnboardingChecks)
    .set({
      status,
      notes,
      checkedAt: new Date(),
      checkedBy: session.user.id,
    })
    .where(
      and(
        eq(clientOnboardingChecks.clientId, id),
        eq(clientOnboardingChecks.checkKey, checkKey)
      )
    )
    .returning();

  if (!updated) return NextResponse.json({ error: "Check not found" }, { status: 404 });

  const allChecks = await db
    .select()
    .from(clientOnboardingChecks)
    .where(eq(clientOnboardingChecks.clientId, id));

  const allPassed = allChecks.every((c) => c.status === "pass");
  const anyInProgress = allChecks.some((c) => c.status !== "pending");

  const newOnboardingStatus = allPassed ? "ready" : anyInProgress ? "in_progress" : "pending";

  await db
    .update(clients)
    .set({ onboardingStatus: newOnboardingStatus, updatedAt: new Date() })
    .where(eq(clients.id, id));

  return NextResponse.json({ check: updated, onboardingStatus: newOnboardingStatus });
}
```

- [ ] **Step 3: Create client list page**

Create `apps/web/app/(dashboard)/clients/page.tsx`:
```tsx
import Link from "next/link";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  in_progress: "bg-blue-100 text-blue-800",
  ready: "bg-green-100 text-green-800",
};

export default async function ClientsPage() {
  const session = await auth();
  const orgId = (session?.user as any)?.orgId;

  const allClients = await db
    .select()
    .from(clients)
    .where(eq(clients.orgId, orgId));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clients</h1>
        <Button asChild>
          <Link href="/clients/new">Add Client</Link>
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Categories</TableHead>
            <TableHead>Budget</TableHead>
            <TableHead>Onboarding</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allClients.map((client) => (
            <TableRow key={client.id}>
              <TableCell>
                <Link href={`/clients/${client.id}`} className="font-medium hover:underline">
                  {client.name}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="capitalize">{client.type}</Badge>
              </TableCell>
              <TableCell>
                {(client.treatmentCategories as string[] || []).join(", ") || "—"}
              </TableCell>
              <TableCell>
                {client.monthlyBudget
                  ? `${client.budgetCurrency} ${client.monthlyBudget.toLocaleString()}`
                  : "—"}
              </TableCell>
              <TableCell>
                <Badge className={statusColors[client.onboardingStatus] || ""}>
                  {client.onboardingStatus.replace("_", " ")}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
          {allClients.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No clients yet. Add your first client to get started.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 4: Create new client page**

Create `apps/web/app/(dashboard)/clients/new/page.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const TREATMENT_CATEGORIES = [
  "rhinoplasty", "dental", "facelift", "eyelid_surgery",
  "bariatric", "mommy_makeover", "hair_transplant", "bbl",
];

export default function NewClientPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [monthlyBudget, setMonthlyBudget] = useState("");
  const [budgetCurrency, setBudgetCurrency] = useState("USD");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        type,
        treatmentCategories: selectedCategories,
        monthlyBudget: monthlyBudget ? parseInt(monthlyBudget) : null,
        budgetCurrency,
        notes: notes || null,
      }),
    });

    if (res.ok) {
      const client = await res.json();
      router.push(`/clients/${client.id}`);
    }
    setLoading(false);
  }

  function toggleCategory(cat: string) {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Add New Client</h1>
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Client Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Client Type</Label>
              <Select value={type} onValueChange={setType} required>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="clinic">Clinic</SelectItem>
                  <SelectItem value="doctor">Doctor</SelectItem>
                  <SelectItem value="agency">Agency (Acente)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Treatment Categories</Label>
              <div className="flex flex-wrap gap-2">
                {TREATMENT_CATEGORIES.map((cat) => (
                  <Button
                    key={cat}
                    type="button"
                    variant={selectedCategories.includes(cat) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleCategory(cat)}
                    className="capitalize"
                  >
                    {cat.replace("_", " ")}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="budget">Monthly Budget</Label>
                <Input
                  id="budget"
                  type="number"
                  value={monthlyBudget}
                  onChange={(e) => setMonthlyBudget(e.target.value)}
                  placeholder="e.g. 3000"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Currency</Label>
                <Select value={budgetCurrency} onValueChange={setBudgetCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="TRY">TRY</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <Button type="submit" disabled={loading || !name || !type}>
              {loading ? "Creating..." : "Create Client"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Create client detail page with onboarding checklist**

Create `apps/web/app/(dashboard)/clients/[id]/page.tsx`:
```tsx
import { db } from "@/lib/db";
import { clients, clientOnboardingChecks } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OnboardingChecklist } from "./onboarding";
import { ONBOARDING_CHECKS } from "@/lib/constants/onboarding-checks";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.orgId, (session?.user as any)?.orgId)))
    .limit(1);

  if (!client) notFound();

  const checks = await db
    .select()
    .from(clientOnboardingChecks)
    .where(eq(clientOnboardingChecks.clientId, id));

  const passedCount = checks.filter((c) => c.status === "pass").length;
  const totalCount = checks.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{client.name}</h1>
          <div className="flex gap-2 mt-1">
            <Badge variant="outline" className="capitalize">{client.type}</Badge>
            <Badge
              className={
                client.onboardingStatus === "ready"
                  ? "bg-green-100 text-green-800"
                  : client.onboardingStatus === "in_progress"
                  ? "bg-blue-100 text-blue-800"
                  : "bg-yellow-100 text-yellow-800"
              }
            >
              {client.onboardingStatus === "ready"
                ? `Ready (${passedCount}/${totalCount})`
                : `${passedCount}/${totalCount} complete`}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Monthly Budget</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {client.monthlyBudget
                ? `${client.budgetCurrency} ${client.monthlyBudget.toLocaleString()}`
                : "Not set"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {(client.treatmentCategories as string[] || []).map((cat) => (
                <Badge key={cat} variant="secondary" className="capitalize">
                  {cat.replace("_", " ")}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Type</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold capitalize">{client.type}</p>
            {client.type === "agency" && (
              <p className="text-xs text-muted-foreground mt-1">Disclaimer required</p>
            )}
          </CardContent>
        </Card>
      </div>

      <OnboardingChecklist
        clientId={client.id}
        checks={checks}
        checkDefinitions={ONBOARDING_CHECKS}
      />
    </div>
  );
}
```

Create `apps/web/app/(dashboard)/clients/[id]/onboarding.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Check = {
  id: string;
  checkKey: string;
  status: string;
  notes: string | null;
};

type CheckDefinition = {
  key: string;
  label: string;
  category: string;
};

export function OnboardingChecklist({
  clientId,
  checks,
  checkDefinitions,
}: {
  clientId: string;
  checks: Check[];
  checkDefinitions: readonly CheckDefinition[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const categories = [...new Set(checkDefinitions.map((d) => d.category))];

  async function toggleCheck(checkKey: string, currentStatus: string) {
    setLoading(checkKey);
    const newStatus = currentStatus === "pass" ? "pending" : "pass";

    await fetch(`/api/clients/${clientId}/onboarding`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkKey, status: newStatus }),
    });

    router.refresh();
    setLoading(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Onboarding Checklist</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {categories.map((category) => (
          <div key={category}>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
              {category}
            </h3>
            <div className="flex flex-col gap-2">
              {checkDefinitions
                .filter((d) => d.category === category)
                .map((def) => {
                  const check = checks.find((c) => c.checkKey === def.key);
                  const isPassed = check?.status === "pass";

                  return (
                    <div
                      key={def.key}
                      className="flex items-center gap-3 rounded-md border p-3"
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleCheck(def.key, check?.status || "pending")}
                        disabled={loading === def.key}
                        className="h-6 w-6 p-0 shrink-0"
                      >
                        {isPassed ? "✓" : "○"}
                      </Button>
                      <span
                        className={
                          isPassed ? "text-muted-foreground line-through" : ""
                        }
                      >
                        {def.label}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Verify client CRUD and onboarding flow works**

Start dev server, create a new client, view detail page, toggle onboarding checks.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add client management with onboarding checklist

CRUD for clients (clinic/doctor/agency), categorized onboarding
checks that block campaign creation until complete."
```

---

### Task 6: Seed Knowledge Base Data

**Files:**
- Create: `apps/web/lib/db/seed.ts`
- Modify: `apps/web/package.json` (add seed script)

**Interfaces:**
- Consumes: `db` from Task 2, knowledge tables from schema
- Produces: EK-53 countries, agency disclaimers, platform rules, and lead form templates seeded in database

- [ ] **Step 1: Create seed script**

Create `apps/web/lib/db/seed.ts`:
```typescript
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

async function seed() {
  console.log("Seeding knowledge base...");

  // EK-53 countries (%70 incentive)
  const ek53Countries = [
    { countryCode: "DE", countryName: "Germany", incentiveRate: 70 },
    { countryCode: "US", countryName: "United States", incentiveRate: 70 },
    { countryCode: "AZ", countryName: "Azerbaijan", incentiveRate: 70 },
    { countryCode: "AE", countryName: "United Arab Emirates", incentiveRate: 70 },
    { countryCode: "GB", countryName: "United Kingdom", incentiveRate: 70 },
    { countryCode: "FR", countryName: "France", incentiveRate: 70 },
    { countryCode: "IE", countryName: "Ireland", incentiveRate: 70 },
    { countryCode: "ES", countryName: "Spain", incentiveRate: 70 },
    { countryCode: "CA", countryName: "Canada", incentiveRate: 70 },
    { countryCode: "QA", countryName: "Qatar", incentiveRate: 70 },
    { countryCode: "KZ", countryName: "Kazakhstan", incentiveRate: 70 },
    { countryCode: "EG", countryName: "Egypt", incentiveRate: 70 },
    { countryCode: "NG", countryName: "Nigeria", incentiveRate: 70 },
    { countryCode: "NO", countryName: "Norway", incentiveRate: 70 },
    { countryCode: "UZ", countryName: "Uzbekistan", incentiveRate: 70 },
    { countryCode: "PL", countryName: "Poland", incentiveRate: 70 },
    { countryCode: "RO", countryName: "Romania", incentiveRate: 70 },
    { countryCode: "RU", countryName: "Russia", incentiveRate: 70 },
    { countryCode: "SN", countryName: "Senegal", incentiveRate: 70 },
    { countryCode: "SA", countryName: "Saudi Arabia", incentiveRate: 70 },
  ];

  for (const country of ek53Countries) {
    await db.insert(schema.incentiveCountries).values(country).onConflictDoNothing();
  }
  console.log(`Seeded ${ek53Countries.length} EK-53 countries`);

  // Agency disclaimers
  const disclaimers = [
    {
      locale: "de",
      disclaimerText: "Die Behandlungen werden in einer vertraglich verbundenen Gesundheitseinrichtung durchgeführt, die über eine offizielle Genehmigung für internationalen Gesundheitstourismus verfügt.",
    },
    {
      locale: "en",
      disclaimerText: "Treatments are performed at a contractually affiliated healthcare facility that holds an official authorization for international health tourism.",
    },
  ];

  for (const disclaimer of disclaimers) {
    await db.insert(schema.agencyDisclaimers).values(disclaimer).onConflictDoNothing();
  }
  console.log(`Seeded ${disclaimers.length} agency disclaimers`);

  // Platform rules
  const rules = [
    {
      platform: "meta" as const,
      ruleType: "whatsapp_unavailable",
      countryScope: ["DE", "FR", "GB", "ES", "IE", "NO", "PL", "RO", "NL", "BE", "AT", "CH", "IT", "SE", "DK", "FI", "PT", "GR", "CZ", "HU", "BG", "HR", "SK", "SI", "LT", "LV", "EE", "CY", "MT", "LU"],
      ruleContent: {
        description: "WhatsApp conversation optimization is not available in European countries",
        action: "do_not_offer_whatsapp_format",
      },
    },
    {
      platform: "meta" as const,
      ruleType: "whatsapp_available",
      countryScope: ["US", "CA", "AU"],
      ruleContent: {
        description: "WhatsApp conversation optimization is available",
        action: "offer_whatsapp_format",
      },
    },
    {
      platform: "meta" as const,
      ruleType: "turkish_text_forbidden",
      countryScope: [],
      ruleContent: {
        description: "Turkish text in health tourism ads disqualifies the advertiser from government incentives",
        action: "block_campaign_with_turkish_text",
        severity: "blocker",
      },
    },
    {
      platform: "meta" as const,
      ruleType: "agency_disclaimer_required",
      countryScope: [],
      clientTypeScope: "agency",
      ruleContent: {
        description: "Health tourism agencies must include the Exporters Association disclaimer in ad text",
        action: "auto_append_disclaimer",
        severity: "blocker",
      },
    },
    {
      platform: "meta" as const,
      ruleType: "whatsapp_field_bypass",
      countryScope: [],
      ruleContent: {
        description: "Meta blocks 'WhatsApp' in short-answer lead form questions. Use 'Whats.App' instead.",
        action: "auto_replace_whatsapp_text",
        replaceFrom: "WhatsApp",
        replaceTo: "Whats.App",
      },
    },
  ];

  for (const rule of rules) {
    await db.insert(schema.platformRules).values(rule);
  }
  console.log(`Seeded ${rules.length} platform rules`);

  // Lead form templates
  const templates = [
    {
      treatmentCategory: "rhinoplasty",
      locale: "en",
      questions: [
        { type: "short_answer" as const, text: "Share your Whats.App number so we can reach you:", required: true },
        { type: "multiple_choice" as const, text: "What type of nose do you prefer?", required: true, options: ["Natural", "Barbie", "Half Barbie / Half Natural"] },
        { type: "multiple_choice" as const, text: "When are you considering rhinoplasty?", required: true, options: ["1-3 months", "3-6 months", "6+ months", "Not sure yet"] },
      ],
    },
    {
      treatmentCategory: "dental",
      locale: "en",
      questions: [
        { type: "short_answer" as const, text: "Share your Whats.App number so we can reach you:", required: true },
        { type: "multiple_choice" as const, text: "Which treatment are you interested in?", required: true, options: ["Dental Implants", "Veneers", "Crowns", "Smile Makeover", "Other"] },
        { type: "multiple_choice" as const, text: "When are you planning to visit Turkey?", required: true, options: ["1-3 months", "3-6 months", "6+ months", "Not sure yet"] },
      ],
    },
    {
      treatmentCategory: "bariatric",
      locale: "en",
      questions: [
        { type: "short_answer" as const, text: "Share your Whats.App number so we can reach you:", required: true },
        { type: "multiple_choice" as const, text: "Which procedure are you interested in?", required: true, options: ["Gastric Sleeve", "Gastric Bypass", "Gastric Balloon", "Not sure yet"] },
        { type: "multiple_choice" as const, text: "When are you planning to visit Turkey?", required: true, options: ["1-3 months", "3-6 months", "6+ months", "Not sure yet"] },
      ],
    },
  ];

  for (const template of templates) {
    await db.insert(schema.leadFormTemplates).values(template);
  }
  console.log(`Seeded ${templates.length} lead form templates`);

  console.log("Seed complete!");
}

seed().catch(console.error);
```

- [ ] **Step 2: Add seed script to package.json**

Add to `apps/web/package.json` scripts:
```json
"db:seed": "npx tsx lib/db/seed.ts"
```

- [ ] **Step 3: Run the seed**

```bash
cd apps/web
pnpm db:seed
```

Verify data in Drizzle Studio:
```bash
pnpm db:studio
```

- [ ] **Step 4: Commit**

```bash
cd /Users/rasitdogan/Desktop/Projects/rtnads
git add -A
git commit -m "feat: seed knowledge base with EK-53 countries, platform rules, disclaimers, and form templates"
```

---

## Summary

After completing all 6 tasks, the Core Platform delivers:

1. **Monorepo** — Turborepo with Next.js web app and shared types package
2. **Database** — 20+ tables covering all domain entities, fully migrated to Neon
3. **Auth** — Email/password login with admin/manager/junior roles
4. **Dashboard** — Sidebar navigation, user nav with role badge
5. **Client Management** — CRUD with treatment categories, budget, target markets
6. **Onboarding Checklist** — 12-item checklist per client, blocks campaign creation when incomplete
7. **Knowledge Base Seed** — EK-53 countries, platform rules (WhatsApp, Turkish text, disclaimer), lead form templates

**Next plan:** Plan 2 — Knowledge MCP Server (builds on this database and shared types)
