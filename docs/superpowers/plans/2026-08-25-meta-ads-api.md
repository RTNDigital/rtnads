# Meta Ads API Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full campaign management with Meta Marketing API v21.0 — create, edit, publish campaigns from RTNADS and bi-directionally sync existing active campaigns from Meta.

**Architecture:** Direct Next.js API Integration with `lib/meta/` client layer. System User Token for BM partnership access. Cron-based incremental sync. Lead webhook for real-time lead capture.

**Tech Stack:** Next.js 16.3.2, Drizzle ORM, Neon PostgreSQL, Meta Marketing API v21.0, Auth.js v5

**Spec:** `docs/superpowers/specs/2026-08-25-meta-ads-api-design.md`

## Global Constraints

- All Meta API calls are server-side only — never expose `META_SYSTEM_TOKEN` to client components.
- API routes require authenticated session via `auth()` from `@/lib/auth` — except the webhook route which validates via `X-Hub-Signature-256`.
- Role-based access: users with role `admin` or `manager` can publish campaigns. Role `junior` can create drafts but not publish.
- Use existing UI components from `@/components/ui/` (Button, Badge, Table, Card, Tabs, Select, Input, etc.) — follow patterns in `app/(dashboard)/clients/page.tsx`.
- Follow existing API route pattern from `app/api/clients/route.ts` — use `auth()` guard, return `NextResponse.json()`.
- Database uses Drizzle ORM with `@neondatabase/serverless` neon-http driver. Import `db` from `@/lib/db` and schemas from `@/lib/db/schema`.
- Shared types go in `packages/shared/src/index.ts` — re-export from there.
- Campaign statuses in RTNADS: `draft`, `pending_approval`, `approved`, `live`, `paused`, `rejected`. These map to Meta's `ACTIVE`/`PAUSED`/`ARCHIVED`.
- No Turkish text in ad copy — system must block campaigns with Turkish content (health tourism incentive requirement).
- WhatsApp field mandatory in all lead forms. Use "Whats.App" spelling to bypass Meta's filter.
- Agency-type clients must include mandatory disclaimer text in ad copy.
- EK-53 country list for 70% incentive: Almanya, ABD, Azerbaycan, BAE, Birleşik Krallık, Fransa, İrlanda, İspanya, Kanada, Katar, Kazakistan, Mısır, Nijerya, Norveç, Özbekistan, Polonya, Romanya, Rusya, Senegal, Suudi Arabistan. Others get 50%.
- `pnpm` package manager. Run commands from `apps/web/` directory.
- Commit after each task with descriptive commit message.

---

### Task 1: DB Schema Updates — leads, syncLogs, and Column Additions

**Files:**
- Modify: `apps/web/lib/db/schema/meta.ts`
- Modify: `apps/web/lib/db/schema/index.ts` (already exports `meta`, no change needed)
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `leads` table, `syncLogs` table, `lastSyncedAt` column on `metaAdAccounts`, `metaStatus` column on `campaigns`. New shared types: `LeadStatus`, `SyncType`, `SyncStatus`, `LeadSource`.

- [ ] **Step 1: Add shared types to `packages/shared/src/index.ts`**

```typescript
export type LeadStatus = "new" | "contacted" | "qualified" | "converted" | "lost";
export type LeadSource = "meta_webhook" | "meta_poll" | "manual";
export type SyncType = "campaigns" | "insights" | "leads" | "full";
export type SyncStatus = "running" | "completed" | "failed";
```

- [ ] **Step 2: Add `leads` table to `apps/web/lib/db/schema/meta.ts`**

Add after the `creativePerformance` table definition:

```typescript
export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => clients.id).notNull(),
  campaignId: uuid("campaign_id").references(() => campaigns.id),
  adSetId: uuid("ad_set_id").references(() => adSets.id),
  adId: uuid("ad_id").references(() => ads.id),
  leadFormId: uuid("lead_form_id").references(() => leadForms.id),
  metaLeadId: text("meta_lead_id").unique(),
  formData: jsonb("form_data").$type<Record<string, string>>().default({}),
  name: text("name"),
  email: text("email"),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  country: text("country"),
  city: text("city"),
  status: text("status", {
    enum: ["new", "contacted", "qualified", "converted", "lost"],
  }).notNull().default("new"),
  source: text("source", {
    enum: ["meta_webhook", "meta_poll", "manual"],
  }).notNull().default("meta_webhook"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

- [ ] **Step 3: Add `syncLogs` table to `apps/web/lib/db/schema/meta.ts`**

Add after the `leads` table:

```typescript
export const syncLogs = pgTable("sync_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").references(() => metaAdAccounts.id),
  syncType: text("sync_type", {
    enum: ["campaigns", "insights", "leads", "full"],
  }).notNull(),
  status: text("status", {
    enum: ["running", "completed", "failed"],
  }).notNull().default("running"),
  itemsSynced: integer("items_synced").default(0),
  errors: jsonb("errors").$type<{ message: string; entity?: string }[]>().default([]),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});
```

- [ ] **Step 4: Add new columns to existing tables**

In the `metaAdAccounts` table definition, add after the `status` field:

```typescript
lastSyncedAt: timestamp("last_synced_at"),
```

In the `campaigns` table definition, add after the `status` field:

```typescript
metaStatus: text("meta_status"),
```

- [ ] **Step 5: Push schema to database**

Run: `cd apps/web && pnpm db:push`
Expected: Schema changes applied successfully.

- [ ] **Step 6: Verify schema**

Run: `cd apps/web && pnpm db:studio` (open briefly to confirm tables exist, then close)
Or run: `cd apps/web && npx drizzle-kit introspect` to verify.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/index.ts apps/web/lib/db/schema/meta.ts
git commit -m "feat: add leads and syncLogs tables, extend meta schema"
```

---

### Task 2: Meta API Types and Base Client

**Files:**
- Create: `apps/web/lib/meta/types.ts`
- Create: `apps/web/lib/meta/client.ts`

**Interfaces:**
- Produces: `metaFetch<T>(path, options)` function used by all subsequent Meta API modules. Types: `MetaCampaign`, `MetaAdSet`, `MetaAd`, `MetaCreative`, `MetaLeadForm`, `MetaLead`, `MetaInsight`, `MetaError`, `CreateCampaignInput`, `UpdateCampaignInput`, `CreateAdSetInput`, `UpdateAdSetInput`, `CreateAdInput`, `UpdateAdInput`, `CreateLeadFormInput`, `CreateCreativeInput`, `CampaignFilters`.

- [ ] **Step 1: Create `apps/web/lib/meta/types.ts`**

```typescript
export interface MetaError {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  fbtrace_id: string;
}

export interface MetaApiResponse<T> {
  data?: T[];
  paging?: {
    cursors: { before: string; after: string };
    next?: string;
  };
  error?: MetaError;
}

export interface MetaCampaign {
  id: string;
  name: string;
  objective: string;
  status: string;
  effective_status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  created_time: string;
  updated_time: string;
  start_time?: string;
  stop_time?: string;
}

export interface MetaAdSet {
  id: string;
  name: string;
  campaign_id: string;
  status: string;
  effective_status: string;
  targeting: Record<string, unknown>;
  optimization_goal: string;
  bid_strategy: string;
  daily_budget?: string;
  lifetime_budget?: string;
  created_time: string;
  updated_time: string;
}

export interface MetaAd {
  id: string;
  name: string;
  adset_id: string;
  status: string;
  effective_status: string;
  creative: { id: string };
  created_time: string;
  updated_time: string;
}

export interface MetaCreative {
  id: string;
  name: string;
  title?: string;
  body?: string;
  image_url?: string;
  video_id?: string;
  thumbnail_url?: string;
  object_type: string;
  created_time: string;
}

export interface MetaLeadForm {
  id: string;
  name: string;
  status: string;
  locale: string;
  questions: { key: string; label: string; type: string }[];
  created_time: string;
}

export interface MetaLead {
  id: string;
  created_time: string;
  field_data: { name: string; values: string[] }[];
}

export interface MetaInsight {
  date_start: string;
  date_stop: string;
  spend: string;
  impressions: string;
  clicks: string;
  cpc: string;
  cpm: string;
  ctr: string;
  conversions?: string;
  cost_per_result?: string;
  reach: string;
  frequency: string;
  actions?: { action_type: string; value: string }[];
}

export interface CreateCampaignInput {
  name: string;
  objective: string;
  status?: "PAUSED" | "ACTIVE";
  daily_budget?: number;
  lifetime_budget?: number;
  special_ad_categories?: string[];
  start_time?: string;
  stop_time?: string;
}

export interface UpdateCampaignInput {
  name?: string;
  status?: "ACTIVE" | "PAUSED" | "ARCHIVED";
  daily_budget?: number;
  lifetime_budget?: number;
  stop_time?: string;
}

export interface CreateAdSetInput {
  name: string;
  campaign_id: string;
  optimization_goal: string;
  billing_event: string;
  bid_strategy?: string;
  daily_budget?: number;
  lifetime_budget?: number;
  targeting: Record<string, unknown>;
  status?: "PAUSED" | "ACTIVE";
  start_time?: string;
  end_time?: string;
}

export interface UpdateAdSetInput {
  name?: string;
  status?: "ACTIVE" | "PAUSED" | "ARCHIVED";
  daily_budget?: number;
  targeting?: Record<string, unknown>;
}

export interface CreateAdInput {
  name: string;
  adset_id: string;
  creative: { creative_id: string };
  status?: "PAUSED" | "ACTIVE";
}

export interface UpdateAdInput {
  name?: string;
  status?: "ACTIVE" | "PAUSED" | "ARCHIVED";
  creative?: { creative_id: string };
}

export interface CreateLeadFormInput {
  name: string;
  locale: string;
  questions: { type: string; key: string; label: string; options?: { value: string; key: string }[] }[];
  privacy_policy: { url: string; link_text: string };
  follow_up_action_url?: string;
}

export interface CreateCreativeInput {
  name: string;
  object_story_spec: {
    page_id: string;
    link_data?: {
      message: string;
      link: string;
      name: string;
      description?: string;
      image_hash?: string;
      call_to_action: { type: string; value?: { link: string } };
    };
    video_data?: {
      video_id: string;
      message: string;
      title: string;
      call_to_action: { type: string; value?: { link: string } };
    };
  };
}

export interface CampaignFilters {
  effective_status?: string[];
  updated_since?: string;
}

export class MetaApiError extends Error {
  constructor(
    message: string,
    public code: number,
    public subcode?: number,
    public fbtraceId?: string,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}
```

