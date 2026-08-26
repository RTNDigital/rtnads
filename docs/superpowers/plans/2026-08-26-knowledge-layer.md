# Knowledge Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a structured knowledge layer with country metadata, treatment categories, expanded seed data, query modules with caching, API routes, and refactor policy-checker to use DB-driven data instead of hardcoded arrays.

**Architecture:** Extends existing knowledge tables (`incentiveCountries`, `agencyDisclaimers`, `platformRules`, `leadFormTemplates`) with two new tables (`countries`, `treatmentCategories`). Adds `lib/knowledge/` query layer with in-memory caching. Refactors policy-checker.ts to async DB-driven checks.

**Tech Stack:** Drizzle ORM, Neon PostgreSQL, Next.js 16.3.2 API routes, TypeScript

**Spec:** `docs/superpowers/specs/2026-08-26-knowledge-layer-design.md`

## Global Constraints

- All new tables use Drizzle's `pgTable` from `drizzle-orm/pg-core`
- Schema file: `apps/web/lib/db/schema/knowledge.ts` (append to existing)
- No test framework — verify with `npx tsc --noEmit --pretty`
- Schema changes applied via `npx drizzle-kit push` (not migrations)
- Seed must be idempotent (safe to re-run via `onConflictDoUpdate` or delete-then-insert)
- All knowledge modules use shared in-memory cache with 1-hour TTL
- API routes require auth via `import { auth } from "@/lib/auth"`
- Import DB as `import { db } from "@/lib/db"`
- Existing tables (`platformRules`, `incentiveCountries`, `agencyDisclaimers`, `leadFormTemplates`) remain unchanged in schema — only seed data expands

---

### Task 1: Add `countries` and `treatmentCategories` Tables

**Files:**
- Modify: `apps/web/lib/db/schema/knowledge.ts`

**Interfaces:**
- Produces: `countries` table export, `treatmentCategories` table export — used by Task 2 query modules and Task 3 seed script

- [ ] **Step 1: Add `countries` table to knowledge.ts**

Append after existing table definitions:

