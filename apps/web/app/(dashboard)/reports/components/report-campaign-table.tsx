import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";

interface CampaignSummaryRow {
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  ctr: number;
  cpl: number;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtCurrency(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ReportCampaignTable({ data }: { data: CampaignSummaryRow[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Kampanya</TableHead>
            <TableHead className="text-right">Harcama</TableHead>
            <TableHead className="text-right">Gösterim</TableHead>
            <TableHead className="text-right">Tıklama</TableHead>
            <TableHead className="text-right">CTR%</TableHead>
            <TableHead className="text-right">Lead</TableHead>
            <TableHead className="text-right">CPL</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((c) => (
            <TableRow key={c.name}>
              <TableCell className="font-medium">{c.name}</TableCell>
              <TableCell className="text-right">{fmtCurrency(c.spend)}</TableCell>
              <TableCell className="text-right">{fmt(c.impressions)}</TableCell>
              <TableCell className="text-right">{fmt(c.clicks)}</TableCell>
              <TableCell className="text-right">{c.ctr > 0 ? c.ctr.toFixed(2) : "—"}</TableCell>
              <TableCell className="text-right">{c.leads > 0 ? fmt(c.leads) : "—"}</TableCell>
              <TableCell className="text-right">{c.cpl > 0 ? fmtCurrency(c.cpl) : "—"}</TableCell>
            </TableRow>
          ))}
          {data.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                Bu dönemde kampanya verisi yok.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
