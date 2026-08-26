# Dashboard & Meta Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static dashboard with live metrics and fix Meta insights sync to persist campaign performance data.

**Architecture:** Server-rendered Next.js dashboard page queries the DB directly. A new `campaign_insights` table stores daily campaign-level performance data synced from Meta. Client-side Recharts components render lead trend and country distribution charts.

**Tech Stack:** Drizzle ORM, Neon PostgreSQL, Meta Marketing API v21.0 (`metaFetch`), Recharts (new), Next.js server components

**Spec:** `apps/web/docs/superpowers/specs/2026-08-26-dashboard-insights-design.md`

## Global Constraints

- Turkey (TR) must ALWAYS be excluded from ad targeting
- All DB queries must be scoped to the user's `orgId`
- Meta API rate limit: 200 calls/hour/account (existing `checkRateLimit` in `lib/meta/client.ts`)
- Recharts is bundled via npm, no CDN

---

### Task 1: Add `campaignInsights` Table and Install Recharts

**Files:**
- Modify: `apps/web/lib/db/schema/meta.ts` (append after `creativePerformance` table, line ~125)
- Modify: `apps/web/package.json` (add `recharts` dependency)

**Interfaces:**
- Consumes: `campaigns` table from same file (FK reference)
- Produces: `campaignInsights` export — used by Task 2 (`incrementalInsightsSync`) and Task 3 (dashboard page). Already re-exported via `schema/index.ts` because it exports `* from "./meta"`.

- [ ] **Step 1: Add `campaignInsights` table to schema**

Open `apps/web/lib/db/schema/meta.ts`. Add this after the `creativePerformance` table (after line 125):

```typescript
import { unique } from "drizzle-orm/pg-core";
```

Add `unique` to the existing import from `drizzle-orm/pg-core` (line 1). The full import becomes:

```typescript
import { pgTable, text, timestamp, uuid, jsonb, integer, real, unique } from "drizzle-orm/pg-core";
```

Then append the table:

```typescript
export const campaignInsights = pgTable("campaign_insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }).notNull(),
  date: timestamp("date").notNull(),
  impressions: integer("impressions").default(0).notNull(),
  clicks: integer("clicks").default(0).notNull(),
  ctr: real("ctr").default(0).notNull(),
  reach: integer("reach").default(0).notNull(),
  spend: real("spend").default(0).notNull(),
  leads: integer("leads").default(0).notNull(),
  cpl: real("cpl").default(0).notNull(),
  cpc: real("cpc").default(0).notNull(),
  cpm: real("cpm").default(0).notNull(),
  frequency: real("frequency").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  unique("campaign_insights_campaign_date_unique").on(t.campaignId, t.date),
]);
```

- [ ] **Step 2: Install Recharts**

```bash
cd apps/web && pnpm add recharts
```

- [ ] **Step 3: Push schema to database**

```bash
cd apps/web && npx drizzle-kit push
```

Verify: the command should show `campaign_insights` table created with the unique constraint.

- [ ] **Step 4: Verify build**

```bash
npx turbo build --filter=web
```

