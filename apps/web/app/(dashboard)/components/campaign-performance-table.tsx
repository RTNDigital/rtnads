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
    <div className="overflow-x-auto">
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
    </div>
  );
}
