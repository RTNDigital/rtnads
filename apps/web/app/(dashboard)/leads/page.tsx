import { db } from "@/lib/db";
import { leads, campaigns, clients } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";

const statusColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  contacted: "bg-yellow-100 text-yellow-800",
  qualified: "bg-purple-100 text-purple-800",
  converted: "bg-green-100 text-green-800",
  lost: "bg-red-100 text-red-800",
};

export default async function LeadsPage() {
  const session = await auth();
  const orgId = (session?.user as any)?.orgId;

  const allLeads = await db
    .select({
      id: leads.id,
      name: leads.name,
      email: leads.email,
      phone: leads.phone,
      whatsapp: leads.whatsapp,
      country: leads.country,
      status: leads.status,
      source: leads.source,
      campaignName: campaigns.name,
      clientName: clients.name,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .innerJoin(clients, eq(leads.clientId, clients.id))
    .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
    .where(eq(clients.orgId, orgId))
    .orderBy(leads.createdAt);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Leads</h1>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>WhatsApp</TableHead>
            <TableHead>Country</TableHead>
            <TableHead>Campaign</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allLeads.map((lead) => (
            <TableRow key={lead.id}>
              <TableCell className="font-medium">{lead.name || "—"}</TableCell>
              <TableCell>{lead.whatsapp || lead.phone || "—"}</TableCell>
              <TableCell>{lead.country || "—"}</TableCell>
              <TableCell>{lead.campaignName || "—"}</TableCell>
              <TableCell>{lead.clientName}</TableCell>
              <TableCell>
                <Badge className={statusColors[lead.status] || ""}>
                  {lead.status}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{lead.source.replace("_", " ")}</Badge>
              </TableCell>
              <TableCell>{new Date(lead.createdAt).toLocaleDateString()}</TableCell>
            </TableRow>
          ))}
          {allLeads.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                No leads yet. Leads will appear here when synced from Meta or received via webhook.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