- [ ] **Step 2: Create `apps/web/lib/meta/client.ts`**

```typescript
import { MetaApiError } from "./types";

const META_API_VERSION = "v21.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

const callCounts = new Map<string, { count: number; resetAt: number }>();
const MAX_CALLS_PER_HOUR = 200;

function checkRateLimit(accountId: string): void {
  const now = Date.now();
  const entry = callCounts.get(accountId);
  if (!entry || now > entry.resetAt) {
    callCounts.set(accountId, { count: 1, resetAt: now + 3600_000 });
    return;
  }
  if (entry.count >= MAX_CALLS_PER_HOUR) {
    throw new MetaApiError("Rate limit reached for this ad account", 17);
  }
  entry.count++;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function metaFetch<T>(
  path: string,
  options?: {
    method?: string;
    body?: Record<string, unknown>;
    params?: Record<string, string>;
    accountId?: string;
  },
): Promise<T> {
  const token = process.env.META_SYSTEM_TOKEN;
  if (!token) throw new Error("META_SYSTEM_TOKEN is not configured");

  if (options?.accountId) {
    checkRateLimit(options.accountId);
  }

  const url = new URL(`${META_BASE_URL}${path}`);
  url.searchParams.set("access_token", token);
  if (options?.params) {
    for (const [key, value] of Object.entries(options.params)) {
      url.searchParams.set(key, value);
    }
  }

  const fetchOptions: RequestInit = {
    method: options?.method || "GET",
  };

  if (options?.body) {
    fetchOptions.method = fetchOptions.method === "GET" ? "POST" : fetchOptions.method;
    fetchOptions.headers = { "Content-Type": "application/json" };
    fetchOptions.body = JSON.stringify(options.body);
  }

  let lastError: MetaApiError | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url.toString(), fetchOptions);
    const data = await response.json();

    if (!response.ok || data.error) {
      const err = data.error;
      lastError = new MetaApiError(
        err?.message || "Unknown Meta API error",
        err?.code || response.status,
        err?.error_subcode,
        err?.fbtrace_id,
      );

      if (err?.code === 17 || err?.code === 2) {
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay);
        continue;
      }

      throw lastError;
    }

    return data as T;
  }

  throw lastError || new MetaApiError("Max retries exceeded", 17);
}

export function mapMetaErrorToMessage(code: number): string {
  switch (code) {
    case 17:
      return "Meta API rate limit reached. Please try again later.";
    case 2:
      return "Temporary Meta API error. Please try again.";
    case 190:
      return "Meta connection expired. Please reconnect your ad account.";
    case 100:
      return "Invalid campaign parameters. Please check your input.";
    case 10:
      return "Missing Meta API permission. Contact admin.";
    default:
      return "An error occurred with Meta API. Please try again.";
  }
}
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd apps/web && npx tsc --noEmit --pretty`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/meta/types.ts apps/web/lib/meta/client.ts
git commit -m "feat: add Meta API types and base client with rate limiting"
```

---

### Task 3: Meta API Domain Modules — Campaigns, Ad Sets, Ads, Creatives, Lead Forms, Insights

**Files:**
- Create: `apps/web/lib/meta/campaigns.ts`
- Create: `apps/web/lib/meta/adsets.ts`
- Create: `apps/web/lib/meta/ads.ts`
- Create: `apps/web/lib/meta/creatives.ts`
- Create: `apps/web/lib/meta/lead-forms.ts`
- Create: `apps/web/lib/meta/insights.ts`

**Interfaces:**
- Consumes: `metaFetch` from `lib/meta/client.ts`, all types from `lib/meta/types.ts`
- Produces: Named exports for campaign/adset/ad/creative/lead-form/insights CRUD operations. Used by API routes in Task 6 and sync engine in Task 4.

- [ ] **Step 1: Create `apps/web/lib/meta/campaigns.ts`**

```typescript
import { metaFetch } from "./client";
import type {
  MetaCampaign, MetaApiResponse, CreateCampaignInput,
  UpdateCampaignInput, CampaignFilters,
} from "./types";

const CAMPAIGN_FIELDS = "id,name,objective,status,effective_status,daily_budget,lifetime_budget,created_time,updated_time,start_time,stop_time";

export async function createCampaign(accountId: string, data: CreateCampaignInput): Promise<string> {
  const result = await metaFetch<{ id: string }>(`/act_${accountId}/campaigns`, {
    body: { ...data, special_ad_categories: data.special_ad_categories || [] },
    accountId,
  });
  return result.id;
}

export async function updateCampaign(campaignId: string, data: UpdateCampaignInput, accountId?: string): Promise<void> {
  await metaFetch<{ success: boolean }>(`/${campaignId}`, {
    body: data as Record<string, unknown>,
    method: "POST",
    accountId,
  });
}

export async function getCampaign(campaignId: string, accountId?: string): Promise<MetaCampaign> {
  return metaFetch<MetaCampaign>(`/${campaignId}`, {
    params: { fields: CAMPAIGN_FIELDS },
    accountId,
  });
}

export async function listCampaigns(accountId: string, filters?: CampaignFilters): Promise<MetaCampaign[]> {
  const params: Record<string, string> = { fields: CAMPAIGN_FIELDS, limit: "100" };
  if (filters?.effective_status) {
    params.effective_status = JSON.stringify(filters.effective_status);
  }
  if (filters?.updated_since) {
    params.updated_since = filters.updated_since;
  }

  const result = await metaFetch<MetaApiResponse<MetaCampaign>>(`/act_${accountId}/campaigns`, {
    params,
    accountId,
  });
  return result.data || [];
}

export async function updateCampaignStatus(campaignId: string, status: "ACTIVE" | "PAUSED", accountId?: string): Promise<void> {
  await updateCampaign(campaignId, { status }, accountId);
}
```

- [ ] **Step 2: Create `apps/web/lib/meta/adsets.ts`**

```typescript
import { metaFetch } from "./client";
import type { MetaAdSet, MetaApiResponse, CreateAdSetInput, UpdateAdSetInput } from "./types";

const ADSET_FIELDS = "id,name,campaign_id,status,effective_status,targeting,optimization_goal,bid_strategy,daily_budget,lifetime_budget,created_time,updated_time";

export async function createAdSet(accountId: string, data: CreateAdSetInput): Promise<string> {
  const result = await metaFetch<{ id: string }>(`/act_${accountId}/adsets`, {
    body: data as Record<string, unknown>,
    accountId,
  });
  return result.id;
}

export async function updateAdSet(adSetId: string, data: UpdateAdSetInput, accountId?: string): Promise<void> {
  await metaFetch<{ success: boolean }>(`/${adSetId}`, {
    body: data as Record<string, unknown>,
    method: "POST",
    accountId,
  });
}

export async function getAdSet(adSetId: string, accountId?: string): Promise<MetaAdSet> {
  return metaFetch<MetaAdSet>(`/${adSetId}`, {
    params: { fields: ADSET_FIELDS },
    accountId,
  });
}

export async function listAdSets(campaignId: string, accountId?: string): Promise<MetaAdSet[]> {
  const result = await metaFetch<MetaApiResponse<MetaAdSet>>(`/${campaignId}/adsets`, {
    params: { fields: ADSET_FIELDS, limit: "100" },
    accountId,
  });
  return result.data || [];
}
```

- [ ] **Step 3: Create `apps/web/lib/meta/ads.ts`**

```typescript
import { metaFetch } from "./client";
import type { MetaAd, MetaApiResponse, CreateAdInput, UpdateAdInput } from "./types";

