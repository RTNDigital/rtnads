# Knowledge Layer Design Spec

## Overview

Domain knowledge layer for RTNADS health tourism ad platform. Stores treatment categories, country metadata, lead form question templates, disclaimer texts, and policy rules in the database with seed-file management. Replaces hardcoded values in policy-checker.ts and provides structured knowledge for the campaign wizard and future Campaign Intelligence (Claude chat).

**Approach:** Next.js app-internal knowledge layer — `lib/knowledge/` modules with DB tables and API routes. No separate MCP server process.

**Data Management:** Version-controlled seed files. Data loaded via CLI script (`pnpm db:seed-knowledge`). No admin UI in v1 — changes go through code, deploy refreshes cache.

**Spec:** This document is the authority. The implementation plan argues from it.

---

## 1. Data Model

### 1.1 `countries` table

Target country metadata for campaign targeting decisions.

```typescript
export const countries = pgTable("countries", {
  code: text("code").primaryKey(),                    // ISO 3166-1 alpha-2 (e.g. "DE", "US")
  name: text("name").notNull(),                       // English name
  nameLocal: text("name_local"),                      // Native name (e.g. "Deutschland")
  continent: text("continent").notNull(),              // "europe", "asia", "africa", "americas", "oceania"
  language: text("language").notNull(),                // Primary language code (e.g. "de", "en", "ar")
  languageName: text("language_name").notNull(),       // Language display name (e.g. "German", "Arabic")
  currency: text("currency").default("USD"),           // ISO 4217 currency code
  isEk53: boolean("is_ek53").default(false).notNull(), // EK-53 incentive list membership
  incentiveRate: integer("incentive_rate").default(50), // 70 for EK-53, 50 for others
  hasWhatsAppOptimization: boolean("has_whatsapp_optimization").default(true).notNull(),
  isEU: boolean("is_eu").default(false).notNull(),     // GDPR applies
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

Seed: ~40 countries covering all EK-53 + major health tourism markets.

### 1.2 `treatmentCategories` table

Treatment categories with hierarchy support.

```typescript
export const treatmentCategories = pgTable("treatment_categories", {
  slug: text("slug").primaryKey(),                     // e.g. "rhinoplasty", "dental-implants"
  name: text("name").notNull(),                        // English display name
  parentSlug: text("parent_slug").references(() => treatmentCategories.slug),
  description: text("description"),                    // Short description for UI
  keywords: text("keywords").array(),                  // Search/matching keywords for Claude
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

Hierarchy: `dental` → `dental-implants`, `dental-veneers`, `hollywood-smile`

Seed: 15+ categories across aesthetics, dental, bariatric, ophthalmology.

### 1.3 `leadFormTemplates` table

Pre-defined question templates per treatment category and locale.

```typescript
export const leadFormTemplates = pgTable("lead_form_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  categorySlug: text("category_slug").references(() => treatmentCategories.slug).notNull(),
  locale: text("locale").notNull(),                    // "en", "de", "nl", "ar", "pl", "ru", "fr", "es", "ro", "no"
  sortOrder: integer("sort_order").default(0),
  questionType: text("question_type", {
    enum: ["short_answer", "multiple_choice"],
  }).notNull(),
  questionText: text("question_text").notNull(),
  options: jsonb("options").$type<string[]>(),          // For multiple_choice
  isRequired: boolean("is_required").default(true).notNull(),
  isWhatsApp: boolean("is_whatsapp").default(false).notNull(), // Auto-applies "Whats.App" bypass
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

Each category gets 2-4 questions per locale. WhatsApp question auto-uses approved bypass phrasing ("Whats.App" instead of "WhatsApp"). Locales: en, de, nl, ar, pl, ru, fr, es, ro, no, kk, az, uz.

### 1.4 `disclaimerTexts` table

Mandatory disclaimer translations for agency-type clients (Ihracatcilar Birligi requirement).

```typescript
export const disclaimerTexts = pgTable("disclaimer_texts", {
  id: uuid("id").primaryKey().defaultRandom(),
  locale: text("locale").notNull().unique(),           // "de", "en", "fr", "nl", "ar", "pl", "ru", "es", "ro", "no", "kk", "az", "uz"
  text: text("text").notNull(),                        // Full disclaimer text in that language
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

Agency clients MUST include this text in ad copy. System auto-suggests based on target country language.

### 1.5 `knowledgeRules` table

Policy rules that drive the policy checker — replaces hardcoded arrays.

```typescript
export const knowledgeRules = pgTable("knowledge_rules", {
  code: text("code").primaryKey(),                     // "TURKISH_TEXT", "WHATSAPP_REQUIRED", etc.
  level: text("level", {
    enum: ["blocker", "warning", "info"],
  }).notNull(),
  messageTemplate: text("message_template").notNull(), // Supports {variable} interpolation
  field: text("field"),                                // Which form field this applies to
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

Initial rules (migrated from hardcoded policy-checker.ts):
- `TURKISH_TEXT` — blocker, checks ad copy for Turkish characters/words
- `EK53_INCENTIVE` — info, shows incentive rate based on target countries
- `MANDATORY_DISCLAIMER` — blocker for agency clients, checks disclaimer presence
- `WHATSAPP_REQUIRED` — blocker, checks WhatsApp field in lead forms
- `EUROPE_WHATSAPP` — warning, WhatsApp optimization unavailable in EU
- `GDPR_NOTICE` — warning, GDPR reminder for EU targeting

---

## 2. File Structure

```
apps/web/lib/db/schema/
  knowledge.ts              — 5 table definitions (Drizzle)

apps/web/lib/knowledge/
  countries.ts              — getCountries, getCountry, getEk53Countries, getEUCountries, getByContinent, getByLanguage
  treatments.ts             — getCategories, getCategory, getCategoryTree, getCategoryBySlug
  lead-templates.ts         — getTemplatesForCategory(slug, locale), getWhatsAppVariants(locale)
  disclaimers.ts            — getDisclaimer(locale), getAllDisclaimers
  rules.ts                  — getRules, getRuleByCode, getActiveRules
  cache.ts                  — Generic in-memory cache wrapper with TTL
  seed.ts                   — All seed data as typed constants

apps/web/app/api/knowledge/
  countries/route.ts        — GET with filters: ?ek53=true, ?eu=true, ?continent=europe
  treatments/route.ts       — GET category list with optional ?tree=true for hierarchy
  templates/route.ts        — GET ?category=rhinoplasty&locale=de
  disclaimers/route.ts      — GET ?locale=de

apps/web/scripts/
  seed-knowledge.ts         — CLI seed script: reads seed.ts, upserts all tables
```

---

## 3. Knowledge Query Layer

### Cache Strategy

All knowledge modules use a shared in-memory cache with 1-hour TTL:

```typescript
// lib/knowledge/cache.ts
const store = new Map<string, { data: unknown; expiry: number }>();
const TTL = 60 * 60 * 1000; // 1 hour

export function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T>
```

Cache invalidates on TTL expiry. Process restart (deploy) clears all caches.

### Module Signatures

```typescript
// countries.ts
async function getCountries(): Promise<Country[]>
async function getCountry(code: string): Promise<Country | undefined>
async function getEk53Countries(): Promise<Country[]>
async function getEUCountries(): Promise<Country[]>
async function getByContinent(continent: string): Promise<Country[]>
async function getByLanguage(lang: string): Promise<Country[]>

// treatments.ts
async function getCategories(): Promise<TreatmentCategory[]>
async function getCategory(slug: string): Promise<TreatmentCategory | undefined>
async function getCategoryTree(): Promise<CategoryTreeNode[]>  // nested parent→children

// lead-templates.ts
async function getTemplatesForCategory(slug: string, locale: string): Promise<LeadFormTemplate[]>
async function getWhatsAppVariants(locale: string): Promise<LeadFormTemplate[]>

// disclaimers.ts
async function getDisclaimer(locale: string): Promise<string | null>
async function getAllDisclaimers(): Promise<DisclaimerText[]>

// rules.ts
async function getActiveRules(): Promise<KnowledgeRule[]>
async function getRuleByCode(code: string): Promise<KnowledgeRule | undefined>
```

---

## 4. Policy Checker Refactor

Current `lib/meta/policy-checker.ts` has hardcoded:
- `EK53_COUNTRIES` array (20 countries)
- `EU_COUNTRIES` array (27 countries)
- `TURKISH_CHARS` and `TURKISH_WORDS` regex patterns
- Rule definitions with messages

### Changes:
1. Function becomes `async`: `export async function checkCampaignPolicies(...)`
2. Country lists pulled from knowledge layer: `getEk53Countries()`, `getEUCountries()`
3. Rule metadata (messages, levels) pulled from `getActiveRules()`
4. Turkish detection regex stays in code (regex patterns don't belong in DB)
5. Callers updated to `await checkCampaignPolicies(...)` — publish route and wizard already in async context

### What stays hardcoded:
- `TURKISH_CHARS` regex — regex patterns are code, not data
- `TURKISH_WORDS` regex — same reason
- Check logic (if/else flow) — business logic belongs in code

### What moves to DB:
- Country lists (EK-53, EU membership)
- Rule messages and levels
- Disclaimer text lookups

---

## 5. Seed Data

### Countries (~40)

**EK-53 (incentiveRate: 70):**
DE, US, AZ, AE, GB, FR, IE, ES, CA, QA, KZ, EG, NG, NO, UZ, PL, RO, RU, SN, SA

**Non-EK-53 health tourism markets (incentiveRate: 50):**
NL, BE, AT, SE, IT, CH, IQ, KW, LY, AU, DK, FI, PT, GR, CZ, HU, BG, HR, BA, KG

Each with: continent, language, currency, WhatsApp optimization status, EU flag.

### Treatment Categories (15)

Top-level: rhinoplasty, dental, facelift, eyelid-surgery, bariatric, mommy-makeover, hair-transplant, bbl, breast-augmentation, tummy-tuck, liposuction, ivf, eye-surgery, oncology, orthopedics

Sub-categories under dental: dental-implants, dental-veneers, hollywood-smile, full-mouth-restoration

### Lead Form Templates

Per category, per locale (13 locales: en, de, nl, ar, pl, ru, fr, es, ro, no, kk, az, uz):
- 1 WhatsApp question (required, auto-bypass)
- 1 timing question (multiple choice: "In 1-2 months", "In 3-6 months", "Not sure yet")
- 1-2 category-specific questions (varies)

Total: ~200+ template rows

### Disclaimer Texts (13 languages)

Full İhracatçılar Birliği disclaimer in: de, en, fr, nl, ar, pl, ru, es, ro, no, kk, az, uz

### Knowledge Rules (6)

Migrated from current policy-checker.ts with message templates supporting `{variable}` interpolation.

---

## 6. Integration Points

### Campaign Wizard (existing)
- Step 1: Treatment category dropdown → populated from `getCategories()`
- Step 2: Country multi-select → populated from `getCountries()`, EK-53 badge shown, incentive rate auto-calculated
- Step 4: Lead form questions → auto-suggested from `getTemplatesForCategory(slug, locale)`
- Step 5: Policy check → `checkCampaignPolicies()` now async, pulls from knowledge layer

### Publish Route (existing)
- `checkCampaignPolicies()` call updated to `await`

### Campaign Intelligence (future — Plan 5)
- Claude queries knowledge API routes to understand domain rules
- Country/treatment/template data available as structured context

---

## 7. Environment & Scripts

### New npm scripts in apps/web/package.json:
```json
{
  "db:seed-knowledge": "npx tsx scripts/seed-knowledge.ts"
}
```

### Seed behavior:
- Upsert (onConflictDoUpdate) — safe to re-run
- Logs count of inserted/updated rows per table
- Idempotent — running twice produces same result

### No new environment variables required.

---

## 8. Out of Scope (v1)

- Admin UI for editing knowledge data
- Knowledge versioning / audit trail
- AI-powered knowledge search (RAG)
- Performance analytics integration (which categories convert best)
- Automatic disclaimer text generation
- Google Ads specific knowledge (separate plan)