Expected: build succeeds, no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/db/schema/meta.ts apps/web/package.json apps/web/pnpm-lock.yaml
git commit -m "feat(db): add campaignInsights table and recharts dependency"
```

---

### Task 2: Fix `incrementalInsightsSync` to Persist Data

**Files:**
- Modify: `apps/web/lib/meta/sync.ts` (rewrite `incrementalInsightsSync` function, lines 229-265)

**Interfaces:**
- Consumes: `campaignInsights` table from Task 1, `getInsights` from `./insights`, `campaigns` table from schema, `MetaInsight` type from `./types`
- Produces: `incrementalInsightsSync(dbAccountId: string, metaAccountId: string): Promise<{ itemsSynced: number; errors: { message: string; entity?: string }[] }>` — same signature as before, but now persists data into `campaign_insights`

- [ ] **Step 1: Rewrite `incrementalInsightsSync`**

Open `apps/web/lib/meta/sync.ts`. Add `campaignInsights` to the schema import on line 3:

```typescript
import {
  metaAdAccounts, campaigns, adSets, ads,
  leadForms, creatives, syncLogs, campaignInsights,
} from "@/lib/db/schema";
```

Then replace the entire `incrementalInsightsSync` function (lines 229-265) with:

```typescript
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

    const dbCampaigns = await db
      .select({ id: campaigns.id, metaCampaignId: campaigns.metaCampaignId })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.metaAdAccountId, dbAccountId),
          campaigns.metaCampaignId.isNotNull(),
        ),
      );

    for (const campaign of dbCampaigns) {
      try {
        const insights = await getInsights(
          campaign.metaCampaignId!,
          { level: "campaign", dateRange: { since, until }, timeIncrement: 1 },
          metaAccountId,
        );

        for (const insight of insights) {
          const leadCount = insight.actions
            ?.find((a) => a.action_type === "lead")
            ?.value;
          const leadsNum = leadCount ? parseInt(leadCount, 10) : 0;
          const spendNum = parseFloat(insight.spend) || 0;
          const cplNum = leadsNum > 0 ? spendNum / leadsNum : 0;

          await db
            .insert(campaignInsights)
            .values({
              campaignId: campaign.id,
              date: new Date(insight.date_start),
              impressions: parseInt(insight.impressions, 10) || 0,
              clicks: parseInt(insight.clicks, 10) || 0,
              ctr: parseFloat(insight.ctr) || 0,
              reach: parseInt(insight.reach, 10) || 0,
              spend: spendNum,
              leads: leadsNum,
              cpl: cplNum,
              cpc: parseFloat(insight.cpc) || 0,
              cpm: parseFloat(insight.cpm) || 0,
              frequency: parseFloat(insight.frequency) || 0,
            })
            .onConflictDoUpdate({
              target: [campaignInsights.campaignId, campaignInsights.date],
              set: {
                impressions: parseInt(insight.impressions, 10) || 0,
                clicks: parseInt(insight.clicks, 10) || 0,
                ctr: parseFloat(insight.ctr) || 0,
                reach: parseInt(insight.reach, 10) || 0,
                spend: spendNum,
                leads: leadsNum,
                cpl: cplNum,
                cpc: parseFloat(insight.cpc) || 0,
                cpm: parseFloat(insight.cpm) || 0,
                frequency: parseFloat(insight.frequency) || 0,
                updatedAt: new Date(),
              },
            });

          itemsSynced++;
        }
      } catch (e: any) {
        errors.push({ message: e.message, entity: `insights for campaign ${campaign.metaCampaignId}` });
      }
    }
  } catch (e: any) {
    errors.push({ message: e.message, entity: "insights sync" });
  }

  await completeSyncLog(log.id, itemsSynced, errors);
  return { itemsSynced, errors };
}
```

- [ ] **Step 2: Verify build**

```bash
npx turbo build --filter=web
```

Expected: build succeeds. The function signature is unchanged so no callers break.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/meta/sync.ts
git commit -m "fix(meta): persist campaign insights from Meta API sync"
```

---

### Task 3: Dashboard Page and Components

**Files:**
- Rewrite: `apps/web/app/(dashboard)/page.tsx`
- Create: `apps/web/app/(dashboard)/components/stat-cards.tsx`
- Create: `apps/web/app/(dashboard)/components/campaign-performance-table.tsx`
- Create: `apps/web/app/(dashboard)/components/lead-trend-chart.tsx`
- Create: `apps/web/app/(dashboard)/components/country-chart.tsx`

**Interfaces:**
- Consumes: `campaignInsights` from Task 1, `db` from `@/lib/db`, `auth` from `@/lib/auth`, `Card`/`CardHeader`/`CardTitle`/`CardContent` from `@/components/ui/card`, `Table`/`TableHead`/`TableBody`/`TableRow`/`TableCell`/`TableHeader` from `@/components/ui/table`, `Badge` from `@/components/ui/badge`
- Produces: Dashboard page at `/` showing summary cards, campaign table, lead trend chart, country distribution

- [ ] **Step 1: Create `stat-cards.tsx`**

Create `apps/web/app/(dashboard)/components/stat-cards.tsx`:

```typescript
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface StatCardsProps {
  activeClients: number;
  liveCampaigns: number;
  monthLeads: number;
  monthSpend: number;
}

const cards = [
  { key: "activeClients" as const, label: "Aktif Müşteriler", format: (v: number) => String(v) },
  { key: "liveCampaigns" as const, label: "Canlı Kampanyalar", format: (v: number) => String(v) },
  { key: "monthLeads" as const, label: "Bu Ay Lead", format: (v: number) => String(v) },
  { key: "monthSpend" as const, label: "Bu Ay Harcama", format: (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
];

export function StatCards(props: StatCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.key}>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{card.format(props[card.key])}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `campaign-performance-table.tsx`**

Create `apps/web/app/(dashboard)/components/campaign-performance-table.tsx`:

```typescript
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";