const AD_FIELDS = "id,name,adset_id,status,effective_status,creative{id},created_time,updated_time";

export async function createAd(accountId: string, data: CreateAdInput): Promise<string> {
  const result = await metaFetch<{ id: string }>(`/act_${accountId}/ads`, {
    body: data as Record<string, unknown>,
    accountId,
  });
  return result.id;
}

export async function updateAd(adId: string, data: UpdateAdInput, accountId?: string): Promise<void> {
  await metaFetch<{ success: boolean }>(`/${adId}`, {
    body: data as Record<string, unknown>,
    method: "POST",
    accountId,
  });
}

export async function getAd(adId: string, accountId?: string): Promise<MetaAd> {
  return metaFetch<MetaAd>(`/${adId}`, {
    params: { fields: AD_FIELDS },
    accountId,
  });
}

export async function listAds(adSetId: string, accountId?: string): Promise<MetaAd[]> {
  const result = await metaFetch<MetaApiResponse<MetaAd>>(`/${adSetId}/ads`, {
    params: { fields: AD_FIELDS, limit: "100" },
    accountId,
  });
  return result.data || [];
}
```

- [ ] **Step 4: Create `apps/web/lib/meta/creatives.ts`**

```typescript
import { metaFetch } from "./client";
import type { MetaCreative, MetaApiResponse, CreateCreativeInput } from "./types";

const CREATIVE_FIELDS = "id,name,title,body,image_url,video_id,thumbnail_url,object_type,created_time";

export async function createCreative(accountId: string, data: CreateCreativeInput): Promise<string> {
  const result = await metaFetch<{ id: string }>(`/act_${accountId}/adcreatives`, {
    body: data as Record<string, unknown>,
    accountId,
  });
  return result.id;
}

export async function uploadImage(accountId: string, imageUrl: string): Promise<{ hash: string }> {
  const result = await metaFetch<{ images: Record<string, { hash: string }> }>(`/act_${accountId}/adimages`, {
    body: { url: imageUrl },
    accountId,
  });
  const firstKey = Object.keys(result.images)[0];
  return { hash: result.images[firstKey].hash };
}

export async function uploadVideo(accountId: string, videoUrl: string): Promise<{ id: string }> {
  const result = await metaFetch<{ id: string }>(`/act_${accountId}/advideos`, {
    body: { file_url: videoUrl },
    accountId,
  });
  return { id: result.id };
}

export async function getCreatives(accountId: string): Promise<MetaCreative[]> {
  const result = await metaFetch<MetaApiResponse<MetaCreative>>(`/act_${accountId}/adcreatives`, {
    params: { fields: CREATIVE_FIELDS, limit: "100" },
    accountId,
  });
  return result.data || [];
}
```

- [ ] **Step 5: Create `apps/web/lib/meta/lead-forms.ts`**

```typescript
import { metaFetch } from "./client";
import type { MetaLeadForm, MetaLead, MetaApiResponse, CreateLeadFormInput } from "./types";

export async function createLeadForm(pageId: string, data: CreateLeadFormInput): Promise<string> {
  const result = await metaFetch<{ id: string }>(`/${pageId}/leadgen_forms`, {
    body: data as Record<string, unknown>,
  });
  return result.id;
}

export async function getLeadForm(formId: string): Promise<MetaLeadForm> {
  return metaFetch<MetaLeadForm>(`/${formId}`, {
    params: { fields: "id,name,status,locale,questions,created_time" },
  });
}

export async function listLeadForms(pageId: string): Promise<MetaLeadForm[]> {
  const result = await metaFetch<MetaApiResponse<MetaLeadForm>>(`/${pageId}/leadgen_forms`, {
    params: { fields: "id,name,status,locale,questions,created_time", limit: "100" },
  });
  return result.data || [];
}

export async function getLeadFormData(formId: string, since?: Date): Promise<MetaLead[]> {
  const params: Record<string, string> = { fields: "id,created_time,field_data", limit: "100" };
  if (since) {
    params.filtering = JSON.stringify([{
      field: "time_created",
      operator: "GREATER_THAN",
      value: Math.floor(since.getTime() / 1000),
    }]);
  }
  const result = await metaFetch<MetaApiResponse<MetaLead>>(`/${formId}/leads`, { params });
  return result.data || [];
}
```

- [ ] **Step 6: Create `apps/web/lib/meta/insights.ts`**

```typescript
import { metaFetch } from "./client";
import type { MetaInsight, MetaApiResponse } from "./types";

const DEFAULT_FIELDS = "spend,impressions,clicks,cpc,cpm,ctr,reach,frequency,actions,cost_per_action_type";

export async function getInsights(
  objectId: string,
  params: {
    level: "campaign" | "adset" | "ad";
    fields?: string;
    dateRange: { since: string; until: string };
    timeIncrement?: number;
  },
  accountId?: string,
): Promise<MetaInsight[]> {
  const queryParams: Record<string, string> = {
    level: params.level,
    fields: params.fields || DEFAULT_FIELDS,
    time_range: JSON.stringify({
      since: params.dateRange.since,
      until: params.dateRange.until,
    }),
  };
  if (params.timeIncrement) {
    queryParams.time_increment = String(params.timeIncrement);
  }

  const result = await metaFetch<MetaApiResponse<MetaInsight>>(`/${objectId}/insights`, {
    params: queryParams,
    accountId,
  });
  return result.data || [];
}
```

- [ ] **Step 7: Verify TypeScript compilation**

Run: `cd apps/web && npx tsc --noEmit --pretty`
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/meta/campaigns.ts apps/web/lib/meta/adsets.ts apps/web/lib/meta/ads.ts apps/web/lib/meta/creatives.ts apps/web/lib/meta/lead-forms.ts apps/web/lib/meta/insights.ts
git commit -m "feat: add Meta API domain modules for campaigns, adsets, ads, creatives, lead forms, insights"
```

---

### Task 4: Policy Checker

**Files:**
- Create: `apps/web/lib/meta/policy-checker.ts`

**Interfaces:**
- Consumes: Client type from `clients` table (to determine agency vs clinic).
- Produces: `checkCampaignPolicies(draft, clientType): PolicyCheckResult[]` — used by campaign creation wizard (Task 8) and campaign API route (Task 6).

- [ ] **Step 1: Create `apps/web/lib/meta/policy-checker.ts`**

