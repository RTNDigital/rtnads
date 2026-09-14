import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface StatCardData {
  label: string;
  value: string;
  change?: number | null;
  invertChange?: boolean;
}

interface StatCardsProps {
  activeClients: number;
  liveCampaigns: number;
  periodLeads: number;
  periodSpend: number;
  avgCtr: number;
  avgCpl: number;
  prevLeads?: number;
  prevSpend?: number;
  prevCtr?: number;
  prevCpl?: number;
}

function calcChange(current: number, previous: number | undefined): number | null {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function fmtCurrency(v: number): string {
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function TrendBadge({ change, invert }: { change: number | null; invert?: boolean }) {
  if (change === null) return null;

  const isPositive = change > 0;
  const isGood = invert ? !isPositive : isPositive;
  const arrow = isPositive ? "↑" : "↓";
  const color = isGood
    ? "text-emerald-600 bg-emerald-50"
    : "text-red-600 bg-red-50";

  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {arrow} {Math.abs(change).toFixed(1)}%
    </span>
  );
}

export function StatCards(props: StatCardsProps) {
  const cards: StatCardData[] = [
    {
      label: "Aktif Müşteriler",
      value: String(props.activeClients),
    },
    {
      label: "Canlı Kampanyalar",
      value: String(props.liveCampaigns),
    },
    {
      label: "Lead",
      value: String(props.periodLeads),
      change: calcChange(props.periodLeads, props.prevLeads),
    },
    {
      label: "Harcama",
      value: fmtCurrency(props.periodSpend),
      change: calcChange(props.periodSpend, props.prevSpend),
    },
    {
      label: "Ort. CTR",
      value: props.avgCtr > 0 ? `${props.avgCtr.toFixed(2)}%` : "—",
      change: calcChange(props.avgCtr, props.prevCtr),
    },
    {
      label: "Ort. CPL",
      value: props.avgCpl > 0 ? fmtCurrency(props.avgCpl) : "—",
      change: calcChange(props.avgCpl, props.prevCpl),
      invertChange: true,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold">{card.value}</p>
              <TrendBadge change={card.change ?? null} invert={card.invertChange} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
