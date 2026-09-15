import { db } from "@/lib/db";
import { creatives, metaAdAccounts, clients } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ImageIcon, Film, LayoutGrid, ImageOff } from "lucide-react";
import { CreativeFilters } from "./filters";

const typeIcons: Record<string, typeof ImageIcon> = {
  image: ImageIcon,
  video: Film,
  carousel: LayoutGrid,
};

const typeLabels: Record<string, string> = {
  image: "Görsel",
  video: "Video",
  carousel: "Carousel",
};

export default async function CreativesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; category?: string; country?: string }>;
}) {
  const session = await auth();
  const orgId = (session?.user as any)?.orgId;
  const params = await searchParams;

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
    .orderBy(creatives.createdAt)
    .then((rows) => rows.reverse());

  const categories = [...new Set(allCreatives.map((c) => c.treatmentCategory).filter(Boolean))] as string[];
  const countries = [...new Set(allCreatives.map((c) => c.targetCountry).filter(Boolean))] as string[];

  const filtered = allCreatives.filter((c) => {
    if (params.type && c.type !== params.type) return false;
    if (params.category && c.treatmentCategory !== params.category) return false;
    if (params.country && c.targetCountry !== params.country) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Kreatifler</h1>
        <Badge variant="outline" className="text-sm">
          {allCreatives.length}
        </Badge>
      </div>

      {allCreatives.length > 0 && (
        <CreativeFilters
          categories={categories}
          countries={countries}
          selectedType={params.type}
          selectedCategory={params.category}
          selectedCountry={params.country}
        />
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <ImageOff className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">
            {allCreatives.length > 0
              ? "Bu filtrelerle eşleşen kreatif bulunamadı."
              : "Henüz kreatif yok. Meta'dan senkronize edildikten sonra burada görünecek."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((creative) => {
            const Icon = typeIcons[creative.type] || ImageIcon;
            return (
              <Card key={creative.id} className="overflow-hidden">
                <div className="aspect-square bg-muted flex items-center justify-center">
                  {creative.thumbnailUrl ? (
                    <img src={creative.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Icon className="h-12 w-12 text-muted-foreground/40" />
                  )}
                </div>
                <div className="p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">{typeLabels[creative.type] || creative.type}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {creative.treatmentCategory && (
                      <Badge variant="outline" className="text-xs">
                        {creative.treatmentCategory}
                      </Badge>
                    )}
                    {creative.targetCountry && (
                      <Badge variant="outline" className="text-xs">
                        {creative.targetCountry}
                      </Badge>
                    )}
                    {creative.language && (
                      <Badge variant="outline" className="text-xs">
                        {creative.language}
                      </Badge>
                    )}
                  </div>
                  {creative.syncedAt && (
                    <p className="text-[11px] text-muted-foreground">
                      Sync: {new Date(creative.syncedAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
