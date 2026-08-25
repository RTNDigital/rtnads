# Meta Ads API Integration Design Spec

## Overview

Full campaign management integration with Meta Marketing API v21.0 for health tourism ad campaigns. Bi-directional sync between RTNADS and Meta — create, edit, publish campaigns from RTNADS and sync existing active campaigns from Meta.

**Approach:** Direct Next.js API Integration — `lib/meta/` client layer with Next.js API routes, no separate backend service.

**Access Model:** Business Manager partnership. RTN House holds a System User Token on its BM. Client ad accounts are accessed through BM partnerships — no per-client OAuth flow needed.

**Existing Permissions (16 approved):** `ads_management`, `ads_read`, `leads_retrieval`, `pages_manage_ads`, `pages_manage_metadata`, `pages_show_list`, `pages_read_engagement`, `pages_messaging`, `business_management`, `whatsapp_business_messaging`, `whatsapp_business_management`, `instagram_basic`, `instagram_manage_messages`, `public_profile`, `Business Asset User Profile Access`.

---

## 1. Architecture & Data Flow

### File Structure

```
apps/web/lib/meta/
  client.ts           — Base Meta API client (fetch wrapper, auth, rate limiting, error mapping)
  campaigns.ts        — Campaign CRUD operations
  adsets.ts           — Ad Set CRUD operations
  ads.ts              — Ad CRUD operations
  creatives.ts        — Creative management & media upload
  lead-forms.ts       — Lead form CRUD
  insights.ts         — Performance data fetching
  sync.ts             — Sync engine (full + incremental)
  types.ts            — Meta API request/response types
  policy-checker.ts   — Health tourism policy validation

apps/web/app/api/meta/
  campaigns/route.ts       — Campaign API endpoints
  adsets/route.ts          — Ad Set API endpoints
  ads/route.ts             — Ad API endpoints
  creatives/route.ts       — Creative management endpoints
  lead-forms/route.ts      — Lead form endpoints
  insights/route.ts        — Performance data endpoints
  sync/route.ts            — Manual sync trigger
  webhook/route.ts         — Lead webhook receiver (no auth — Meta sends directly)

apps/web/app/api/cron/
  sync/route.ts            — Periodic sync (campaign state every 15 min, insights every 1 hour)

apps/web/app/(dashboard)/campaigns/
  page.tsx                 — Campaign list with filters and bulk actions
  new/page.tsx             — Campaign creation wizard (5 steps)
  [id]/page.tsx            — Campaign detail with tabs (Overview, Ad Sets, Ads, Insights, Leads)

apps/web/app/(dashboard)/creatives/
  page.tsx                 — Creative library (grid view, filter by category/country)

apps/web/app/(dashboard)/leads/
  page.tsx                 — Lead list with status management
```

### Campaign Lifecycle

```
Draft → Approval → Push to Meta → Live → Sync
  │         │           │           │        │
  │         │           │           │        └─ Periodic sync updates status & metrics
  │         │           │           └─ Meta returns campaign_id, status goes "live"
  │         │           └─ API call to Meta Marketing API
  │         └─ Senior user approves (role check)
  └─ Junior creates campaign in RTNADS
```

For existing Meta campaigns (initial sync): Meta → Pull → Create in RTNADS DB → Live (bi-directional from here).

### Data Flow

- **Outbound (RTNADS → Meta):** User creates/edits campaign → API route validates → `lib/meta/` client calls Meta API → Response updates DB
- **Inbound (Meta → RTNADS):** Cron sync pulls changes → Upsert DB records. Lead webhook receives leads in real-time.
- **Conflict Resolution:** Meta is source of truth for campaign status. If RTNADS and Meta disagree on status, Meta wins. Budget and creative changes require explicit push from RTNADS.

---

## 2. Meta API Client Layer

### Base Client (`lib/meta/client.ts`)

```typescript
const META_API_VERSION = "v21.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

async function metaFetch<T>(path: string, options?: {
  method?: string;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
}): Promise<T>
```

Responsibilities:
- Attach System User Token from `META_SYSTEM_TOKEN` env variable
- Rate limiting: track calls per account, respect 200 calls/hour per ad account
- Error mapping: Meta error codes → user-friendly messages
- Retry logic: exponential backoff for rate limits (error code 17) and transient errors (code 2)
- Request logging for debugging

### Campaign Operations (`lib/meta/campaigns.ts`)

```typescript
async function createCampaign(accountId: string, data: CreateCampaignInput): Promise<string>
async function updateCampaign(campaignId: string, data: UpdateCampaignInput): Promise<void>
async function getCampaign(campaignId: string, fields: string[]): Promise<MetaCampaign>
async function listCampaigns(accountId: string, filters?: CampaignFilters): Promise<MetaCampaign[]>
async function updateCampaignStatus(campaignId: string, status: "ACTIVE" | "PAUSED"): Promise<void>
```

### Ad Set Operations (`lib/meta/adsets.ts`)