interface CampaignRow {
  id: string;
  name: string;
  clientName: string;
  status: string;
  impressions: number;
  clicks: number;
  ctr: number;
  leads: number;
  cpl: number;
  spend: number;
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  pending_approval: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  live: "bg-green-100 text-green-800",
  paused: "bg-orange-100 text-orange-800",
  rejected: "bg-red-100 text-red-800",
};

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtCurrency(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function CampaignPerformanceTable({ campaigns }: { campaigns: CampaignRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Kampanya</TableHead>
          <TableHead>Müşteri</TableHead>
          <TableHead>Durum</TableHead>
          <TableHead className="text-right">Impressions</TableHead>
          <TableHead className="text-right">Clicks</TableHead>
          <TableHead className="text-right">CTR%</TableHead>
          <TableHead className="text-right">Leads</TableHead>
          <TableHead className="text-right">CPL</TableHead>
          <TableHead className="text-right">Harcama</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {campaigns.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="font-medium">{c.name}</TableCell>
            <TableCell>{c.clientName}</TableCell>
            <TableCell>
              <Badge className={statusColors[c.status] || ""}>
                {c.status.replace("_", " ")}
              </Badge>
            </TableCell>
            <TableCell className="text-right">{c.impressions > 0 ? fmt(c.impressions) : "—"}</TableCell>
            <TableCell className="text-right">{c.clicks > 0 ? fmt(c.clicks) : "—"}</TableCell>
            <TableCell className="text-right">{c.ctr > 0 ? c.ctr.toFixed(2) : "—"}</TableCell>
            <TableCell className="text-right">{c.leads > 0 ? fmt(c.leads) : "—"}</TableCell>
            <TableCell className="text-right">{c.cpl > 0 ? fmtCurrency(c.cpl) : "—"}</TableCell>
            <TableCell className="text-right">{c.spend > 0 ? fmtCurrency(c.spend) : "—"}</TableCell>
          </TableRow>
        ))}
        {campaigns.length === 0 && (
          <TableRow>
            <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
              Henüz kampanya yok.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 3: Create `lead-trend-chart.tsx`**

Create `apps/web/app/(dashboard)/components/lead-trend-chart.tsx`:

```typescript
"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface LeadTrendChartProps {
  data: Array<{ date: string; count: number }>;
}

export function LeadTrendChart({ data }: LeadTrendChartProps) {
  if (data.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-8">
        Son 7 günde lead verisi yok.
      </p>
    );
  }

  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }),
  }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={formatted}>
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip
          formatter={(value: number) => [value, "Lead"]}
          labelFormatter={(label: string) => label}
        />
        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 4: Create `country-chart.tsx`**

Create `apps/web/app/(dashboard)/components/country-chart.tsx`:

```typescript
"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface CountryChartProps {
  data: Array<{ country: string; count: number }>;
}

export function CountryChart({ data }: CountryChartProps) {
  if (data.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-8">
        Lead ülke verisi yok.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 36)}>
      <BarChart data={data} layout="vertical" margin={{ left: 80 }}>
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey="country" tick={{ fontSize: 12 }} width={80} />
        <Tooltip formatter={(value: number) => [value, "Lead"]} />
        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 5: Rewrite `page.tsx`**

Replace `apps/web/app/(dashboard)/page.tsx` entirely:

```typescript
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { clients, campaigns, leads, campaignInsights } from "@/lib/db/schema";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCards } from "./components/stat-cards";
import { CampaignPerformanceTable } from "./components/campaign-performance-table";
import { LeadTrendChart } from "./components/lead-trend-chart";
import { CountryChart } from "./components/country-chart";

export default async function DashboardPage() {
  const session = await auth();
  const orgId = (session?.user as any)?.orgId as string;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);

  const [activeClientsResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(clients)
    .where(eq(clients.orgId, orgId));

  const [liveCampaignsResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(campaigns)
    .innerJoin(clients, eq(campaigns.clientId, clients.id))
    .where(and(eq(clients.orgId, orgId), eq(campaigns.metaStatus, "ACTIVE")));

  const [monthLeadsResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .innerJoin(clients, eq(leads.clientId, clients.id))
    .where(and(eq(clients.orgId, orgId), gte(leads.createdAt, monthStart)));

  const [monthSpendResult] = await db
    .select({ total: sql<number>`coalesce(sum(${campaignInsights.spend}), 0)::float` })
    .from(campaignInsights)
    .innerJoin(campaigns, eq(campaignInsights.campaignId, campaigns.id))
    .innerJoin(clients, eq(campaigns.clientId, clients.id))
    .where(and(eq(clients.orgId, orgId), gte(campaignInsights.date, monthStart)));

  const campaignPerformance = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      clientName: clients.name,
      status: campaigns.approvalStatus,
      impressions: sql<number>`coalesce(sum(${campaignInsights.impressions}), 0)::int`,
      clicks: sql<number>`coalesce(sum(${campaignInsights.clicks}), 0)::int`,
      ctr: sql<number>`case when coalesce(sum(${campaignInsights.impressions}), 0) > 0 then (coalesce(sum(${campaignInsights.clicks}), 0)::float / sum(${campaignInsights.impressions}) * 100) else 0 end`,
      leads: sql<number>`coalesce(sum(${campaignInsights.leads}), 0)::int`,
      cpl: sql<number>`case when coalesce(sum(${campaignInsights.leads}), 0) > 0 then (coalesce(sum(${campaignInsights.spend}), 0)::float / sum(${campaignInsights.leads})) else 0 end`,
      spend: sql<number>`coalesce(sum(${campaignInsights.spend}), 0)::float`,
    })
    .from(campaigns)
    .innerJoin(clients, eq(campaigns.clientId, clients.id))
    .leftJoin(
      campaignInsights,
      and(
        eq(campaignInsights.campaignId, campaigns.id),
        gte(campaignInsights.date, sevenDaysAgo),
      ),
    )
    .where(eq(clients.orgId, orgId))
    .groupBy(campaigns.id, clients.name)
    .orderBy(desc(sql`coalesce(sum(${campaignInsights.spend}), 0)`));

  const leadTrend = await db
    .select({
      date: sql<string>`to_char(${leads.createdAt}, 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(leads)
    .innerJoin(clients, eq(leads.clientId, clients.id))
    .where(and(eq(clients.orgId, orgId), gte(leads.createdAt, sevenDaysAgo)))
    .groupBy(sql`to_char(${leads.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${leads.createdAt}, 'YYYY-MM-DD')`);

  const countryDistribution = await db
    .select({
      country: leads.country,
      count: sql<number>`count(*)::int`,
    })
    .from(leads)
    .innerJoin(clients, eq(leads.clientId, clients.id))
    .where(and(eq(clients.orgId, orgId), leads.country.isNotNull()))
    .groupBy(leads.country)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <StatCards
        activeClients={activeClientsResult.count}
        liveCampaigns={liveCampaignsResult.count}
        monthLeads={monthLeadsResult.count}
        monthSpend={monthSpendResult.total}
      />

      <Card>
        <CardHeader>
          <CardTitle>Kampanya Performansı (Son 7 Gün)</CardTitle>
        </CardHeader>
        <CardContent>
          <CampaignPerformanceTable campaigns={campaignPerformance} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lead Trendi (Son 7 Gün)</CardTitle>
          </CardHeader>
          <CardContent>
            <LeadTrendChart data={leadTrend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ülke Dağılımı</CardTitle>
          </CardHeader>
          <CardContent>
            <CountryChart data={countryDistribution} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify build**

```bash
npx turbo build --filter=web
```

Expected: build succeeds.

- [ ] **Step 7: Start dev server and test in browser**

```bash
cd apps/web && pnpm dev
```

Navigate to `http://localhost:3000`. Verify:
1. Four summary cards render with numbers (likely 0 if no data yet)
2. Campaign performance table renders (empty state if no campaigns)
3. Lead trend chart renders (empty state if no leads)
4. Country distribution chart renders (empty state if no leads)
5. No hydration errors in console

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/\(dashboard\)/page.tsx apps/web/app/\(dashboard\)/components/
git commit -m "feat(dashboard): add live metrics with campaign performance, lead trend, and country distribution"
```