```typescript
export const countries = pgTable("countries", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  nameLocal: text("name_local"),
  continent: text("continent", {
    enum: ["europe", "asia", "africa", "americas", "oceania", "middle_east"],
  }).notNull(),
  language: text("language").notNull(),
  languageName: text("language_name").notNull(),
  currency: text("currency").default("USD"),
  isEk53: boolean("is_ek53").default(false).notNull(),
  incentiveRate: integer("incentive_rate").default(50).notNull(),
  hasWhatsAppOptimization: boolean("has_whatsapp_optimization").default(true).notNull(),
  isEU: boolean("is_eu").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

- [ ] **Step 2: Add `treatmentCategories` table to knowledge.ts**

Append after `countries`:

```typescript
export const treatmentCategories = pgTable("treatment_categories", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  parentSlug: text("parent_slug"),
  description: text("description"),
  keywords: jsonb("keywords").$type<string[]>().default([]),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

Note: `parentSlug` is a plain text column (not a self-referencing FK) because Drizzle's `pgTable` does not allow a table to reference itself in the same declaration. The relationship is enforced in application code.

- [ ] **Step 3: Verify tsc compiles**

Run: `cd apps/web && npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 4: Push schema to DB**

Run: `cd apps/web && npx drizzle-kit push`
Expected: Two new tables created

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/db/schema/knowledge.ts
git commit -m "feat: add countries and treatmentCategories tables to knowledge schema"
```

---

### Task 2: Knowledge Query Layer with Cache

**Files:**
- Create: `apps/web/lib/knowledge/cache.ts`
- Create: `apps/web/lib/knowledge/countries.ts`
- Create: `apps/web/lib/knowledge/treatments.ts`
- Create: `apps/web/lib/knowledge/lead-templates.ts`
- Create: `apps/web/lib/knowledge/disclaimers.ts`
- Create: `apps/web/lib/knowledge/rules.ts`
- Create: `apps/web/lib/knowledge/index.ts`

**Interfaces:**
- Consumes: `countries`, `treatmentCategories`, `leadFormTemplates`, `agencyDisclaimers`, `platformRules` from `@/lib/db/schema`
- Produces: All exported query functions — used by Task 4 API routes and Task 5 policy-checker refactor

- [ ] **Step 1: Create cache wrapper**

```typescript
// apps/web/lib/knowledge/cache.ts
const TTL = 60 * 60 * 1000;
const store = new Map<string, { data: unknown; expiry: number }>();

export async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const entry = store.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data as T;
  const data = await fetcher();
  store.set(key, { data, expiry: Date.now() + TTL });
  return data;
}

export function invalidateCache(key?: string) {
  if (key) store.delete(key);
  else store.clear();
}
```

- [ ] **Step 2: Create countries module**

```typescript
// apps/web/lib/knowledge/countries.ts
import { db } from "@/lib/db";
import { countries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { cached } from "./cache";

type Country = typeof countries.$inferSelect;

export async function getCountries(): Promise<Country[]> {
  return cached("countries:all", () => db.select().from(countries));
}

export async function getCountry(code: string): Promise<Country | undefined> {
  const all = await getCountries();
  return all.find((c) => c.code === code);
}

export async function getEk53Countries(): Promise<Country[]> {
  const all = await getCountries();
  return all.filter((c) => c.isEk53);
}

export async function getEUCountries(): Promise<Country[]> {
  const all = await getCountries();
  return all.filter((c) => c.isEU);
}

export async function getByContinent(continent: string): Promise<Country[]> {
  const all = await getCountries();
  return all.filter((c) => c.continent === continent);
}

export async function getByLanguage(lang: string): Promise<Country[]> {
  const all = await getCountries();
  return all.filter((c) => c.language === lang);
}
```

- [ ] **Step 3: Create treatments module**

```typescript
// apps/web/lib/knowledge/treatments.ts
import { db } from "@/lib/db";
import { treatmentCategories } from "@/lib/db/schema";
import { cached } from "./cache";

type TreatmentCategory = typeof treatmentCategories.$inferSelect;

export interface CategoryTreeNode extends TreatmentCategory {
  children: CategoryTreeNode[];
}

export async function getCategories(): Promise<TreatmentCategory[]> {
  return cached("treatments:all", () =>
    db.select().from(treatmentCategories).orderBy(treatmentCategories.sortOrder)
  );
}

export async function getCategory(slug: string): Promise<TreatmentCategory | undefined> {
  const all = await getCategories();
  return all.find((c) => c.slug === slug);
}

export async function getCategoryTree(): Promise<CategoryTreeNode[]> {
  const all = await getCategories();
  const map = new Map<string, CategoryTreeNode>();
  const roots: CategoryTreeNode[] = [];

  for (const cat of all) {
    map.set(cat.slug, { ...cat, children: [] });
  }

  for (const node of map.values()) {
    if (node.parentSlug && map.has(node.parentSlug)) {
      map.get(node.parentSlug)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
```

- [ ] **Step 4: Create lead-templates module**

```typescript
// apps/web/lib/knowledge/lead-templates.ts
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
```

- [ ] **Step 5: Create disclaimers module**

```typescript
// apps/web/lib/knowledge/disclaimers.ts
import { db } from "@/lib/db";
import { agencyDisclaimers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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
```

- [ ] **Step 6: Create rules module**

```typescript
// apps/web/lib/knowledge/rules.ts
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
```

- [ ] **Step 7: Create barrel index**

```typescript
// apps/web/lib/knowledge/index.ts
export { getCountries, getCountry, getEk53Countries, getEUCountries, getByContinent, getByLanguage } from "./countries";
export { getCategories, getCategory, getCategoryTree } from "./treatments";
export type { CategoryTreeNode } from "./treatments";
export { getTemplatesForCategory, getAllTemplates } from "./lead-templates";
export { getDisclaimer, getAllDisclaimers } from "./disclaimers";
export { getActiveRules, getRuleByType } from "./rules";
export { invalidateCache } from "./cache";
```

- [ ] **Step 8: Verify tsc compiles**

Run: `cd apps/web && npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/knowledge/
git commit -m "feat: add knowledge query layer with in-memory cache"
```

---

### Task 3: Expanded Seed Data

**Files:**
- Modify: `apps/web/lib/db/seed.ts`

**Interfaces:**
- Consumes: `countries`, `treatmentCategories`, `agencyDisclaimers`, `leadFormTemplates` from schema
- Produces: Populated DB tables — used by Task 4 API routes and Task 5 policy-checker

- [ ] **Step 1: Add countries seed data**

Add this array before the existing `ek53Countries` array in seed.ts. This replaces the old `ek53Countries` insert logic with the new `countries` table:

```typescript
const countriesSeed = [
  // EK-53 countries (70% incentive)
  { code: "DE", name: "Germany", nameLocal: "Deutschland", continent: "europe" as const, language: "de", languageName: "German", currency: "EUR", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: false, isEU: true },
  { code: "US", name: "United States", nameLocal: null, continent: "americas" as const, language: "en", languageName: "English", currency: "USD", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: true, isEU: false },
  { code: "AZ", name: "Azerbaijan", nameLocal: "Azərbaycan", continent: "asia" as const, language: "az", languageName: "Azerbaijani", currency: "AZN", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: true, isEU: false },
  { code: "AE", name: "United Arab Emirates", nameLocal: "الإمارات العربية المتحدة", continent: "middle_east" as const, language: "ar", languageName: "Arabic", currency: "AED", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: true, isEU: false },
  { code: "GB", name: "United Kingdom", nameLocal: null, continent: "europe" as const, language: "en", languageName: "English", currency: "GBP", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: false, isEU: false },
  { code: "FR", name: "France", nameLocal: "France", continent: "europe" as const, language: "fr", languageName: "French", currency: "EUR", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: false, isEU: true },
  { code: "IE", name: "Ireland", nameLocal: "Éire", continent: "europe" as const, language: "en", languageName: "English", currency: "EUR", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: false, isEU: true },
  { code: "ES", name: "Spain", nameLocal: "España", continent: "europe" as const, language: "es", languageName: "Spanish", currency: "EUR", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: false, isEU: true },
  { code: "CA", name: "Canada", nameLocal: null, continent: "americas" as const, language: "en", languageName: "English", currency: "CAD", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: true, isEU: false },
  { code: "QA", name: "Qatar", nameLocal: "قطر", continent: "middle_east" as const, language: "ar", languageName: "Arabic", currency: "QAR", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: true, isEU: false },
  { code: "KZ", name: "Kazakhstan", nameLocal: "Қазақстан", continent: "asia" as const, language: "kk", languageName: "Kazakh", currency: "KZT", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: true, isEU: false },
  { code: "EG", name: "Egypt", nameLocal: "مصر", continent: "africa" as const, language: "ar", languageName: "Arabic", currency: "EGP", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: true, isEU: false },
  { code: "NG", name: "Nigeria", nameLocal: null, continent: "africa" as const, language: "en", languageName: "English", currency: "NGN", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: true, isEU: false },
  { code: "NO", name: "Norway", nameLocal: "Norge", continent: "europe" as const, language: "no", languageName: "Norwegian", currency: "NOK", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: false, isEU: false },
  { code: "UZ", name: "Uzbekistan", nameLocal: "Oʻzbekiston", continent: "asia" as const, language: "uz", languageName: "Uzbek", currency: "UZS", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: true, isEU: false },
  { code: "PL", name: "Poland", nameLocal: "Polska", continent: "europe" as const, language: "pl", languageName: "Polish", currency: "PLN", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: false, isEU: true },
  { code: "RO", name: "Romania", nameLocal: "România", continent: "europe" as const, language: "ro", languageName: "Romanian", currency: "RON", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: false, isEU: true },
  { code: "RU", name: "Russia", nameLocal: "Россия", continent: "europe" as const, language: "ru", languageName: "Russian", currency: "RUB", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: true, isEU: false },
  { code: "SN", name: "Senegal", nameLocal: "Sénégal", continent: "africa" as const, language: "fr", languageName: "French", currency: "XOF", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: true, isEU: false },
  { code: "SA", name: "Saudi Arabia", nameLocal: "المملكة العربية السعودية", continent: "middle_east" as const, language: "ar", languageName: "Arabic", currency: "SAR", isEk53: true, incentiveRate: 70, hasWhatsAppOptimization: true, isEU: false },
  // Non-EK-53 health tourism markets (50% incentive)
  { code: "NL", name: "Netherlands", nameLocal: "Nederland", continent: "europe" as const, language: "nl", languageName: "Dutch", currency: "EUR", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "BE", name: "Belgium", nameLocal: "België", continent: "europe" as const, language: "nl", languageName: "Dutch", currency: "EUR", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "AT", name: "Austria", nameLocal: "Österreich", continent: "europe" as const, language: "de", languageName: "German", currency: "EUR", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "SE", name: "Sweden", nameLocal: "Sverige", continent: "europe" as const, language: "en", languageName: "English", currency: "SEK", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "IT", name: "Italy", nameLocal: "Italia", continent: "europe" as const, language: "it", languageName: "Italian", currency: "EUR", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "CH", name: "Switzerland", nameLocal: "Schweiz", continent: "europe" as const, language: "de", languageName: "German", currency: "CHF", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: false },
  { code: "IQ", name: "Iraq", nameLocal: "العراق", continent: "middle_east" as const, language: "ar", languageName: "Arabic", currency: "IQD", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: true, isEU: false },
  { code: "KW", name: "Kuwait", nameLocal: "الكويت", continent: "middle_east" as const, language: "ar", languageName: "Arabic", currency: "KWD", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: true, isEU: false },
  { code: "LY", name: "Libya", nameLocal: "ليبيا", continent: "africa" as const, language: "ar", languageName: "Arabic", currency: "LYD", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: true, isEU: false },
  { code: "AU", name: "Australia", nameLocal: null, continent: "oceania" as const, language: "en", languageName: "English", currency: "AUD", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: true, isEU: false },
  { code: "DK", name: "Denmark", nameLocal: "Danmark", continent: "europe" as const, language: "en", languageName: "English", currency: "DKK", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "FI", name: "Finland", nameLocal: "Suomi", continent: "europe" as const, language: "en", languageName: "English", currency: "EUR", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "GR", name: "Greece", nameLocal: "Ελλάδα", continent: "europe" as const, language: "en", languageName: "English", currency: "EUR", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "CZ", name: "Czech Republic", nameLocal: "Česko", continent: "europe" as const, language: "en", languageName: "English", currency: "CZK", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "HU", name: "Hungary", nameLocal: "Magyarország", continent: "europe" as const, language: "en", languageName: "English", currency: "HUF", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "BG", name: "Bulgaria", nameLocal: "България", continent: "europe" as const, language: "en", languageName: "English", currency: "BGN", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "HR", name: "Croatia", nameLocal: "Hrvatska", continent: "europe" as const, language: "en", languageName: "English", currency: "EUR", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: false, isEU: true },
  { code: "BA", name: "Bosnia and Herzegovina", nameLocal: "Bosna i Hercegovina", continent: "europe" as const, language: "en", languageName: "English", currency: "BAM", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: true, isEU: false },
  { code: "KG", name: "Kyrgyzstan", nameLocal: "Кыргызстан", continent: "asia" as const, language: "ru", languageName: "Russian", currency: "KGS", isEk53: false, incentiveRate: 50, hasWhatsAppOptimization: true, isEU: false },
];
```

- [ ] **Step 2: Add treatment categories seed data**

```typescript
const treatmentCategoriesSeed = [
  { slug: "rhinoplasty", name: "Rhinoplasty", parentSlug: null, description: "Nose reshaping surgery", keywords: ["nose job", "nose surgery", "burun estetiği"], sortOrder: 1 },
  { slug: "dental", name: "Dental", parentSlug: null, description: "Dental treatments and cosmetic dentistry", keywords: ["teeth", "dental care", "diş"], sortOrder: 2 },
  { slug: "dental-implants", name: "Dental Implants", parentSlug: "dental", description: "Tooth replacement with implants", keywords: ["implant", "tooth implant"], sortOrder: 3 },
  { slug: "dental-veneers", name: "Dental Veneers", parentSlug: "dental", description: "Porcelain or composite veneers", keywords: ["veneers", "porcelain"], sortOrder: 4 },
  { slug: "hollywood-smile", name: "Hollywood Smile", parentSlug: "dental", description: "Complete smile makeover", keywords: ["smile design", "smile makeover"], sortOrder: 5 },
  { slug: "full-mouth-restoration", name: "Full Mouth Restoration", parentSlug: "dental", description: "Complete dental reconstruction", keywords: ["full mouth", "restoration"], sortOrder: 6 },
  { slug: "facelift", name: "Facelift", parentSlug: null, description: "Facial rejuvenation surgery", keywords: ["face lift", "yüz germe"], sortOrder: 7 },
  { slug: "eyelid-surgery", name: "Eyelid Surgery", parentSlug: null, description: "Blepharoplasty — upper and lower eyelid surgery", keywords: ["blepharoplasty", "göz kapağı"], sortOrder: 8 },
  { slug: "bariatric", name: "Bariatric Surgery", parentSlug: null, description: "Weight loss surgery", keywords: ["gastric sleeve", "gastric bypass", "obesity", "mide küçültme"], sortOrder: 9 },
  { slug: "mommy-makeover", name: "Mommy Makeover", parentSlug: null, description: "Combined post-pregnancy body restoration", keywords: ["tummy tuck", "breast lift", "mommy"], sortOrder: 10 },
  { slug: "hair-transplant", name: "Hair Transplant", parentSlug: null, description: "FUE and DHI hair restoration", keywords: ["hair loss", "fue", "dhi", "saç ekimi"], sortOrder: 11 },
  { slug: "bbl", name: "BBL (Brazilian Butt Lift)", parentSlug: null, description: "Fat transfer buttock augmentation", keywords: ["butt lift", "fat transfer"], sortOrder: 12 },
  { slug: "breast-augmentation", name: "Breast Augmentation", parentSlug: null, description: "Breast implants or fat transfer", keywords: ["breast implant", "augmentation"], sortOrder: 13 },
  { slug: "tummy-tuck", name: "Tummy Tuck", parentSlug: null, description: "Abdominoplasty", keywords: ["abdominoplasty", "karın germe"], sortOrder: 14 },
  { slug: "liposuction", name: "Liposuction", parentSlug: null, description: "Fat removal surgery", keywords: ["lipo", "fat removal", "liposuction"], sortOrder: 15 },
  { slug: "ivf", name: "IVF", parentSlug: null, description: "In vitro fertilization", keywords: ["fertility", "tüp bebek"], sortOrder: 16 },
  { slug: "eye-surgery", name: "Eye Surgery", parentSlug: null, description: "LASIK and other vision correction", keywords: ["lasik", "eye", "göz"], sortOrder: 17 },
  { slug: "oncology", name: "Oncology", parentSlug: null, description: "Cancer treatment", keywords: ["cancer", "onkoloji"], sortOrder: 18 },
  { slug: "orthopedics", name: "Orthopedics", parentSlug: null, description: "Joint replacement and bone surgery", keywords: ["knee", "hip", "joint", "ortopedi"], sortOrder: 19 },
];
```

- [ ] **Step 3: Expand disclaimer texts to 13 languages**

Replace the existing 2-language `disclaimers` array with:

```typescript
const disclaimersSeed = [
  { locale: "de", disclaimerText: "Die Behandlungen werden in einer vertraglich verbundenen Gesundheitseinrichtung durchgeführt, die über eine offizielle Genehmigung für internationalen Gesundheitstourismus verfügt." },
  { locale: "en", disclaimerText: "Treatments are performed at a contractually affiliated healthcare facility that holds an official authorization for international health tourism." },
  { locale: "fr", disclaimerText: "Les traitements sont effectués dans un établissement de santé contractuellement affilié, disposant d'une autorisation officielle pour le tourisme médical international." },
  { locale: "nl", disclaimerText: "Behandelingen worden uitgevoerd in een contractueel verbonden zorginstelling die beschikt over een officiële vergunning voor internationaal gezondheidstoerisme." },
  { locale: "ar", disclaimerText: "يتم إجراء العلاجات في منشأة صحية متعاقدة تحمل ترخيصاً رسمياً للسياحة الصحية الدولية." },
  { locale: "pl", disclaimerText: "Zabiegi wykonywane są w placówce medycznej powiązanej umową, posiadającej oficjalne zezwolenie na międzynarodową turystykę zdrowotną." },
  { locale: "ru", disclaimerText: "Лечение проводится в медицинском учреждении, связанном договором, которое имеет официальное разрешение на международный медицинский туризм." },
  { locale: "es", disclaimerText: "Los tratamientos se realizan en un centro sanitario contractualmente afiliado que cuenta con una autorización oficial para el turismo sanitario internacional." },
  { locale: "ro", disclaimerText: "Tratamentele sunt efectuate într-o unitate medicală afiliată contractual, care deține o autorizație oficială pentru turism medical internațional." },
  { locale: "no", disclaimerText: "Behandlingene utføres ved en kontraktsmessig tilknyttet helseinstitusjon som har offisiell godkjenning for internasjonal helseturisme." },
  { locale: "kk", disclaimerText: "Емдеу халықаралық денсаулық туризміне ресми рұқсаты бар шарттық негізде байланысқан денсаулық сақтау мекемесінде жүргізіледі." },
  { locale: "az", disclaimerText: "Müalicələr beynəlxalq sağlamlıq turizmi üçün rəsmi icazəsi olan müqavilə ilə əlaqəli səhiyyə müəssisəsində həyata keçirilir." },
  { locale: "uz", disclaimerText: "Davolanish xalqaro sog'liqni saqlash turizmi uchun rasmiy ruxsatga ega bo'lgan shartnoma asosida bog'langan sog'liqni saqlash muassasasida amalga oshiriladi." },
];
```

- [ ] **Step 4: Expand lead form templates to cover major categories × 6 primary locales**

Replace the existing 3-template `templates` array. Each row stores all questions for one (category, locale) pair in the JSONB `questions` column — matching the existing schema:

```typescript
type QuestionDef = {
  type: "short_answer" | "multiple_choice";
  text: string;
  required: boolean;
  options?: string[];
};

function makeTemplates(
  category: string,
  localeQuestions: Record<string, QuestionDef[]>,
): { treatmentCategory: string; locale: string; questions: QuestionDef[] }[] {
  return Object.entries(localeQuestions).map(([locale, questions]) => ({
    treatmentCategory: category,
    locale,
    questions,
  }));
}

const whatsApp = (locale: string): QuestionDef => {
  const texts: Record<string, string> = {
    en: "Share your Whats.App number so we can reach you:",
    de: "Teilen Sie Ihre Whats.App-Nummer, damit wir Sie erreichen können:",
    nl: "Deel uw Whats.App-nummer zodat we u kunnen bereiken:",
    ar: "شارك رقم Whats.App الخاص بك حتى نتمكن من الوصول إليك:",
    pl: "Podaj swój numer Whats.App, abyśmy mogli się z Tobą skontaktować:",
    ru: "Поделитесь своим номером Whats.App, чтобы мы могли с вами связаться:",
    fr: "Partagez votre numéro Whats.App pour que nous puissions vous contacter :",
    es: "Comparta su número de Whats.App para que podamos contactarle:",
    ro: "Împărtășiți numărul dvs. de Whats.App pentru a vă putea contacta:",
    no: "Del Whats.App-nummeret ditt slik at vi kan nå deg:",
    kk: "Whats.App нөміріңізді бөлісіңіз, біз сізбен хабарласа аламыз:",
    az: "Sizinlə əlaqə saxlaya bilmək üçün Whats.App nömrənizi paylaşın:",
    uz: "Biz siz bilan bog'lanishimiz uchun Whats.App raqamingizni yuboring:",
  };
  return { type: "short_answer", text: texts[locale] || texts.en, required: true };
};

const timing = (locale: string): QuestionDef => {
  const data: Record<string, { text: string; options: string[] }> = {
    en: { text: "When are you planning to visit Turkey?", options: ["In 1-3 months", "In 3-6 months", "6+ months", "Not sure yet"] },
    de: { text: "Wann planen Sie, die Türkei zu besuchen?", options: ["In 1-3 Monaten", "In 3-6 Monaten", "6+ Monate", "Noch nicht sicher"] },
    nl: { text: "Wanneer bent u van plan Turkije te bezoeken?", options: ["Over 1-3 maanden", "Over 3-6 maanden", "6+ maanden", "Nog niet zeker"] },
    ar: { text: "متى تخطط لزيارة تركيا؟", options: ["خلال 1-3 أشهر", "خلال 3-6 أشهر", "أكثر من 6 أشهر", "لست متأكداً بعد"] },
    pl: { text: "Kiedy planujesz odwiedzić Turcję?", options: ["Za 1-3 miesiące", "Za 3-6 miesięcy", "6+ miesięcy", "Jeszcze nie wiem"] },
    ru: { text: "Когда вы планируете посетить Турцию?", options: ["Через 1-3 месяца", "Через 3-6 месяцев", "Более 6 месяцев", "Пока не уверен(а)"] },
    fr: { text: "Quand prévoyez-vous de visiter la Turquie ?", options: ["Dans 1-3 mois", "Dans 3-6 mois", "6+ mois", "Pas encore sûr(e)"] },
    es: { text: "¿Cuándo planea visitar Turquía?", options: ["En 1-3 meses", "En 3-6 meses", "6+ meses", "Aún no estoy seguro/a"] },
    ro: { text: "Când intenționați să vizitați Turcia?", options: ["În 1-3 luni", "În 3-6 luni", "6+ luni", "Nu sunt sigur(ă) încă"] },
    no: { text: "Når planlegger du å besøke Tyrkia?", options: ["Om 1-3 måneder", "Om 3-6 måneder", "6+ måneder", "Ikke sikker ennå"] },
    kk: { text: "Түркияға қашан барғыңыз келеді?", options: ["1-3 ай ішінде", "3-6 ай ішінде", "6+ ай", "Әлі белгісіз"] },
    az: { text: "Türkiyəyə nə vaxt getməyi planlaşdırırsınız?", options: ["1-3 ay ərzində", "3-6 ay ərzində", "6+ ay", "Hələ bilmirəm"] },
    uz: { text: "Turkiyaga qachon tashrif buyurishni rejalashtirmoqdasiz?", options: ["1-3 oy ichida", "3-6 oy ichida", "6+ oy", "Hali aniq emas"] },
  };
  const d = data[locale] || data.en;
  return { type: "multiple_choice", text: d.text, required: true, options: d.options };
};

const LOCALES = ["en", "de", "nl", "ar", "pl", "ru", "fr", "es", "ro", "no", "kk", "az", "uz"];

function localized(textsByLocale: Record<string, QuestionDef[]>): Record<string, QuestionDef[]> {
  const result: Record<string, QuestionDef[]> = {};
  for (const locale of LOCALES) {
    const categoryQ = textsByLocale[locale] || textsByLocale.en;
    result[locale] = [whatsApp(locale), ...categoryQ, timing(locale)];
  }
  return result;
}

const templatesSeed = [
  ...makeTemplates("rhinoplasty", localized({
    en: [{ type: "multiple_choice", text: "What type of nose do you prefer?", required: true, options: ["Natural", "Barbie", "Half Barbie / Half Natural"] }],
    de: [{ type: "multiple_choice", text: "Welchen Nasentyp bevorzugen Sie?", required: true, options: ["Natürlich", "Barbie", "Halb Barbie / Halb Natürlich"] }],
    nl: [{ type: "multiple_choice", text: "Welk type neus heeft uw voorkeur?", required: true, options: ["Natuurlijk", "Barbie", "Half Barbie / Half Natuurlijk"] }],
    ar: [{ type: "multiple_choice", text: "ما نوع الأنف الذي تفضله؟", required: true, options: ["طبيعي", "باربي", "نصف باربي / نصف طبيعي"] }],
    pl: [{ type: "multiple_choice", text: "Jaki typ nosa preferujesz?", required: true, options: ["Naturalny", "Barbie", "Pół Barbie / Pół Naturalny"] }],
    ru: [{ type: "multiple_choice", text: "Какой тип носа вы предпочитаете?", required: true, options: ["Натуральный", "Барби", "Полу-Барби / Полу-Натуральный"] }],
  })),
  ...makeTemplates("dental", localized({
    en: [{ type: "multiple_choice", text: "Which treatment are you interested in?", required: true, options: ["Dental Implants", "Veneers", "Crowns", "Smile Makeover", "Other"] }],
    de: [{ type: "multiple_choice", text: "Für welche Behandlung interessieren Sie sich?", required: true, options: ["Zahnimplantate", "Veneers", "Kronen", "Smile Makeover", "Andere"] }],
    nl: [{ type: "multiple_choice", text: "In welke behandeling bent u geïnteresseerd?", required: true, options: ["Tandimplantaten", "Veneers", "Kronen", "Smile Makeover", "Anders"] }],
    ar: [{ type: "multiple_choice", text: "ما العلاج الذي تهتم به؟", required: true, options: ["زراعة أسنان", "فينير", "تيجان", "تجميل الابتسامة", "أخرى"] }],
    pl: [{ type: "multiple_choice", text: "Jakim zabiegiem jesteś zainteresowany/a?", required: true, options: ["Implanty dentystyczne", "Licówki", "Korony", "Metamorfoza uśmiechu", "Inne"] }],
    ru: [{ type: "multiple_choice", text: "Какая процедура вас интересует?", required: true, options: ["Зубные импланты", "Виниры", "Коронки", "Дизайн улыбки", "Другое"] }],
  })),
  ...makeTemplates("bariatric", localized({
    en: [{ type: "multiple_choice", text: "Which procedure are you interested in?", required: true, options: ["Gastric Sleeve", "Gastric Bypass", "Gastric Balloon", "Not sure yet"] }],
    de: [{ type: "multiple_choice", text: "Für welchen Eingriff interessieren Sie sich?", required: true, options: ["Schlauchmagen", "Magenbypass", "Magenballon", "Noch nicht sicher"] }],
    nl: [{ type: "multiple_choice", text: "In welke ingreep bent u geïnteresseerd?", required: true, options: ["Maagverkleining", "Maagbypass", "Maagballon", "Nog niet zeker"] }],
    ar: [{ type: "multiple_choice", text: "ما الإجراء الذي تهتم به؟", required: true, options: ["تكميم المعدة", "تحويل مسار المعدة", "بالون المعدة", "لست متأكداً بعد"] }],
    pl: [{ type: "multiple_choice", text: "Jaki zabieg Cię interesuje?", required: true, options: ["Rękaw żołądkowy", "Bypass żołądkowy", "Balon żołądkowy", "Jeszcze nie wiem"] }],
    ru: [{ type: "multiple_choice", text: "Какая процедура вас интересует?", required: true, options: ["Рукавная гастрэктомия", "Желудочное шунтирование", "Желудочный баллон", "Пока не уверен(а)"] }],
  })),
  ...makeTemplates("hair-transplant", localized({
    en: [{ type: "multiple_choice", text: "Which method do you prefer?", required: true, options: ["FUE", "DHI", "Not sure — need consultation"] }],
    de: [{ type: "multiple_choice", text: "Welche Methode bevorzugen Sie?", required: true, options: ["FUE", "DHI", "Nicht sicher — Beratung gewünscht"] }],
    nl: [{ type: "multiple_choice", text: "Welke methode heeft uw voorkeur?", required: true, options: ["FUE", "DHI", "Niet zeker — consultatie gewenst"] }],
    ar: [{ type: "multiple_choice", text: "ما الطريقة التي تفضلها؟", required: true, options: ["FUE", "DHI", "غير متأكد — أحتاج استشارة"] }],
    pl: [{ type: "multiple_choice", text: "Jaką metodę preferujesz?", required: true, options: ["FUE", "DHI", "Nie jestem pewien — potrzebuję konsultacji"] }],
    ru: [{ type: "multiple_choice", text: "Какой метод вы предпочитаете?", required: true, options: ["FUE", "DHI", "Не уверен(а) — нужна консультация"] }],
  })),
  ...makeTemplates("breast-augmentation", localized({
    en: [{ type: "multiple_choice", text: "Which option are you considering?", required: true, options: ["Silicone Implants", "Fat Transfer", "Not sure yet"] }],
    de: [{ type: "multiple_choice", text: "Welche Option erwägen Sie?", required: true, options: ["Silikonimplantate", "Eigenfettunterspritzung", "Noch nicht sicher"] }],
  })),
  ...makeTemplates("facelift", localized({
    en: [{ type: "multiple_choice", text: "What is your main concern?", required: true, options: ["Sagging skin", "Wrinkles", "Jawline definition", "Overall rejuvenation"] }],
    de: [{ type: "multiple_choice", text: "Was ist Ihr Hauptanliegen?", required: true, options: ["Hängende Haut", "Falten", "Kieferlinie", "Gesamtverjüngung"] }],
  })),
  ...makeTemplates("eyelid-surgery", localized({
    en: [{ type: "multiple_choice", text: "Which area would you like to treat?", required: true, options: ["Upper eyelids", "Lower eyelids", "Both"] }],
    de: [{ type: "multiple_choice", text: "Welchen Bereich möchten Sie behandeln lassen?", required: true, options: ["Oberlider", "Unterlider", "Beide"] }],
  })),
  ...makeTemplates("bbl", localized({
    en: [{ type: "multiple_choice", text: "Have you had liposuction before?", required: true, options: ["Yes", "No", "Not sure"] }],
  })),
  ...makeTemplates("mommy-makeover", localized({
    en: [{ type: "multiple_choice", text: "Which procedures are you interested in?", required: true, options: ["Tummy Tuck + Breast Lift", "Tummy Tuck + Breast Augmentation", "Liposuction + Breast Lift", "Full Mommy Makeover"] }],
    de: [{ type: "multiple_choice", text: "Welche Eingriffe interessieren Sie?", required: true, options: ["Bauchstraffung + Bruststraffung", "Bauchstraffung + Brustvergrößerung", "Fettabsaugung + Bruststraffung", "Komplettes Mommy Makeover"] }],
  })),
  ...makeTemplates("tummy-tuck", localized({
    en: [{ type: "multiple_choice", text: "Is this your first cosmetic surgery?", required: true, options: ["Yes", "No — I've had procedures before"] }],
  })),
  ...makeTemplates("ivf", localized({
    en: [{ type: "multiple_choice", text: "Have you tried IVF before?", required: true, options: ["No — first time", "Yes — 1 attempt", "Yes — 2+ attempts"] }],
    de: [{ type: "multiple_choice", text: "Haben Sie schon einmal IVF versucht?", required: true, options: ["Nein — erstes Mal", "Ja — 1 Versuch", "Ja — 2+ Versuche"] }],
  })),
];
```

- [ ] **Step 5: Rewrite seed function to include new tables**

Replace the existing `seed()` function body. Keep the existing `ek53Countries`, `rules` inserts (for `incentiveCountries` and `platformRules` backward compatibility), and add the new tables:

```typescript
async function seed() {
  console.log("Seeding knowledge base...");

  // 1. Seed countries table (new)
  for (const country of countriesSeed) {
    await db.insert(schema.countries).values(country)
      .onConflictDoUpdate({
        target: schema.countries.code,
        set: { ...country },
      });
  }
  console.log(`Seeded ${countriesSeed.length} countries`);

  // 2. Seed treatment categories (new)
  for (const cat of treatmentCategoriesSeed) {
    await db.insert(schema.treatmentCategories).values(cat)
      .onConflictDoUpdate({
        target: schema.treatmentCategories.slug,
        set: { ...cat },
      });
  }
  console.log(`Seeded ${treatmentCategoriesSeed.length} treatment categories`);

  // 3. Seed disclaimers (expanded)
  for (const d of disclaimersSeed) {
    await db.insert(schema.agencyDisclaimers).values(d)
      .onConflictDoUpdate({
        target: schema.agencyDisclaimers.locale,
        set: { disclaimerText: d.disclaimerText },
      });
  }
  console.log(`Seeded ${disclaimersSeed.length} disclaimer translations`);

  // 4. Seed lead form templates (expanded)
  await db.delete(schema.leadFormTemplates);
  for (const t of templatesSeed) {
    await db.insert(schema.leadFormTemplates).values(t);
  }
  console.log(`Seeded ${templatesSeed.length} lead form templates`);

  // 5. Keep existing incentiveCountries and platformRules seeds
  const queries = [
    ...ek53Countries.map((country) =>
      db.insert(schema.incentiveCountries).values(country).onConflictDoNothing()
    ),
    db.delete(schema.platformRules),
    ...rules.map((rule) => db.insert(schema.platformRules).values(rule)),
  ] as unknown as Parameters<typeof db.batch>[0];
  await db.batch(queries);
  console.log(`Seeded ${ek53Countries.length} EK-53 incentive countries (legacy)`);
  console.log(`Seeded ${rules.length} platform rules`);

  console.log("Seed complete!");
}
```

- [ ] **Step 6: Verify tsc compiles**

Run: `cd apps/web && npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/db/seed.ts
git commit -m "feat: expand knowledge seed data — 40 countries, 19 categories, 13 locales"
```

---

### Task 4: Knowledge API Routes

**Files:**
- Create: `apps/web/app/api/knowledge/countries/route.ts`
- Create: `apps/web/app/api/knowledge/treatments/route.ts`
- Create: `apps/web/app/api/knowledge/templates/route.ts`
- Create: `apps/web/app/api/knowledge/disclaimers/route.ts`

**Interfaces:**
- Consumes: All query functions from `@/lib/knowledge`
- Produces: REST API endpoints for campaign wizard and future Campaign Intelligence

- [ ] **Step 1: Create countries route**

```typescript
// apps/web/app/api/knowledge/countries/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCountries, getEk53Countries, getEUCountries, getByContinent } from "@/lib/knowledge";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const ek53 = searchParams.get("ek53");
  const eu = searchParams.get("eu");
  const continent = searchParams.get("continent");

  if (ek53 === "true") {
    return NextResponse.json(await getEk53Countries());
  }
  if (eu === "true") {
    return NextResponse.json(await getEUCountries());
  }
  if (continent) {
    return NextResponse.json(await getByContinent(continent));
  }

  return NextResponse.json(await getCountries());
}
```

- [ ] **Step 2: Create treatments route**

```typescript
// apps/web/app/api/knowledge/treatments/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCategories, getCategoryTree } from "@/lib/knowledge";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tree = searchParams.get("tree");

  if (tree === "true") {
    return NextResponse.json(await getCategoryTree());
  }

  return NextResponse.json(await getCategories());
}
```

- [ ] **Step 3: Create templates route**

```typescript
// apps/web/app/api/knowledge/templates/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTemplatesForCategory, getAllTemplates } from "@/lib/knowledge";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const locale = searchParams.get("locale") || "en";

  if (category) {
    return NextResponse.json(await getTemplatesForCategory(category, locale));
  }

  return NextResponse.json(await getAllTemplates());
}
```

- [ ] **Step 4: Create disclaimers route**

```typescript
// apps/web/app/api/knowledge/disclaimers/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDisclaimer, getAllDisclaimers } from "@/lib/knowledge";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const locale = searchParams.get("locale");

  if (locale) {
    const text = await getDisclaimer(locale);
    if (!text) {
      return NextResponse.json({ error: "Disclaimer not found for locale" }, { status: 404 });
    }
    return NextResponse.json({ locale, text });
  }

  return NextResponse.json(await getAllDisclaimers());
}
```

- [ ] **Step 5: Verify tsc compiles**

Run: `cd apps/web && npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/knowledge/
git commit -m "feat: add knowledge API routes — countries, treatments, templates, disclaimers"
```

---

### Task 5: Policy Checker Refactor

**Files:**
- Modify: `apps/web/lib/meta/policy-checker.ts`
- Modify: `apps/web/app/api/meta/campaigns/[id]/publish/route.ts`

**Interfaces:**
- Consumes: `getEk53Countries`, `getEUCountries` from `@/lib/knowledge`
- Produces: `async checkCampaignPolicies()` — same return type, now async

- [ ] **Step 1: Refactor policy-checker.ts to async with knowledge layer**

Replace the entire file content:

```typescript
// apps/web/lib/meta/policy-checker.ts
import type { ClientType } from "@rtnads/shared";
import { getEk53Countries, getEUCountries } from "@/lib/knowledge";

export interface PolicyCheckResult {
  level: "blocker" | "warning" | "info";
  code: string;
  message: string;
  field?: string;
}

export interface CampaignDraft {
  adCopy?: string;
  headline?: string;
  description?: string;
  targetCountries: string[];
  adFormat?: string;
  leadFormQuestions?: { text: string }[];
  hasWhatsAppField?: boolean;
  hasDisclaimer?: boolean;
}

const TURKISH_CHARS = /[çğıöşüÇĞİÖŞÜ]/;
const TURKISH_WORDS = /\b(ve|bir|ile|için|olan|bu|da|de|den|dan|ne|nasıl|kadar|gibi|daha|çok|iyi|tedavi|sağlık|turizm|estetik|ameliyat)\b/i;

export async function checkCampaignPolicies(
  draft: CampaignDraft,
  clientType: ClientType,
): Promise<PolicyCheckResult[]> {
  const results: PolicyCheckResult[] = [];
  const allText = [draft.adCopy, draft.headline, draft.description]
    .filter(Boolean)
    .join(" ");
  const questionTexts = (draft.leadFormQuestions || []).map((q) => q.text).join(" ");
  const combinedText = `${allText} ${questionTexts}`;

  if (TURKISH_CHARS.test(combinedText) || TURKISH_WORDS.test(combinedText)) {
    results.push({
      level: "blocker",
      code: "TURKISH_TEXT",
      message: "Turkish text detected. Health tourism ads cannot contain Turkish content — incentive eligibility requires target-language or English copy.",
      field: "adCopy",
    });
  }

  const ek53Countries = await getEk53Countries();
  const ek53Names = ek53Countries.map((c) => c.name);
  const ek53Count = draft.targetCountries.filter((c) => ek53Names.includes(c)).length;
  const nonEk53Count = draft.targetCountries.length - ek53Count;
  if (draft.targetCountries.length > 0) {
    const rate = nonEk53Count === 0 ? 70 : ek53Count > 0 ? "50-70" : 50;
    results.push({
      level: "info",
      code: "EK53_INCENTIVE",
      message: `Incentive rate: ${rate}%. ${ek53Count} of ${draft.targetCountries.length} target countries are in the EK-53 list.`,
    });
  }

  if (clientType === "agency" && !draft.hasDisclaimer) {
    results.push({
      level: "blocker",
      code: "MANDATORY_DISCLAIMER",
      message: "Agency clients must include the mandatory disclaimer text from İhracatçılar Birliği in ad copy.",
      field: "adCopy",
    });
  }

  if (draft.adFormat === "lead_form" && !draft.hasWhatsAppField) {
    results.push({
      level: "blocker",
      code: "WHATSAPP_REQUIRED",
      message: "WhatsApp field is mandatory in all lead forms.",
      field: "leadForm",
    });
  }

  const euCountries = await getEUCountries();
  const euNames = euCountries.map((c) => c.name);
  const targetsEurope = draft.targetCountries.some((c) => euNames.includes(c));
  if (targetsEurope && draft.adFormat === "whatsapp") {
    results.push({
      level: "warning",
      code: "EUROPE_WHATSAPP",
      message: "WhatsApp conversation optimization is not available in European countries. Consider using a different ad format for EU targets.",
    });
  }

  if (targetsEurope) {
    results.push({
      level: "warning",
      code: "GDPR_NOTICE",
      message: "Targeting EU countries — ensure GDPR compliance in data collection and privacy policy.",
    });
  }

  return results;
}
```

- [ ] **Step 2: Update publish route to await policy check**

In `apps/web/app/api/meta/campaigns/[id]/publish/route.ts`, the `checkCampaignPolicies` call is already awaited or needs `await` added. Find the line that calls `checkCampaignPolicies` and ensure it has `await`:

```typescript
const policyResults = await checkCampaignPolicies(draft, client.type as ClientType);
```

If the import already exists, no change needed. Just ensure the `await` is present since the function is now async.

- [ ] **Step 3: Verify tsc compiles**

Run: `cd apps/web && npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/meta/policy-checker.ts apps/web/app/api/meta/campaigns/
git commit -m "refactor: policy-checker uses knowledge layer instead of hardcoded arrays"
```

---

### Task 6: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run tsc**

Run: `cd apps/web && npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 2: Run next build**

Run: `cd apps/web && npx next build`
Expected: Build succeeds, all routes compile including new `/api/knowledge/*` routes

- [ ] **Step 3: Push schema to DB**

Run: `cd apps/web && npx drizzle-kit push`
Expected: Schema synced, two new tables created (`countries`, `treatment_categories`)

- [ ] **Step 4: Run seed**

Run: `cd apps/web && npx tsx lib/db/seed.ts`
Expected: All tables seeded successfully with counts logged

- [ ] **Step 5: Verify seed results**

Run: `cd apps/web && npx drizzle-kit studio`
Check in Drizzle Studio that:
- `countries` has ~40 rows
- `treatment_categories` has ~19 rows
- `agency_disclaimers` has 13 rows
- `lead_form_templates` has ~130+ rows

- [ ] **Step 6: Commit any remaining changes**

If any fixes were needed, commit them.