```typescript
import type { ClientType } from "@rtnads/shared";

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

const EK53_COUNTRIES = [
  "Germany", "United States", "Azerbaijan", "United Arab Emirates",
  "United Kingdom", "France", "Ireland", "Spain", "Canada", "Qatar",
  "Kazakhstan", "Egypt", "Nigeria", "Norway", "Uzbekistan", "Poland",
  "Romania", "Russia", "Senegal", "Saudi Arabia",
];

const TURKISH_CHARS = /[çğıöşüÇĞİÖŞÜ]/;
const TURKISH_WORDS = /\b(ve|bir|ile|için|olan|bu|da|de|den|dan|ne|nasıl|kadar|gibi|daha|çok|iyi|tedavi|sağlık|turizm|estetik|ameliyat)\b/i;

const EU_COUNTRIES = [
  "Germany", "France", "Ireland", "Spain", "Poland", "Romania",
  "Italy", "Netherlands", "Belgium", "Austria", "Sweden", "Denmark",
  "Finland", "Portugal", "Greece", "Czech Republic", "Hungary",
  "Slovakia", "Slovenia", "Croatia", "Bulgaria", "Lithuania",
  "Latvia", "Estonia", "Luxembourg", "Malta", "Cyprus",
];

export function checkCampaignPolicies(
  draft: CampaignDraft,
  clientType: ClientType,
): PolicyCheckResult[] {
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

  const ek53Count = draft.targetCountries.filter((c) => EK53_COUNTRIES.includes(c)).length;
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

  const targetsEurope = draft.targetCountries.some((c) => EU_COUNTRIES.includes(c));
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

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd apps/web && npx tsc --noEmit --pretty`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/meta/policy-checker.ts
git commit -m "feat: add health tourism policy checker for campaign validation"
```

---

### Task 5: Sync Engine

**Files:**
- Create: `apps/web/lib/meta/sync.ts`

**Interfaces:**
- Consumes: `listCampaigns` from `lib/meta/campaigns.ts`, `listAdSets` from `lib/meta/adsets.ts`, `listAds` from `lib/meta/ads.ts`, `getCreatives` from `lib/meta/creatives.ts`, `listLeadForms` from `lib/meta/lead-forms.ts`, `getInsights` from `lib/meta/insights.ts`. DB schemas from `lib/db/schema`.
- Produces: `fullSync(accountId: string, pageId: string, clientId: string)`, `incrementalCampaignSync(accountId: string, clientId: string)`, `incrementalInsightsSync(accountId: string)` — used by sync API route (Task 6) and cron route (Task 7).

- [ ] **Step 1: Create `apps/web/lib/meta/sync.ts`**

```typescript
import { db } from "@/lib/db";
import {
  metaAdAccounts, campaigns, adSets, ads,
  leadForms, creatives, syncLogs,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { listCampaigns } from "./campaigns";
import { listAdSets } from "./adsets";
import { listAds } from "./ads";
import { getCreatives } from "./creatives";
import { listLeadForms } from "./lead-forms";
import { getInsights } from "./insights";
import type { SyncType } from "@rtnads/shared";

async function createSyncLog(accountId: string, syncType: SyncType) {
  const [log] = await db.insert(syncLogs).values({
    accountId,
    syncType,
    status: "running",
  }).returning();
  return log;
}

async function completeSyncLog(logId: string, itemsSynced: number, errors: { message: string; entity?: string }[]) {
  await db.update(syncLogs).set({
    status: errors.length > 0 ? "failed" : "completed",
    itemsSynced,
    errors,
    completedAt: new Date(),
  }).where(eq(syncLogs.id, logId));
}

export async function fullSync(
  dbAccountId: string,
  metaAccountId: string,
  pageId: string | null,
  clientId: string,
): Promise<{ itemsSynced: number; errors: { message: string; entity?: string }[] }> {
  const log = await createSyncLog(dbAccountId, "full");
  let itemsSynced = 0;
  const errors: { message: string; entity?: string }[] = [];

  try {
    const metaCampaigns = await listCampaigns(metaAccountId);
    for (const mc of metaCampaigns) {
      await db.insert(campaigns).values({
        clientId,
        metaAdAccountId: dbAccountId,
        metaCampaignId: mc.id,
        name: mc.name,
        objective: mc.objective,
        status: mc.effective_status === "ACTIVE" ? "live" : "paused",
        metaStatus: mc.effective_status,
        approvalStatus: mc.effective_status === "ACTIVE" ? "live" : "paused",
        dailyBudget: mc.daily_budget ? parseInt(mc.daily_budget) : null,
        lifetimeBudget: mc.lifetime_budget ? parseInt(mc.lifetime_budget) : null,
        startDate: mc.start_time ? new Date(mc.start_time) : null,
        endDate: mc.stop_time ? new Date(mc.stop_time) : null,
      }).onConflictDoUpdate({
        target: campaigns.metaCampaignId,
        set: {
          name: mc.name,
          metaStatus: mc.effective_status,
          dailyBudget: mc.daily_budget ? parseInt(mc.daily_budget) : null,
          updatedAt: new Date(),
        },
      });
      itemsSynced++;

      try {
        const metaAdSets = await listAdSets(mc.id, metaAccountId);
        for (const mas of metaAdSets) {
          const [parentCampaign] = await db.select({ id: campaigns.id })
            .from(campaigns)
            .where(eq(campaigns.metaCampaignId, mc.id))
            .limit(1);
          if (!parentCampaign) continue;

          await db.insert(adSets).values({
            campaignId: parentCampaign.id,
            metaAdsetId: mas.id,
            name: mas.name,
            targeting: mas.targeting,
            optimizationGoal: mas.optimization_goal,
            bidStrategy: mas.bid_strategy,
            status: mas.effective_status === "ACTIVE" ? "active" : "paused",
          }).onConflictDoUpdate({
            target: adSets.metaAdsetId,
            set: {
              name: mas.name,
              targeting: mas.targeting,
              status: mas.effective_status === "ACTIVE" ? "active" : "paused",
              updatedAt: new Date(),
            },
          });
          itemsSynced++;

          try {
            const metaAds = await listAds(mas.id, metaAccountId);
            for (const ma of metaAds) {
              const [parentAdSet] = await db.select({ id: adSets.id })
                .from(adSets)
                .where(eq(adSets.metaAdsetId, mas.id))
                .limit(1);
              if (!parentAdSet) continue;

              await db.insert(ads).values({
                adSetId: parentAdSet.id,
                metaAdId: ma.id,
                status: ma.effective_status === "ACTIVE" ? "active" : "paused",
              }).onConflictDoUpdate({
                target: ads.metaAdId,
                set: {
                  status: ma.effective_status === "ACTIVE" ? "active" : "paused",
                  updatedAt: new Date(),
                },
              });
              itemsSynced++;
            }
          } catch (e: any) {
            errors.push({ message: e.message, entity: `ads for adset ${mas.id}` });
          }
        }
      } catch (e: any) {
        errors.push({ message: e.message, entity: `adsets for campaign ${mc.id}` });
      }
    }

    if (pageId) {
      try {
        const metaForms = await listLeadForms(pageId);
        for (const mf of metaForms) {
          await db.insert(leadForms).values({
            clientId,
            metaFormId: mf.id,
            name: mf.name,
            locale: mf.locale || "en",
          }).onConflictDoUpdate({
            target: leadForms.metaFormId,
            set: { name: mf.name, locale: mf.locale || "en" },
          });
          itemsSynced++;
        }
      } catch (e: any) {
        errors.push({ message: e.message, entity: "lead forms" });
      }
    }

    try {
      const metaCreatives = await getCreatives(metaAccountId);
      for (const mc of metaCreatives) {
        await db.insert(creatives).values({
          sourceAdAccountId: dbAccountId,
          metaCreativeId: mc.id,
          type: mc.video_id ? "video" : "image",
          thumbnailUrl: mc.thumbnail_url,
          mediaUrl: mc.image_url,
          syncedAt: new Date(),
        }).onConflictDoUpdate({
          target: creatives.metaCreativeId,
          set: { thumbnailUrl: mc.thumbnail_url, syncedAt: new Date() },
        });
        itemsSynced++;
      }
    } catch (e: any) {
      errors.push({ message: e.message, entity: "creatives" });
    }

    await db.update(metaAdAccounts).set({ lastSyncedAt: new Date() }).where(eq(metaAdAccounts.id, dbAccountId));
  } catch (e: any) {
    errors.push({ message: e.message, entity: "full sync" });
  }

  await completeSyncLog(log.id, itemsSynced, errors);
  return { itemsSynced, errors };
}

export async function incrementalCampaignSync(
  dbAccountId: string,
  metaAccountId: string,
  clientId: string,
): Promise<{ itemsSynced: number; errors: { message: string; entity?: string }[] }> {
  const log = await createSyncLog(dbAccountId, "campaigns");
  let itemsSynced = 0;
  const errors: { message: string; entity?: string }[] = [];

  try {
    const [account] = await db.select({ lastSyncedAt: metaAdAccounts.lastSyncedAt })
      .from(metaAdAccounts)
      .where(eq(metaAdAccounts.id, dbAccountId))
      .limit(1);

    const filters: { updated_since?: string } = {};
    if (account?.lastSyncedAt) {
      filters.updated_since = Math.floor(account.lastSyncedAt.getTime() / 1000).toString();
    }

    const metaCampaigns = await listCampaigns(metaAccountId, filters);
    for (const mc of metaCampaigns) {
      await db.insert(campaigns).values({
        clientId,
        metaAdAccountId: dbAccountId,
        metaCampaignId: mc.id,
        name: mc.name,
        objective: mc.objective,
        status: mc.effective_status === "ACTIVE" ? "live" : "paused",
        metaStatus: mc.effective_status,
        approvalStatus: mc.effective_status === "ACTIVE" ? "live" : "paused",
      }).onConflictDoUpdate({
        target: campaigns.metaCampaignId,
        set: {
          name: mc.name,
          metaStatus: mc.effective_status,
          updatedAt: new Date(),
        },
      });
      itemsSynced++;
    }

    await db.update(metaAdAccounts).set({ lastSyncedAt: new Date() }).where(eq(metaAdAccounts.id, dbAccountId));
  } catch (e: any) {
    errors.push({ message: e.message, entity: "incremental campaign sync" });
  }

  await completeSyncLog(log.id, itemsSynced, errors);
  return { itemsSynced, errors };
}

export async function incrementalInsightsSync(
  dbAccountId: string,
  metaAccountId: string,
): Promise<{ itemsSynced: number; errors: { message: string; entity?: string }[] }> {
  const log = await createSyncLog(dbAccountId, "insights");
  let itemsSynced = 0;
  const errors: { message: string; entity?: string }[] = [];

  try {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);

    const since = sevenDaysAgo.toISOString().split("T")[0];
    const until = today.toISOString().split("T")[0];

    const insights = await getInsights(
      `act_${metaAccountId}`,
      { level: "campaign", dateRange: { since, until }, timeIncrement: 1 },
      metaAccountId,
    );
    itemsSynced = insights.length;
  } catch (e: any) {
    errors.push({ message: e.message, entity: "insights sync" });
  }

  await completeSyncLog(log.id, itemsSynced, errors);
  return { itemsSynced, errors };
}
```

Note: The `onConflictDoUpdate` calls require unique constraints on `metaCampaignId`, `metaAdsetId`, `metaAdId`, `metaFormId`, and `metaCreativeId`. These fields don't have unique constraints in the current schema — add `.unique()` to each of these columns in Step 2.

- [ ] **Step 2: Add unique constraints to Meta ID columns in schema**

In `apps/web/lib/db/schema/meta.ts`, add `.unique()` to these fields:
- `campaigns.metaCampaignId` → `text("meta_campaign_id").unique()`
- `adSets.metaAdsetId` → `text("meta_adset_id").unique()`
- `ads.metaAdId` → `text("meta_ad_id").unique()`
- `leadForms.metaFormId` → `text("meta_form_id").unique()`
- `creatives.metaCreativeId` → `text("meta_creative_id").unique()`

- [ ] **Step 3: Push schema changes**

Run: `cd apps/web && pnpm db:push`
Expected: Unique constraints added successfully.

- [ ] **Step 4: Verify TypeScript compilation**

Run: `cd apps/web && npx tsc --noEmit --pretty`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/meta/sync.ts apps/web/lib/db/schema/meta.ts
git commit -m "feat: add sync engine with full and incremental sync, add unique constraints to meta IDs"
```

