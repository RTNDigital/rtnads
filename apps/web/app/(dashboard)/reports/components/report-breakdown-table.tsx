import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";

interface DailyRow {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  leads: number;
  cpl: number;
  cpc: number;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtCurrency(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ReportBreakdownTable({ data }: { data: DailyRow[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tarih</TableHead>
            <TableHead className="text-right">Harcama</TableHead>
            <TableHead className="text-right">Gösterim</TableHead>
            <TableHead className="text-right">Tıklama</TableHead>
            <TableHead className="text-right">CTR%</TableHead>
            <TableHead className="text-right">Lead</TableHead>
            <TableHead className="text-right">CPL</TableHead>
            <TableHead className="text-right">CPC</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow key={row.date}>
              <TableCell className="font-medium">{fmtDate(row.date)}</TableCell>
              <TableCell className="text-right">{fmtCurrency(row.spend)}</TableCell>
              <TableCell className="text-right">{fmt(row.impressions)}</TableCell>
              <TableCell className="text-right">{fmt(row.clicks)}</TableCell>
              <TableCell className="text-right">{row.ctr > 0 ? row.ctr.toFixed(2) : "—"}</TableCell>
              <TableCell className="text-right">{row.leads > 0 ? fmt(row.leads) : "—"}</TableCell>
              <TableCell className="text-right">{row.cpl > 0 ? fmtCurrency(row.cpl) : "—"}</TableCell>
              <TableCell className="text-right">{row.cpc > 0 ? fmtCurrency(row.cpc) : "—"}</TableCell>
            </TableRow>
          ))}
          {data.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                Seçilen dönemde veri yok.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
