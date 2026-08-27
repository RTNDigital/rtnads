import { db } from "@/lib/db";
import { campaignInsights } from "@/lib/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { Card } from "@/components/ui/card";

interface CampaignInsightsSummaryProps {
  campaignId: string;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtCurrency(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function CampaignInsightsSummary({ campaignId }: CampaignInsightsSummaryProps) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [summary] = await db
    .select({
      impressions: sql<number>`coalesce(sum(${campaignInsights.impressions}), 0)::int`,
      clicks: sql<number>`coalesce(sum(${campaignInsights.clicks}), 0)::int`,
      leads: sql<number>`coalesce(sum(${campaignInsights.leads}), 0)::int`,
      spend: sql<number>`coalesce(sum(${campaignInsights.spend}), 0)::float`,
    })
    .from(campaignInsights)
    .where(and(
      eq(campaignInsights.campaignId, campaignId),
      gte(campaignInsights.date, sevenDaysAgo),
    ));

  const hasData = summary.impressions > 0 || summary.spend > 0;

  if (!hasData) {
    return (
      <p className="text-sm text-muted-foreground py-2">Henüz performans verisi yok.</p>
    );
  }

  const ctr = summary.impressions > 0 ? (summary.clicks / summary.impressions * 100) : 0;
  const cpl = summary.leads > 0 ? summary.spend / summary.leads : 0;

  const metrics = [
    { label: "Impressions", value: fmt(summary.impressions) },
    { label: "Clicks", value: fmt(summary.clicks) },
    { label: "CTR", value: `${ctr.toFixed(2)}%` },
    { label: "Leads", value: fmt(summary.leads) },
    { label: "CPL", value: fmtCurrency(cpl) },
    { label: "Harcama", value: fmtCurrency(summary.spend) },
  ];

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
      {metrics.map((m) => (
        <Card key={m.label} className="p-3 text-center">
          <p className="text-xs text-muted-foreground">{m.label}</p>
          <p className="text-lg font-semibold">{m.value}</p>
        </Card>
      ))}
    </div>
  );
}