```typescript
async function createAdSet(campaignId: string, data: CreateAdSetInput): Promise<string>
async function updateAdSet(adSetId: string, data: UpdateAdSetInput): Promise<void>
async function getAdSet(adSetId: string, fields: string[]): Promise<MetaAdSet>
async function listAdSets(campaignId: string): Promise<MetaAdSet[]>
```

### Ad Operations (`lib/meta/ads.ts`)

```typescript
async function createAd(adSetId: string, data: CreateAdInput): Promise<string>
async function updateAd(adId: string, data: UpdateAdInput): Promise<void>
async function getAd(adId: string, fields: string[]): Promise<MetaAd>
async function listAds(adSetId: string): Promise<MetaAd[]>
```

### Lead Form Operations (`lib/meta/lead-forms.ts`)

```typescript
async function createLeadForm(pageId: string, data: CreateLeadFormInput): Promise<string>
async function getLeadForm(formId: string): Promise<MetaLeadForm>
async function listLeadForms(pageId: string): Promise<MetaLeadForm[]>
async function getLeadFormData(formId: string, since?: Date): Promise<MetaLead[]>
```

### Insights (`lib/meta/insights.ts`)

```typescript
async function getInsights(objectId: string, params: {
  level: "campaign" | "adset" | "ad";
  fields: string[];
  dateRange: { since: string; until: string };
  timeIncrement?: number;
}): Promise<MetaInsight[]>
```

Fields: `spend`, `impressions`, `clicks`, `cpc`, `cpm`, `ctr`, `conversions`, `cost_per_result`, `reach`, `frequency`.

### Creative Operations (`lib/meta/creatives.ts`)

```typescript
async function createCreative(accountId: string, data: CreateCreativeInput): Promise<string>
async function uploadImage(accountId: string, imageUrl: string): Promise<{ hash: string }>
async function uploadVideo(accountId: string, videoUrl: string): Promise<{ id: string }>
async function getCreatives(accountId: string): Promise<MetaCreative[]>
```

---

## 3. UI & Campaign Management Flow

### Sidebar Additions

New items under existing navigation:
- **Campaigns** — campaign list and management
- **Creatives** — creative library
- **Leads** — lead management

### Campaign List Page (`/campaigns`)

- Table view: Campaign name, Status (color-coded badge), Daily Budget, Spend (today), Impressions, Clicks, CTR, Leads, CPL
- Filters: Status (All/Active/Paused/Draft), Client, Date range
- Bulk actions: Pause selected, Activate selected
- "New Campaign" button → wizard
- "Sync Now" button → triggers manual full sync
- Last sync timestamp shown

### Campaign Creation Wizard (5 Steps)

