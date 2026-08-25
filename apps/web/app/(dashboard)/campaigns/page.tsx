import Link from "next/link";
import { db } from "@/lib/db";
import { campaigns, metaAdAccounts, clients } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  pending_approval: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  live: "bg-green-100 text-green-800",
  paused: "bg-orange-100 text-orange-800",
  rejected: "bg-red-100 text-red-800",
};

export default async function CampaignsPage() {
  const session = await auth();
  const orgId = (session?.user as any)?.orgId;

  const allCampaigns = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      status: campaigns.approvalStatus,
      metaStatus: campaigns.metaStatus,
      objective: campaigns.objective,
      dailyBudget: campaigns.dailyBudget,
      budgetCurrency: campaigns.budgetCurrency,
      clientName: clients.name,
      treatmentCategory: campaigns.treatmentCategory,
      createdAt: campaigns.createdAt,
    })
    .from(campaigns)
    .innerJoin(clients, eq(campaigns.clientId, clients.id))
    .where(eq(clients.orgId, orgId))
    .orderBy(campaigns.createdAt);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href="/campaigns?sync=true">Sync Now</Link>} />
          <Button render={<Link href="/campaigns/new">New Campaign</Link>} />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Campaign</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Objective</TableHead>
            <TableHead>Daily Budget</TableHead>
            <TableHead>Category</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allCampaigns.map((campaign) => (
            <TableRow key={campaign.id}>
              <TableCell>
                <Link href={`/campaigns/${campaign.id}`} className="font-medium hover:underline">
                  {campaign.name}
                </Link>
              </TableCell>
              <TableCell>{campaign.clientName}</TableCell>
              <TableCell>
                <Badge className={statusColors[campaign.status] || ""}>
                  {campaign.status.replace("_", " ")}
                </Badge>
              </TableCell>
              <TableCell>{campaign.objective || "—"}</TableCell>
              <TableCell>
                {campaign.dailyBudget
                  ? `${campaign.budgetCurrency} ${campaign.dailyBudget.toLocaleString()}`
                  : "—"}
              </TableCell>
              <TableCell>{campaign.treatmentCategory || "—"}</TableCell>
            </TableRow>
          ))}
          {allCampaigns.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                No campaigns yet. Create your first campaign or sync from Meta.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
