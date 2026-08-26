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
