import { db } from "@/lib/db";
import { campaigns, adSets, ads, leads, clients } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  pending_approval: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  live: "bg-green-100 text-green-800",
  paused: "bg-orange-100 text-orange-800",
  rejected: "bg-red-100 text-red-800",
};

const leadStatusColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  contacted: "bg-yellow-100 text-yellow-800",
  qualified: "bg-purple-100 text-purple-800",
  converted: "bg-green-100 text-green-800",
  lost: "bg-red-100 text-red-800",
};

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) notFound();

  const { id } = await params;
  const orgId = (session.user as any).orgId;

  const [campaign] = await db.select({
    id: campaigns.id,
    name: campaigns.name,
    status: campaigns.approvalStatus,
    metaStatus: campaigns.metaStatus,
    metaCampaignId: campaigns.metaCampaignId,
    objective: campaigns.objective,
    dailyBudget: campaigns.dailyBudget,
    lifetimeBudget: campaigns.lifetimeBudget,
    budgetCurrency: campaigns.budgetCurrency,
    treatmentCategory: campaigns.treatmentCategory,
    targetCountries: campaigns.targetCountries,
    startDate: campaigns.startDate,
    endDate: campaigns.endDate,
    clientName: clients.name,
    clientType: clients.type,
    createdAt: campaigns.createdAt,
  }).from(campaigns)
    .innerJoin(clients, eq(campaigns.clientId, clients.id))
    .where(and(eq(campaigns.id, id), eq(clients.orgId, orgId)))
    .limit(1);

  if (!campaign) notFound();

  const campaignAdSets = await db.select().from(adSets)
    .where(eq(adSets.campaignId, id));

  const adSetIds = campaignAdSets.map((s) => s.id);
  const campaignAds = adSetIds.length > 0
    ? await db.select().from(ads).where(
        eq(ads.adSetId, adSetIds[0])
      )
    : [];

  const campaignLeads = await db.select().from(leads)
    .where(eq(leads.campaignId, id));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <p className="text-sm text-muted-foreground">{campaign.clientName} &middot; {campaign.treatmentCategory || "No category"}</p>
        </div>
        <div className="flex gap-2">
          <Badge className={statusColors[campaign.status] || ""}>
            {campaign.status.replace("_", " ")}
          </Badge>
          {campaign.metaStatus && (
            <Badge variant="outline">Meta: {campaign.metaStatus}</Badge>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="adsets">Ad Sets ({campaignAdSets.length})</TabsTrigger>
          <TabsTrigger value="ads">Ads ({campaignAds.length})</TabsTrigger>
          <TabsTrigger value="leads">Leads ({campaignLeads.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Objective</p>
              <p className="font-semibold">{campaign.objective || "—"}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Daily Budget</p>
              <p className="font-semibold">{campaign.dailyBudget ? `${campaign.budgetCurrency} ${campaign.dailyBudget}` : "—"}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Countries</p>
              <p className="font-semibold">{(campaign.targetCountries as string[] || []).length} countries</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Period</p>
              <p className="font-semibold">
                {campaign.startDate ? new Date(campaign.startDate).toLocaleDateString() : "—"}
                {campaign.endDate ? ` — ${new Date(campaign.endDate).toLocaleDateString()}` : ""}
              </p>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="adsets">
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Optimization</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaignAdSets.map((set) => (
                <TableRow key={set.id}>
                  <TableCell className="font-medium">{set.name}</TableCell>
                  <TableCell>{set.adFormat || "—"}</TableCell>
                  <TableCell>{set.optimizationGoal || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{set.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {campaignAdSets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No ad sets yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="ads">
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>Ad ID</TableHead>
                <TableHead>Meta ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaignAds.map((ad) => (
                <TableRow key={ad.id}>
                  <TableCell className="font-mono text-xs">{ad.id.slice(0, 8)}</TableCell>
                  <TableCell>{ad.metaAdId || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{ad.status}</Badge>
                  </TableCell>
                  <TableCell>{new Date(ad.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
              {campaignAds.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No ads yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="leads">
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaignLeads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">{lead.name || "—"}</TableCell>
                  <TableCell>{lead.whatsapp || lead.phone || "—"}</TableCell>
                  <TableCell>{lead.country || "—"}</TableCell>
                  <TableCell>
                    <Badge className={leadStatusColors[lead.status] || ""}>
                      {lead.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(lead.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
              {campaignLeads.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No leads yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
}
