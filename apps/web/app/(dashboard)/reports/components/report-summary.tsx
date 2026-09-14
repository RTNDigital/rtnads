import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ReportSummaryProps {
  totalSpend: number;
  monthlyBudget: number | null;
  totalImpressions: number;
  totalClicks: number;
  totalLeads: number;
  avgCtr: number;
  avgCpl: number;
}

function fmtCurrency(v: number): string {
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

export function ReportSummary(props: ReportSummaryProps) {
  const budgetUtil =
    props.monthlyBudget && props.monthlyBudget > 0
      ? ((props.totalSpend / props.monthlyBudget) * 100).toFixed(0)
      : null;

  const cards = [
    {
      label: "Toplam Harcama",
      value: fmtCurrency(props.totalSpend),
      sub: budgetUtil ? `Bütçe kullanımı: %${budgetUtil}` : undefined,
    },
    { label: "Gösterim", value: fmt(props.totalImpressions) },
    { label: "Tıklama", value: fmt(props.totalClicks) },
    { label: "Lead Sayısı", value: fmt(props.totalLeads) },
    {
      label: "Ort. CTR",
      value: props.avgCtr > 0 ? `${props.avgCtr.toFixed(2)}%` : "—",
    },
    {
      label: "Ort. CPL",
      value: props.avgCpl > 0 ? fmtCurrency(props.avgCpl) : "—",
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
            <p className="text-2xl font-bold">{card.value}</p>
            {card.sub && (
              <p className="mt-1 text-xs text-muted-foreground">{card.sub}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
