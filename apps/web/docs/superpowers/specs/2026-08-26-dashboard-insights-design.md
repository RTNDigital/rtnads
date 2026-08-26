# Dashboard & Meta Insights Design

## Goal

Replace the static dashboard with live metrics from the database and fix the insights sync so campaign performance data is persisted. The dashboard surfaces four views: summary cards, campaign performance table, lead trend chart, and country distribution.

## Architecture

Server-rendered Next.js dashboard page with real DB queries. A new `campaign_insights` table stores daily campaign-level performance data synced from Meta Marketing API. Charts rendered client-side with Recharts (lightweight, React-native).

## Tech Stack

- Drizzle ORM (existing)
- Neon PostgreSQL (existing)
- Meta Marketing API v21.0 (existing `metaFetch` client)
- Recharts for charts (new dependency)
- Next.js server components for data fetching (existing pattern)

## Global Constraints

- Turkey (TR) must ALWAYS be excluded from ad targeting
- All DB queries must be scoped to the user's `orgId`
- Meta API rate limit: 200 calls/hour/account (existing `checkRateLimit`)
- No external CDN scripts (CSP constraint for artifacts, but Recharts is bundled)

---

## 1. Database: `campaign_insights` Table

Add to `apps/web/lib/db/schema/meta.ts`:

```
campaignInsights table:
  id: uuid PK
  campaignId: uuid FK -> campaigns.id (cascade delete)
  date: timestamp (the day this insight covers)
  impressions: integer default 0
  clicks: integer default 0
  ctr: real default 0
  reach: integer default 0
  spend: real default 0
  leads: integer default 0
  cpl: real default 0
  cpc: real default 0
  cpm: real default 0
  frequency: real default 0
  createdAt: timestamp
  updatedAt: timestamp

Unique constraint: (campaignId, date)
```

Export from `schema/index.ts`.

## 2. Fix `incrementalInsightsSync`

Current state: fetches campaign-level insights but does NOT persist them (TODO comment in code).

Fix:
1. Fetch insights at campaign level with `timeIncrement: 1` (daily granularity) — already done
2. For each insight row, find the matching campaign by `metaCampaignId` (the insight's `campaign_id` field — need to add this to the fields list or use the objectId)
3. Parse `actions` array for `lead` action type to get lead count
4. Upsert into `campaign_insights` with `onConflictDoUpdate` on `(campaignId, date)`
5. Compute CPL: `spend / leads` (guard division by zero)

Change the fetch to iterate per-campaign instead of account-level, so each insight row maps to a known campaign:

```
for each campaign in DB where metaCampaignId is not null:
  insights = getInsights(campaign.metaCampaignId, { level: "campaign", dateRange, timeIncrement: 1 })
  for each insight:
    upsert campaignInsights (campaignId, date, impressions, clicks, ...)
```

Date range: last 7 days for incremental, last 30 days for full sync.

## 3. Dashboard API

New endpoint: `GET /api/dashboard/stats`

Returns JSON:
```json
{
  "summary": {
    "activeClients": 5,
    "liveCampaigns": 12,
    "monthLeads": 143,
    "monthSpend": 4520.50
  },
  "campaignPerformance": [
    {
      "id": "uuid",
      "name": "Hair Transplant - DE",
      "clientName": "Clinic A",
      "status": "live",
      "impressions": 12500,
      "clicks": 450,
      "ctr": 3.6,
      "leads": 23,
      "cpl": 8.70,
      "spend": 200.10
    }
  ],
  "leadTrend": [
    { "date": "2026-08-20", "count": 12 },
    { "date": "2026-08-21", "count": 18 }
  ],
  "countryDistribution": [
    { "country": "Deutschland", "count": 45 },
    { "country": "United Kingdom", "count": 32 }
  ]
}
```

Queries:
- `activeClients`: count clients where orgId matches
- `liveCampaigns`: count campaigns joined with clients where metaStatus = 'ACTIVE' and orgId matches
- `monthLeads`: count leads joined with clients where createdAt >= first of current month and orgId matches
- `monthSpend`: sum campaign_insights.spend joined through campaigns -> clients where date >= first of month and orgId matches
- `campaignPerformance`: campaigns joined with clients and aggregated campaign_insights (last 7 days), orgId filter
- `leadTrend`: leads grouped by date (last 7 days), orgId filter
- `countryDistribution`: leads grouped by country, orgId filter, top 10

## 4. Dashboard Page

Replace `apps/web/app/(dashboard)/page.tsx` entirely.

Structure: Server component that fetches data, passes to client components for interactive parts (charts).

### 4a. Summary Cards (server rendered)

Four cards in a grid:
- Aktif Müşteriler (icon: users)
- Canlı Kampanyalar (icon: megaphone)
- Bu Ay Lead (icon: contact)
- Bu Ay Harcama (icon: dollar) — formatted with currency

Each card shows the number prominently. Use existing `Card` component from shadcn.

### 4b. Campaign Performance Table (server rendered)

Table with columns: Kampanya, Müşteri, Durum, Impressions, Clicks, CTR%, Leads, CPL, Harcama.

Use existing `Table` components. Status shown as colored badge (existing pattern from campaigns page).

If no insights data: show campaign info with "—" for metric columns.

### 4c. Lead Trend Chart (client component)

Bar chart showing daily lead count for last 7 days.

Recharts `BarChart` with `Bar`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`.

Minimal styling, matches the app's muted color scheme.

### 4d. Country Distribution (client component)

Horizontal bar chart showing top 10 countries by lead count.

Recharts `BarChart` with `layout="vertical"`.

## 5. File Plan

| File | Action | Description |
|------|--------|-------------|
| `lib/db/schema/meta.ts` | Modify | Add `campaignInsights` table |
| `lib/db/schema/index.ts` | Already exports all from meta.ts | No change needed |
| `lib/meta/sync.ts` | Modify | Fix `incrementalInsightsSync` to persist data |
| `app/api/dashboard/stats/route.ts` | Create | Dashboard data API |
| `app/(dashboard)/page.tsx` | Rewrite | Live dashboard with real data |
| `app/(dashboard)/components/stat-cards.tsx` | Create | Summary card component |
| `app/(dashboard)/components/campaign-performance-table.tsx` | Create | Performance table |
| `app/(dashboard)/components/lead-trend-chart.tsx` | Create | Client component, Recharts bar chart |
| `app/(dashboard)/components/country-chart.tsx` | Create | Client component, Recharts horizontal bar |
| `package.json` | Modify | Add `recharts` dependency |

## 6. Migration

New table `campaign_insights` requires a Drizzle migration:
```
npx drizzle-kit generate
npx drizzle-kit push
```

## 7. Non-Goals

- Real-time WebSocket updates (polling/manual refresh is fine)
- Date range picker for dashboard (hardcoded: cards = this month, table = last 7 days, trend = last 7 days)
- Google Ads integration (separate project)
- Export/download functionality
