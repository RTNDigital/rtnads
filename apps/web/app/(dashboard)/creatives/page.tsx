import { db } from "@/lib/db";
import { creatives, metaAdAccounts, clients } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export default async function CreativesPage() {
  const session = await auth();
  const orgId = (session?.user as any)?.orgId;

  const allCreatives = await db
    .select({
      id: creatives.id,
      type: creatives.type,
      treatmentCategory: creatives.treatmentCategory,
      targetCountry: creatives.targetCountry,
      language: creatives.language,
      thumbnailUrl: creatives.thumbnailUrl,
      mediaUrl: creatives.mediaUrl,
      syncedAt: creatives.syncedAt,
      createdAt: creatives.createdAt,
    })
    .from(creatives)
    .innerJoin(metaAdAccounts, eq(creatives.sourceAdAccountId, metaAdAccounts.id))
    .innerJoin(clients, eq(metaAdAccounts.clientId, clients.id))
    .where(eq(clients.orgId, orgId))
    .orderBy(creatives.createdAt);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Creatives</h1>

      {allCreatives.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          No creatives yet. Creatives will appear here after syncing from Meta.
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {allCreatives.map((creative) => (
            <Card key={creative.id} className="overflow-hidden">
              <div className="aspect-square bg-muted flex items-center justify-center">
                {creative.thumbnailUrl ? (
                  <img src={creative.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-muted-foreground text-sm">No preview</span>
                )}
              </div>
              <div className="p-3 flex flex-col gap-1">
                <Badge variant="outline" className="w-fit capitalize">{creative.type}</Badge>
                <p className="text-xs text-muted-foreground">
                  {creative.treatmentCategory || "Uncategorized"}
                  {creative.targetCountry && ` · ${creative.targetCountry}`}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