---

### Task 6: API Routes — Meta Campaigns, Ad Sets, Ads, Sync, Webhook

**Files:**
- Create: `apps/web/app/api/meta/campaigns/route.ts`
- Create: `apps/web/app/api/meta/adsets/route.ts`
- Create: `apps/web/app/api/meta/ads/route.ts`
- Create: `apps/web/app/api/meta/sync/route.ts`
- Create: `apps/web/app/api/meta/webhook/route.ts`

**Interfaces:**
- Consumes: `lib/meta/campaigns.ts`, `lib/meta/adsets.ts`, `lib/meta/ads.ts`, `lib/meta/sync.ts`, `auth()` from `lib/auth.ts`, DB schemas. `checkCampaignPolicies` from `lib/meta/policy-checker.ts`.
- Produces: REST API endpoints consumed by UI pages (Tasks 8-10).

- [ ] **Step 1: Create `apps/web/app/api/meta/campaigns/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { campaigns, metaAdAccounts, clients } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { createCampaign as metaCreateCampaign, updateCampaignStatus } from "@/lib/meta/campaigns";
import { checkCampaignPolicies } from "@/lib/meta/policy-checker";
import { MetaApiError, mapMetaErrorToMessage } from "@/lib/meta/client";
import type { UserRole } from "@rtnads/shared";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = (session.user as any).orgId;
  const allCampaigns = await db
    .select()
    .from(campaigns)
    .innerJoin(metaAdAccounts, eq(campaigns.metaAdAccountId, metaAdAccounts.id))
    .innerJoin(clients, eq(campaigns.clientId, clients.id))
    .where(eq(clients.orgId, orgId));

  return NextResponse.json(allCampaigns);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  const [client] = await db.select().from(clients).where(eq(clients.id, body.clientId)).limit(1);
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const policyResults = checkCampaignPolicies({
    adCopy: body.adCopy,
    headline: body.headline,
    description: body.description,
    targetCountries: body.targetCountries || [],
    adFormat: body.adFormat,
    leadFormQuestions: body.leadFormQuestions,
    hasWhatsAppField: body.hasWhatsAppField,
    hasDisclaimer: body.hasDisclaimer,
  }, client.type as any);

  const blockers = policyResults.filter((r) => r.level === "blocker");
  if (blockers.length > 0) {
    return NextResponse.json({ error: "Policy check failed", blockers }, { status: 422 });
  }

  const [campaign] = await db.insert(campaigns).values({
    clientId: body.clientId,
    metaAdAccountId: body.metaAdAccountId,
    name: body.name,
    campaignType: body.campaignType || "standard",
    objective: body.objective,
    treatmentCategory: body.treatmentCategory,
    targetCountries: body.targetCountries || [],
    dailyBudget: body.dailyBudget,
    lifetimeBudget: body.lifetimeBudget,
    budgetCurrency: body.budgetCurrency || "USD",
    status: "draft",
    approvalStatus: "draft",
    createdBy: session.user.id,
    startDate: body.startDate ? new Date(body.startDate) : null,
    endDate: body.endDate ? new Date(body.endDate) : null,
  }).returning();

  return NextResponse.json({ campaign, policyResults }, { status: 201 });
}
```

- [ ] **Step 2: Create `apps/web/app/api/meta/campaigns/[id]/publish/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { campaigns, metaAdAccounts } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { createCampaign as metaCreateCampaign } from "@/lib/meta/campaigns";
import { MetaApiError, mapMetaErrorToMessage } from "@/lib/meta/client";
import type { UserRole } from "@rtnads/shared";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as UserRole;
  if (role !== "admin" && role !== "manager") {
    return NextResponse.json({ error: "Only admins and managers can publish campaigns" }, { status: 403 });
  }

  const { id } = await params;
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!campaign.metaAdAccountId) return NextResponse.json({ error: "No ad account linked" }, { status: 400 });

  const [account] = await db.select().from(metaAdAccounts)
    .where(eq(metaAdAccounts.id, campaign.metaAdAccountId)).limit(1);
  if (!account) return NextResponse.json({ error: "Ad account not found" }, { status: 404 });

  try {
    const metaCampaignId = await metaCreateCampaign(account.accountId, {
      name: campaign.name,
      objective: campaign.objective || "OUTCOME_LEADS",
      status: "PAUSED",
      daily_budget: campaign.dailyBudget ? campaign.dailyBudget * 100 : undefined,
      lifetime_budget: campaign.lifetimeBudget ? campaign.lifetimeBudget * 100 : undefined,
      special_ad_categories: [],
      start_time: campaign.startDate?.toISOString(),
      stop_time: campaign.endDate?.toISOString(),
    });

    await db.update(campaigns).set({
      metaCampaignId,
      approvalStatus: "approved",
      approvedBy: session.user.id,
      approvedAt: new Date(),
      metaStatus: "PAUSED",
      updatedAt: new Date(),
    }).where(eq(campaigns.id, id));

    return NextResponse.json({ metaCampaignId });
  } catch (e) {
    if (e instanceof MetaApiError) {
      return NextResponse.json(
        { error: mapMetaErrorToMessage(e.code), code: e.code },
        { status: 502 },
      );
    }
    throw e;
  }
}
```

- [ ] **Step 3: Create `apps/web/app/api/meta/sync/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { metaAdAccounts, clients } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { fullSync } from "@/lib/meta/sync";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const accountId = body.accountId;

  const [account] = await db.select().from(metaAdAccounts)
    .where(eq(metaAdAccounts.id, accountId)).limit(1);
  if (!account) return NextResponse.json({ error: "Ad account not found" }, { status: 404 });

  const result = await fullSync(
    account.id,
    account.accountId,
    account.pageId,
    account.clientId,
  );

  return NextResponse.json(result);
}
```

- [ ] **Step 4: Create `apps/web/app/api/meta/webhook/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import crypto from "crypto";

function verifySignature(payload: string, signature: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret || !signature) return false;

  const expectedSig = "sha256=" + crypto
    .createHmac("sha256", appSecret)
    .update(payload)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSig),
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const body = JSON.parse(rawBody);

  if (body.object !== "page") {
    return NextResponse.json({ received: true });
  }

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== "leadgen") continue;

      const leadData = change.value;
      const metaLeadId = leadData.leadgen_id;

      const existing = await db.select({ id: leads.id })
        .from(leads)
        .where(eq(leads.metaLeadId, metaLeadId))
        .limit(1);
      if (existing.length > 0) continue;

      await db.insert(leads).values({
        metaLeadId,
        leadFormId: null,
        clientId: leadData.client_id || null,
        source: "meta_webhook",
        formData: leadData.field_data || {},
      }).onConflictDoNothing();
    }
  }

  return NextResponse.json({ received: true });
}
```

Note: The webhook route does NOT import `auth()` — Meta sends requests directly without user session.

- [ ] **Step 5: Create `apps/web/app/api/meta/adsets/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { adSets, campaigns } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const campaignId = url.searchParams.get("campaignId");
  if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });

  const sets = await db.select().from(adSets).where(eq(adSets.campaignId, campaignId));
  return NextResponse.json(sets);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const [adSet] = await db.insert(adSets).values({
    campaignId: body.campaignId,
    name: body.name,
    targeting: body.targeting || {},
    optimizationGoal: body.optimizationGoal,
    bidStrategy: body.bidStrategy,
    adFormat: body.adFormat,
    status: "draft",
  }).returning();

  return NextResponse.json(adSet, { status: 201 });
}
```