**Step 1: Basics**
- Campaign name
- Client (select from existing clients)
- Ad Account (auto-populated from client's linked accounts)
- Campaign type: Standard / Event
- Objective: Lead Generation / Conversions / Traffic / Awareness
- Treatment category (dropdown from knowledge base categories)

**Step 2: Targeting & Budget**
- Target countries (multi-select with EK-53 badge)
- Language selection (blocked if Turkish is selected)
- Age range, gender
- Interest targeting (free-text tags)
- Daily budget / Lifetime budget
- Start & end dates
- Incentive rate auto-calculated based on target countries

**Step 3: Ad Set & Format**
- Ad format: Lead Form / Landing Page / WhatsApp / Instagram DM / Funnel
- Optimization goal based on format
- Bid strategy: Lowest Cost (default) / Cost Cap / Bid Cap
- Placement: Automatic (default) or Manual

**Step 4: Creative & Ad**
- Select from creative library or upload new
- Ad copy (primary text, headline, description)
- Call to action button
- Lead form configuration (if lead form format):
  - Select existing form or create new
  - Questions from category template (auto-suggested)
  - WhatsApp field (mandatory, auto-added with "Whats.App" bypass)

**Step 5: Review & Policy Check**
- Summary of all settings
- Automated policy checks run:
  1. Turkish text detection → BLOCKER if found
  2. EK-53 incentive rate display → INFO
  3. Mandatory disclaimer check (for agency clients) → BLOCKER if missing
  4. WhatsApp field in lead form → BLOCKER if missing
  5. Europe targeting + WhatsApp → WARNING (no WhatsApp conversation optimization)
  6. GDPR notice for EU targeting → WARNING
- Save as Draft / Submit for Approval

### Policy Checker (`lib/meta/policy-checker.ts`)

```typescript
interface PolicyCheckResult {
  level: "blocker" | "warning" | "info";
  code: string;
  message: string;
  field?: string;
}

function checkCampaignPolicies(campaign: CampaignDraft): PolicyCheckResult[]
```

Checks implemented:
- `TURKISH_TEXT`: Scan ad copy, headline, description, lead form questions for Turkish characters/words. Level: blocker.
- `EK53_INCENTIVE`: Check target countries against EK-53 list. Display incentive rate (70% or 50%). Level: info.
- `MANDATORY_DISCLAIMER`: For agency-type clients, check if disclaimer text is present in ad copy. Level: blocker.
- `WHATSAPP_REQUIRED`: Check lead form has WhatsApp field. Level: blocker.
- `EUROPE_WHATSAPP`: If targeting European countries + WhatsApp format, warn about no conversation optimization. Level: warning.
- `GDPR_NOTICE`: If targeting EU countries, display GDPR compliance reminder. Level: warning.

### Campaign Detail Page (`/campaigns/[id]`)

Tabbed layout:
- **Overview:** Status, budget, schedule, policy check results, quick actions (Pause/Activate/Edit)
- **Ad Sets:** List of ad sets under this campaign with performance summary
- **Ads:** List of ads with creative preview, status, per-ad metrics
- **Insights:** Charts — spend over time, impressions/clicks trend, CTR/CPL trends, breakdown by country/age/gender
- **Leads:** Leads attributed to this campaign with status management

---

## 4. DB Schema Updates

### New Tables

**`leads` table:**

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

**`syncLogs` table:**

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

### Column Additions to Existing Tables

- `metaAdAccounts.lastSyncedAt` — `timestamp("last_synced_at")` — tracks last successful sync
- `campaigns.metaStatus` — `text("meta_status")` — Meta's actual status, independent of RTNADS approval status

---

## 5. Lead Webhook

### Endpoint: `app/api/meta/webhook/route.ts`

**GET handler** (webhook verification):
- Meta sends `hub.mode`, `hub.verify_token`, `hub.challenge`
- Verify token matches `META_WEBHOOK_VERIFY_TOKEN` env variable
- Return `hub.challenge` on success

**POST handler** (lead notification):
- Parse incoming lead payload
- Extract: lead ID, form ID, field data (name, email, phone, answers)
- Deduplicate by `metaLeadId`
- Map form fields to lead record (extract WhatsApp from custom fields)
- Insert into `leads` table
- No auth middleware on this route — Meta sends directly; security via verify token signature validation (`X-Hub-Signature-256` header with `META_APP_SECRET`)

---

## 6. Sync Engine

### Full Sync (`lib/meta/sync.ts`)

Triggered on:
- First ad account connection
- Manual "Sync Now" button

Process:
1. Fetch all campaigns for the account → upsert `campaigns` table
2. For each campaign, fetch ad sets → upsert `adSets` table
3. For each ad set, fetch ads → upsert `ads` table
4. Fetch lead forms for the page → upsert `leadForms` table
5. Fetch creatives for the account → upsert `creatives` table
6. Fetch insights for last 30 days → insert `creativePerformance` records
7. Update `metaAdAccounts.lastSyncedAt`
8. Log to `syncLogs`

Match by Meta ID fields (`metaCampaignId`, `metaAdsetId`, etc.) for upserts.

### Incremental Sync (Cron)

**Campaign sync (every 15 minutes):**
- For each active ad account, fetch campaigns with `updated_since` parameter
- Update campaign/adset/ad statuses and budgets
- Detect new campaigns created directly in Meta → create DB records

**Insights sync (every 1 hour):**
- Fetch last 7 days of performance data
- Upsert by date range + entity ID

### Cron Route (`app/api/cron/sync/route.ts`)

- Protected by `CRON_SECRET` env variable (header check)
- External cron service (Coolify cron or similar) hits this endpoint on schedule
- Runs accounts sequentially (not parallel) to respect rate limits
- Skips accounts that fail, logs errors, continues to next

### Rate Limit Strategy

- Max 200 API calls per account per hour (Meta tier-based limit)
- Track call count per account in memory (reset hourly)
- If limit approaching: queue remaining work for next sync cycle
- Multiple accounts: process sequentially with per-account tracking

---

## 7. Security

- `META_SYSTEM_TOKEN` stored only in env variable, never in DB
- `META_WEBHOOK_VERIFY_TOKEN` separate env variable for webhook verification
- `META_APP_SECRET` for webhook signature validation (`X-Hub-Signature-256`)
- All Meta API calls are server-side only (no client component access to Meta endpoints)
- API routes require authenticated session (except webhook route)
- Role-based access: junior users can create campaigns but cannot publish (approval workflow requires senior/admin role)

---

## 8. Error Handling

| Meta Error Code | Meaning | Action |
|---|---|---|
| 17 | Rate limit hit | Exponential backoff, retry up to 3 times |
| 2 | Temporary error | Retry once after 5 seconds |
| 190 | Token expired/invalid | Log, surface "Meta connection expired — reconnect" to user |
| 100 | Invalid parameter | Map to field-level validation error, show to user |
| 10 | Permission denied | Log, surface "Missing permission" with specific permission name |

User-facing error messages are always in the UI language, not raw Meta API errors.

Sync errors are logged to `syncLogs` with the error detail. Dashboard shows last sync status (green check / red warning) per account.

---

## 9. Environment Variables

New env variables required:

```
META_SYSTEM_TOKEN=        # BM System User long-lived token
META_APP_SECRET=          # Meta app secret for webhook signature
META_WEBHOOK_VERIFY_TOKEN=# Custom string for webhook verification
CRON_SECRET=              # Secret for cron endpoint authentication
```

---

## 10. Out of Scope (v1)

- Lookalike audience creation
- A/B test automation
- Automatic bid optimization
- Google Ads integration (separate plan)
- Custom conversion tracking setup
- Automated creative generation
