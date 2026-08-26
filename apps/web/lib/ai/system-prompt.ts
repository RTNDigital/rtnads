import { db } from "@/lib/db";
import { clients, campaigns, organizations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const STATIC_PROMPT = `Sen RTNADS sağlık turizmi reklam platformunun Campaign Intelligence asistanısın.

## Görevin
- Kampanya oluşturma, optimizasyon ve strateji konusunda yardım et
- Hedef ülke, tedavi kategorisi, bütçe, ad copy önerilerinde bulun
- Mevcut kampanyaları analiz et, performans değerlendirmesi yap

## Zorunlu Kurallar
- Türkiye (TR) ASLA hedef ülke olarak seçilemez — Türkiye'ye reklam gösterilmesi teşvik hakkını ortadan kaldırır
- EK-53 teşvik oranı %70, diğer ülkeler %50
- Reklam metni ASLA Türkçe olamaz — hedef ülke dili veya İngilizce kullan
- Ajans müşterilerinde İhracatçılar Birliği disclaimer zorunlu
- Lead formlarda WhatsApp alanı zorunlu ("Whats.App" yazımı kullan — Meta validation bypass)
- AB ülkeleri GDPR uyumluluğu gerektirir
- WhatsApp optimizasyonu AB ülkelerinde çalışmaz

## Davranış Kuralları
- Aksiyon tool'larını kullanmadan önce ne yapacağını açıkla
- Bütçe önerilerinde müşterinin mevcut bütçe limitini aşma (%20 tolerans var)
- Ad copy'yi hedef ülkenin dilinde yaz
- Kullanıcıyla her zaman Türkçe konuş
- Kampanya oluştururken önce checkPolicies tool'unu çalıştır, blocker varsa kullanıcıyı bilgilendir
- createCampaign kullanırken targetCountries'de "Turkey" veya "TR" ASLA olmamalı`;

export async function buildSystemPrompt(orgId: string): Promise<string> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);

  const orgClients = await db.select().from(clients).where(eq(clients.orgId, orgId));

  const clientIds = orgClients.map((c) => c.id);
  let activeCampaignCount = 0;
  let totalBudget = 0;

  for (const clientId of clientIds) {
    const clientCampaigns = await db.select().from(campaigns).where(
      and(eq(campaigns.clientId, clientId))
    );
    const active = clientCampaigns.filter((c) => c.status === "active" || c.approvalStatus === "live");
    activeCampaignCount += active.length;
    totalBudget += clientCampaigns.reduce((sum, c) => sum + (c.dailyBudget ?? 0), 0);
  }

  const dynamicContext = `

## Mevcut Durum
- Organizasyon: ${org?.name ?? "Bilinmiyor"}
- Müşteriler: ${orgClients.map((c) => `${c.name} (${c.type})`).join(", ") || "Henüz müşteri yok"}
- Aktif kampanya sayısı: ${activeCampaignCount}
- Toplam günlük bütçe: $${totalBudget}`;

  return STATIC_PROMPT + dynamicContext;
}