- [ ] **Step 6: Create `apps/web/app/api/meta/ads/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ads } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const adSetId = url.searchParams.get("adSetId");
  if (!adSetId) return NextResponse.json({ error: "adSetId required" }, { status: 400 });

  const allAds = await db.select().from(ads).where(eq(ads.adSetId, adSetId));
  return NextResponse.json(allAds);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const [ad] = await db.insert(ads).values({
    adSetId: body.adSetId,
    creativeId: body.creativeId,
    leadFormId: body.leadFormId,
    status: "draft",
  }).returning();

  return NextResponse.json(ad, { status: 201 });
}
```

- [ ] **Step 7: Verify TypeScript compilation**

Run: `cd apps/web && npx tsc --noEmit --pretty`
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/api/meta/
git commit -m "feat: add Meta API routes for campaigns, adsets, ads, sync, and webhook"
```

---

### Task 7: Cron Sync Route

**Files:**
- Create: `apps/web/app/api/cron/sync/route.ts`

**Interfaces:**
- Consumes: `incrementalCampaignSync`, `incrementalInsightsSync` from `lib/meta/sync.ts`. DB schemas.
- Produces: Cron endpoint that external scheduler hits periodically.

- [ ] **Step 1: Create `apps/web/app/api/cron/sync/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { metaAdAccounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { incrementalCampaignSync, incrementalInsightsSync } from "@/lib/meta/sync";

export async function POST(request: Request) {
  const cronSecret = request.headers.get("x-cron-secret");
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const syncType = url.searchParams.get("type") || "campaigns";

  const accounts = await db.select().from(metaAdAccounts)
    .where(eq(metaAdAccounts.status, "active"));

  const results: { accountId: string; itemsSynced: number; errors: any[] }[] = [];

  for (const account of accounts) {
    try {
      if (syncType === "insights") {
        const result = await incrementalInsightsSync(account.id, account.accountId);
        results.push({ accountId: account.accountId, ...result });
      } else {
        const result = await incrementalCampaignSync(account.id, account.accountId, account.clientId);
        results.push({ accountId: account.accountId, ...result });
      }
    } catch (e: any) {
      results.push({ accountId: account.accountId, itemsSynced: 0, errors: [{ message: e.message }] });
    }
  }

  return NextResponse.json({ syncType, accounts: results.length, results });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/api/cron/sync/route.ts
git commit -m "feat: add cron sync route for periodic campaign and insights sync"
```

---

### Task 8: Sidebar Update and Campaign List Page

**Files:**
- Modify: `apps/web/components/sidebar-nav.tsx`
- Create: `apps/web/app/(dashboard)/campaigns/page.tsx`

**Interfaces:**
- Consumes: DB schemas (`campaigns`, `metaAdAccounts`, `clients`), `auth()`, existing UI components.
- Produces: `/campaigns` page with table view, filters, sync button. Sidebar with Leads link added.

- [ ] **Step 1: Add "Leads" to sidebar nav**

In `apps/web/components/sidebar-nav.tsx`, the sidebar already has Campaigns and Creatives entries. Add Leads after Creatives:

```typescript
{ label: "Leads", href: "/leads", icon: "Contact" },
```

The updated `navItems` array should be:
```typescript
const navItems = [
  { label: "Dashboard", href: "/", icon: "LayoutDashboard" },
  { label: "Clients", href: "/clients", icon: "Users" },
  { label: "Campaigns", href: "/campaigns", icon: "Megaphone" },
  { label: "Creatives", href: "/creatives", icon: "Image" },
  { label: "Leads", href: "/leads", icon: "Contact" },
  { label: "Chat", href: "/chat", icon: "MessageSquare" },
  { label: "Knowledge", href: "/knowledge", icon: "BookOpen" },
  { label: "Settings", href: "/settings", icon: "Settings" },
];
```

- [ ] **Step 2: Create `apps/web/app/(dashboard)/campaigns/page.tsx`**

```typescript
import Link from "next/link";
import { db } from "@/lib/db";
import { campaigns, metaAdAccounts, clients } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  pending_approval: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  live: "bg-green-100 text-green-800",
  paused: "bg-orange-100 text-orange-800",
  rejected: "bg-red-100 text-red-800",
};

export default async function CampaignsPage() {
  const session = await auth();
  const orgId = (session?.user as any)?.orgId;

  const allCampaigns = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      status: campaigns.approvalStatus,
      metaStatus: campaigns.metaStatus,
      objective: campaigns.objective,
      dailyBudget: campaigns.dailyBudget,
      budgetCurrency: campaigns.budgetCurrency,
      clientName: clients.name,
      treatmentCategory: campaigns.treatmentCategory,
      createdAt: campaigns.createdAt,
    })
    .from(campaigns)
    .innerJoin(clients, eq(campaigns.clientId, clients.id))
    .where(eq(clients.orgId, orgId))
    .orderBy(campaigns.createdAt);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href="/campaigns?sync=true">Sync Now</Link>} />
          <Button render={<Link href="/campaigns/new">New Campaign</Link>} />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Campaign</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Objective</TableHead>
            <TableHead>Daily Budget</TableHead>
            <TableHead>Category</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allCampaigns.map((campaign) => (
            <TableRow key={campaign.id}>
              <TableCell>
                <Link href={`/campaigns/${campaign.id}`} className="font-medium hover:underline">
                  {campaign.name}
                </Link>
              </TableCell>
              <TableCell>{campaign.clientName}</TableCell>
              <TableCell>
                <Badge className={statusColors[campaign.status] || ""}>
                  {campaign.status.replace("_", " ")}
                </Badge>
              </TableCell>
              <TableCell>{campaign.objective || "—"}</TableCell>
              <TableCell>
                {campaign.dailyBudget
                  ? `${campaign.budgetCurrency} ${campaign.dailyBudget.toLocaleString()}`
                  : "—"}
              </TableCell>
              <TableCell>{campaign.treatmentCategory || "—"}</TableCell>
            </TableRow>
          ))}
          {allCampaigns.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                No campaigns yet. Create your first campaign or sync from Meta.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 3: Verify the page renders**

Run: `cd apps/web && pnpm dev`
Navigate to `/campaigns` in browser. Expected: empty campaign table with "New Campaign" button.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/sidebar-nav.tsx apps/web/app/\(dashboard\)/campaigns/page.tsx
git commit -m "feat: add campaigns list page and leads sidebar link"
```

---

### Task 9: Campaign Creation Wizard

**Files:**
- Create: `apps/web/app/(dashboard)/campaigns/new/page.tsx`

**Interfaces:**
- Consumes: `POST /api/meta/campaigns` (from Task 6), `clients` from DB, `metaAdAccounts` from DB, existing UI components.
- Produces: 5-step campaign creation wizard at `/campaigns/new`.

- [ ] **Step 1: Create `apps/web/app/(dashboard)/campaigns/new/page.tsx`**

This is a client component with multi-step form state. The wizard has 5 steps:
1. Basics (name, client, account, type, objective, category)
2. Targeting & Budget (countries, language, budget, dates)
3. Ad Set & Format (format, optimization, bid strategy)
4. Creative & Ad (copy, headline, description, lead form questions)
5. Review & Policy Check (summary, policy results, submit)

```typescript
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Client { id: string; name: string; type: string; }
interface AdAccount { id: string; name: string; accountId: string; }
interface PolicyResult { level: string; code: string; message: string; field?: string; }

const STEPS = ["Basics", "Targeting & Budget", "Ad Set & Format", "Creative & Ad", "Review"];

const EK53_COUNTRIES = [
  "Germany", "United States", "Azerbaijan", "United Arab Emirates",
  "United Kingdom", "France", "Ireland", "Spain", "Canada", "Qatar",
  "Kazakhstan", "Egypt", "Nigeria", "Norway", "Uzbekistan", "Poland",
  "Romania", "Russia", "Senegal", "Saudi Arabia",
];

const ALL_COUNTRIES = [
  ...EK53_COUNTRIES,
  "Italy", "Netherlands", "Belgium", "Austria", "Sweden", "Denmark",
  "Finland", "Portugal", "Greece", "Czech Republic", "Hungary",
  "Australia", "Japan", "South Korea", "Brazil", "Mexico", "India",
  "China", "Turkey", "Israel", "South Africa",
].sort();

const OBJECTIVES = [
  { value: "OUTCOME_LEADS", label: "Lead Generation" },
  { value: "OUTCOME_TRAFFIC", label: "Traffic" },
  { value: "OUTCOME_AWARENESS", label: "Awareness" },
  { value: "OUTCOME_SALES", label: "Conversions" },
];

const AD_FORMATS = [
  { value: "lead_form", label: "Lead Form" },
  { value: "landing_page", label: "Landing Page" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "ig_dm", label: "Instagram DM" },
  { value: "funnel", label: "Funnel" },
];

export default function NewCampaignPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [clients, setClients] = useState<Client[]>([]);
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [policyResults, setPolicyResults] = useState<PolicyResult[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    clientId: "",
    metaAdAccountId: "",
    campaignType: "standard",
    objective: "OUTCOME_LEADS",
    treatmentCategory: "",
    targetCountries: [] as string[],
    dailyBudget: "",
    lifetimeBudget: "",
    budgetCurrency: "USD",
    startDate: "",
    endDate: "",
    adFormat: "lead_form",
    optimizationGoal: "LEAD_GENERATION",
    bidStrategy: "LOWEST_COST_WITHOUT_CAP",
    adCopy: "",
    headline: "",
    description: "",
    hasWhatsAppField: true,
    hasDisclaimer: false,
  });

  useEffect(() => {
    fetch("/api/clients").then((r) => r.json()).then(setClients);
  }, []);

  const updateField = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleCountry = (country: string) => {
    setForm((prev) => ({
      ...prev,
      targetCountries: prev.targetCountries.includes(country)
        ? prev.targetCountries.filter((c) => c !== country)
        : [...prev.targetCountries, country],
    }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/meta/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          dailyBudget: form.dailyBudget ? parseInt(form.dailyBudget) : null,
          lifetimeBudget: form.lifetimeBudget ? parseInt(form.lifetimeBudget) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.blockers) {
          setPolicyResults(data.blockers);
          return;
        }
        alert(data.error);
        return;
      }
      if (data.policyResults) setPolicyResults(data.policyResults);
      router.push(`/campaigns/${data.campaign.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  const ek53Count = form.targetCountries.filter((c) => EK53_COUNTRIES.includes(c)).length;
  const incentiveRate = form.targetCountries.length === 0 ? null
    : ek53Count === form.targetCountries.length ? 70
    : ek53Count > 0 ? "50-70" : 50;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h1 className="text-2xl font-bold">New Campaign</h1>

      <div className="flex gap-2">
        {STEPS.map((s, i) => (
          <Badge key={s} className={i === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}>
            {i + 1}. {s}
          </Badge>
        ))}
      </div>

      {step === 0 && (
        <Card className="p-6 flex flex-col gap-4">
          <div>
            <Label>Campaign Name</Label>
            <Input value={form.name} onChange={(e) => updateField("name", e.target.value)} placeholder="e.g. Rhinoplasty DE Q1 2026" />
          </div>
          <div>
            <Label>Client</Label>
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={form.clientId} onChange={(e) => updateField("clientId", e.target.value)}>
              <option value="">Select client...</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
            </select>
          </div>
          <div>
            <Label>Objective</Label>
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={form.objective} onChange={(e) => updateField("objective", e.target.value)}>
              {OBJECTIVES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Treatment Category</Label>
            <Input value={form.treatmentCategory} onChange={(e) => updateField("treatmentCategory", e.target.value)} placeholder="e.g. rhinoplasty, dental, bariatric" />
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card className="p-6 flex flex-col gap-4">
          <div>
            <Label>Target Countries</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {ALL_COUNTRIES.map((country) => (
                <button
                  key={country}
                  type="button"
                  onClick={() => toggleCountry(country)}
                  className={`px-2 py-1 text-xs rounded-md border ${form.targetCountries.includes(country) ? "bg-primary text-primary-foreground" : "bg-background"}`}
                >
                  {country} {EK53_COUNTRIES.includes(country) && "★"}
                </button>
              ))}
            </div>
            {incentiveRate && (
              <p className="text-sm text-muted-foreground mt-2">Incentive rate: {incentiveRate}% ({ek53Count} EK-53 countries selected)</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Daily Budget ({form.budgetCurrency})</Label>
              <Input type="number" value={form.dailyBudget} onChange={(e) => updateField("dailyBudget", e.target.value)} />
            </div>
            <div>
              <Label>Lifetime Budget ({form.budgetCurrency})</Label>
              <Input type="number" value={form.lifetimeBudget} onChange={(e) => updateField("lifetimeBudget", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={form.startDate} onChange={(e) => updateField("startDate", e.target.value)} />
            </div>
            <div>
              <Label>End Date</Label>
              <Input type="date" value={form.endDate} onChange={(e) => updateField("endDate", e.target.value)} />
            </div>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="p-6 flex flex-col gap-4">
          <div>
            <Label>Ad Format</Label>
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={form.adFormat} onChange={(e) => updateField("adFormat", e.target.value)}>
              {AD_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Bid Strategy</Label>
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={form.bidStrategy} onChange={(e) => updateField("bidStrategy", e.target.value)}>
              <option value="LOWEST_COST_WITHOUT_CAP">Lowest Cost (default)</option>
              <option value="COST_CAP">Cost Cap</option>
              <option value="BID_CAP">Bid Cap</option>
            </select>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="p-6 flex flex-col gap-4">
          <div>
            <Label>Ad Copy (Primary Text)</Label>
            <Textarea rows={4} value={form.adCopy} onChange={(e) => updateField("adCopy", e.target.value)} placeholder="Main ad text..." />
          </div>
          <div>
            <Label>Headline</Label>
            <Input value={form.headline} onChange={(e) => updateField("headline", e.target.value)} placeholder="Ad headline" />
          </div>
          <div>
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => updateField("description", e.target.value)} placeholder="Short description" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.hasWhatsAppField} onChange={(e) => updateField("hasWhatsAppField", e.target.checked)} />
            <Label>Include WhatsApp field in lead form (mandatory)</Label>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.hasDisclaimer} onChange={(e) => updateField("hasDisclaimer", e.target.checked)} />
            <Label>Includes mandatory İhracatçılar Birliği disclaimer (for agencies)</Label>
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card className="p-6 flex flex-col gap-4">
          <h2 className="font-semibold text-lg">Review Campaign</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">Name:</span><span>{form.name}</span>
            <span className="text-muted-foreground">Objective:</span><span>{OBJECTIVES.find((o) => o.value === form.objective)?.label}</span>
            <span className="text-muted-foreground">Countries:</span><span>{form.targetCountries.join(", ") || "—"}</span>
            <span className="text-muted-foreground">Budget:</span><span>{form.dailyBudget ? `${form.budgetCurrency} ${form.dailyBudget}/day` : form.lifetimeBudget ? `${form.budgetCurrency} ${form.lifetimeBudget} lifetime` : "—"}</span>
            <span className="text-muted-foreground">Format:</span><span>{AD_FORMATS.find((f) => f.value === form.adFormat)?.label}</span>
            <span className="text-muted-foreground">Incentive:</span><span>{incentiveRate ? `${incentiveRate}%` : "—"}</span>
          </div>
          {policyResults.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              <h3 className="font-semibold">Policy Check Results</h3>
              {policyResults.map((r, i) => (
                <div key={i} className={`text-sm p-2 rounded ${r.level === "blocker" ? "bg-red-50 text-red-800 border border-red-200" : r.level === "warning" ? "bg-yellow-50 text-yellow-800 border border-yellow-200" : "bg-blue-50 text-blue-800 border border-blue-200"}`}>
                  <strong>{r.level.toUpperCase()}:</strong> {r.message}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          Previous
        </Button>
        {step < 4 ? (
          <Button onClick={() => setStep((s) => s + 1)}>
            Next
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Creating..." : "Create Campaign"}
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the wizard renders**

Run: `cd apps/web && pnpm dev`
Navigate to `/campaigns/new` in browser. Step through all 5 wizard steps. Expected: All steps render correctly with form fields.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/campaigns/new/page.tsx
git commit -m "feat: add 5-step campaign creation wizard with policy checks"
```

---

### Task 10: Campaign Detail Page

**Files:**
- Create: `apps/web/app/(dashboard)/campaigns/[id]/page.tsx`

**Interfaces:**
- Consumes: DB schemas (`campaigns`, `adSets`, `ads`, `leads`, `clients`), `auth()`, existing UI components (Tabs, Table, Badge, Card, Button).
- Produces: Campaign detail page with tabs: Overview, Ad Sets, Ads, Leads.

- [ ] **Step 1: Create `apps/web/app/(dashboard)/campaigns/[id]/page.tsx`**

```typescript
import { db } from "@/lib/db";
import { campaigns, adSets, ads, leads, clients } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  pending_approval: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  live: "bg-green-100 text-green-800",
  paused: "bg-orange-100 text-orange-800",
  rejected: "bg-red-100 text-red-800",
};

const leadStatusColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  contacted: "bg-yellow-100 text-yellow-800",
  qualified: "bg-purple-100 text-purple-800",
  converted: "bg-green-100 text-green-800",
  lost: "bg-red-100 text-red-800",
};

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) notFound();

  const { id } = await params;

  const [campaign] = await db.select({
    id: campaigns.id,
    name: campaigns.name,
    status: campaigns.approvalStatus,
    metaStatus: campaigns.metaStatus,
    metaCampaignId: campaigns.metaCampaignId,
    objective: campaigns.objective,
    dailyBudget: campaigns.dailyBudget,
    lifetimeBudget: campaigns.lifetimeBudget,
    budgetCurrency: campaigns.budgetCurrency,
    treatmentCategory: campaigns.treatmentCategory,
    targetCountries: campaigns.targetCountries,
    startDate: campaigns.startDate,
    endDate: campaigns.endDate,
    clientName: clients.name,
    clientType: clients.type,
    createdAt: campaigns.createdAt,
  }).from(campaigns)
    .innerJoin(clients, eq(campaigns.clientId, clients.id))
    .where(eq(campaigns.id, id))
    .limit(1);

  if (!campaign) notFound();

  const campaignAdSets = await db.select().from(adSets)
    .where(eq(adSets.campaignId, id));

  const adSetIds = campaignAdSets.map((s) => s.id);
  const campaignAds = adSetIds.length > 0
    ? await db.select().from(ads).where(
        eq(ads.adSetId, adSetIds[0])
      )
    : [];

  const campaignLeads = await db.select().from(leads)
    .where(eq(leads.campaignId, id));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <p className="text-sm text-muted-foreground">{campaign.clientName} &middot; {campaign.treatmentCategory || "No category"}</p>
        </div>
        <div className="flex gap-2">
          <Badge className={statusColors[campaign.status] || ""}>
            {campaign.status.replace("_", " ")}
          </Badge>
          {campaign.metaStatus && (
            <Badge variant="outline">Meta: {campaign.metaStatus}</Badge>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="adsets">Ad Sets ({campaignAdSets.length})</TabsTrigger>
          <TabsTrigger value="ads">Ads ({campaignAds.length})</TabsTrigger>
          <TabsTrigger value="leads">Leads ({campaignLeads.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Objective</p>
              <p className="font-semibold">{campaign.objective || "—"}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Daily Budget</p>
              <p className="font-semibold">{campaign.dailyBudget ? `${campaign.budgetCurrency} ${campaign.dailyBudget}` : "—"}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Countries</p>
              <p className="font-semibold">{(campaign.targetCountries as string[] || []).length} countries</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Period</p>
              <p className="font-semibold">
                {campaign.startDate ? new Date(campaign.startDate).toLocaleDateString() : "—"}
                {campaign.endDate ? ` — ${new Date(campaign.endDate).toLocaleDateString()}` : ""}
              </p>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="adsets">
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Optimization</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaignAdSets.map((set) => (
                <TableRow key={set.id}>
                  <TableCell className="font-medium">{set.name}</TableCell>
                  <TableCell>{set.adFormat || "—"}</TableCell>
                  <TableCell>{set.optimizationGoal || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{set.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {campaignAdSets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No ad sets yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="ads">
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>Ad ID</TableHead>
                <TableHead>Meta ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaignAds.map((ad) => (
                <TableRow key={ad.id}>
                  <TableCell className="font-mono text-xs">{ad.id.slice(0, 8)}</TableCell>
                  <TableCell>{ad.metaAdId || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{ad.status}</Badge>
                  </TableCell>
                  <TableCell>{new Date(ad.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
              {campaignAds.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No ads yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="leads">
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaignLeads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">{lead.name || "—"}</TableCell>
                  <TableCell>{lead.whatsapp || lead.phone || "—"}</TableCell>
                  <TableCell>{lead.country || "—"}</TableCell>
                  <TableCell>
                    <Badge className={leadStatusColors[lead.status] || ""}>
                      {lead.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(lead.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
              {campaignLeads.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No leads yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Verify the page renders**

Run dev server, navigate to `/campaigns/<any-id>`. Since no campaigns exist yet, it should return 404. Create a campaign via the wizard first, then view its detail page.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/campaigns/\[id\]/page.tsx
git commit -m "feat: add campaign detail page with overview, ad sets, ads, and leads tabs"
```

---

### Task 11: Leads List Page

**Files:**
- Create: `apps/web/app/(dashboard)/leads/page.tsx`

**Interfaces:**
- Consumes: DB schemas (`leads`, `campaigns`, `clients`), `auth()`, existing UI components.
- Produces: `/leads` page with lead table and status badges.

- [ ] **Step 1: Create `apps/web/app/(dashboard)/leads/page.tsx`**

```typescript
import { db } from "@/lib/db";
import { leads, campaigns, clients } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";

const statusColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  contacted: "bg-yellow-100 text-yellow-800",
  qualified: "bg-purple-100 text-purple-800",
  converted: "bg-green-100 text-green-800",
  lost: "bg-red-100 text-red-800",
};

export default async function LeadsPage() {
  const session = await auth();
  const orgId = (session?.user as any)?.orgId;

  const allLeads = await db
    .select({
      id: leads.id,
      name: leads.name,
      email: leads.email,
      phone: leads.phone,
      whatsapp: leads.whatsapp,
      country: leads.country,
      status: leads.status,
      source: leads.source,
      campaignName: campaigns.name,
      clientName: clients.name,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .innerJoin(clients, eq(leads.clientId, clients.id))
    .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
    .where(eq(clients.orgId, orgId))
    .orderBy(leads.createdAt);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Leads</h1>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>WhatsApp</TableHead>
            <TableHead>Country</TableHead>
            <TableHead>Campaign</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allLeads.map((lead) => (
            <TableRow key={lead.id}>
              <TableCell className="font-medium">{lead.name || "—"}</TableCell>
              <TableCell>{lead.whatsapp || lead.phone || "—"}</TableCell>
              <TableCell>{lead.country || "—"}</TableCell>
              <TableCell>{lead.campaignName || "—"}</TableCell>
              <TableCell>{lead.clientName}</TableCell>
              <TableCell>
                <Badge className={statusColors[lead.status] || ""}>
                  {lead.status}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{lead.source.replace("_", " ")}</Badge>
              </TableCell>
              <TableCell>{new Date(lead.createdAt).toLocaleDateString()}</TableCell>
            </TableRow>
          ))}
          {allLeads.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                No leads yet. Leads will appear here when synced from Meta or received via webhook.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Verify the page renders**

Run dev server, navigate to `/leads`. Expected: empty lead table.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/leads/page.tsx
git commit -m "feat: add leads list page with status management"
```

---

### Task 12: Creatives Library Page

**Files:**
- Create: `apps/web/app/(dashboard)/creatives/page.tsx`

**Interfaces:**
- Consumes: DB schemas (`creatives`, `metaAdAccounts`, `clients`), `auth()`, existing UI components.
- Produces: `/creatives` page with grid view of synced creatives.

- [ ] **Step 1: Create `apps/web/app/(dashboard)/creatives/page.tsx`**

```typescript
import { db } from "@/lib/db";
import { creatives, metaAdAccounts, clients } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export default async function CreativesPage() {
  const session = await auth();
  const orgId = (session?.user as any)?.orgId;

  const allCreatives = await db
    .select({
      id: creatives.id,
      type: creatives.type,
      treatmentCategory: creatives.treatmentCategory,
      targetCountry: creatives.targetCountry,
      language: creatives.language,
      thumbnailUrl: creatives.thumbnailUrl,
      mediaUrl: creatives.mediaUrl,
      syncedAt: creatives.syncedAt,
      createdAt: creatives.createdAt,
    })
    .from(creatives)
    .innerJoin(metaAdAccounts, eq(creatives.sourceAdAccountId, metaAdAccounts.id))
    .innerJoin(clients, eq(metaAdAccounts.clientId, clients.id))
    .where(eq(clients.orgId, orgId))
    .orderBy(creatives.createdAt);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Creatives</h1>

      {allCreatives.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          No creatives yet. Creatives will appear here after syncing from Meta.
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {allCreatives.map((creative) => (
            <Card key={creative.id} className="overflow-hidden">
              <div className="aspect-square bg-muted flex items-center justify-center">
                {creative.thumbnailUrl ? (
                  <img src={creative.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-muted-foreground text-sm">No preview</span>
                )}
              </div>
              <div className="p-3 flex flex-col gap-1">
                <Badge variant="outline" className="w-fit capitalize">{creative.type}</Badge>
                <p className="text-xs text-muted-foreground">
                  {creative.treatmentCategory || "Uncategorized"}
                  {creative.targetCountry && ` · ${creative.targetCountry}`}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the page renders**

Run dev server, navigate to `/creatives`. Expected: empty grid with message.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/creatives/page.tsx
git commit -m "feat: add creatives library page with grid view"
```

---

### Task 13: Final Verification and Deploy

**Files:**
- No new files — verification only.

- [ ] **Step 1: Full TypeScript check**

Run: `cd apps/web && npx tsc --noEmit --pretty`
Expected: No type errors.

- [ ] **Step 2: Build check**

Run: `cd apps/web && npx next build`
Expected: Build succeeds with standalone output.

- [ ] **Step 3: Run dev server and test all pages**

Run: `cd apps/web && pnpm dev`

Verify these routes render:
1. `/campaigns` — campaign list page
2. `/campaigns/new` — step through all 5 wizard steps
3. `/creatives` — creative library
4. `/leads` — leads list
5. Sidebar — verify Leads link appears

- [ ] **Step 4: Push to GitHub**

```bash
git push origin main
```

Coolify will auto-deploy from the main branch push.

- [ ] **Step 5: Verify production deployment**

Check the Coolify deployment status and verify the app is running at the production URL.
