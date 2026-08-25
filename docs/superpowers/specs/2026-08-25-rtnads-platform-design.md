# RTNADS — Reklam Karar-Zekâsı Platformu Tasarım Dokümanı

**Tarih:** 2026-08-25
**Proje:** RTNADS — RTN House Ajansı için MCP-First Reklam Otomasyon Platformu
**Durum:** Tasarım onayı bekleniyor

---

## 1. Vizyon & Amaç

RTN House dijital pazarlama ajansı için sağlık turizmi odaklı reklam karar-zekâsı platformu. Junior dijital pazarlamacıların profesyonel seviyede reklam kampanyaları oluşturmasını, yönetmesini ve optimize etmesini sağlayan tam otomasyon sistemi.

**Problem:** Dijital pazarlama uzmanı bulmanın zorlaştığı dönemde, yıllardır biriken sağlık turizmi reklam bilgisinin (platform politikaları, bölgesel kurallar, teşvik oranları, başarılı kampanya kalıpları) sistematize edilip otomasyona dönüştürülmesi.

**Hedef:** Yeni bir klinik/doktor geldiğinde junior seviyesindeki bir dijital pazarlamacı bile profesyonel reklam verebilmeli.

**İlk faz:** Meta (Facebook/Instagram) platformu. Google Ads ikinci fazda eklenecek.

---

## 2. Kullanıcılar & Roller

- **Şimdilik sadece ajans ekibi.** Mimari ileride multi-tenant'a genişletilebilir şekilde tasarlanacak.
- **Roller:** Admin (ajans sahibi), Manager, Junior

---

## 3. Mimari: MCP-First

Claude'u merkeze koyan mimari. Meta ve Google için özel MCP server'lar, Claude bu tool'ları kullanarak kampanya oluşturuyor, optimize ediyor, raporluyor. Web arayüzü chat + dashboard katmanı.

```
[Next.js Web App]
    ├── Chat UI → Claude API → MCP Tools
    │                           ├── meta-ads-mcp
    │                           ├── google-ads-mcp (faz 2)
    │                           └── rtnads-knowledge-mcp
    └── Dashboard UI → Next.js API Routes → PostgreSQL + Redis
```

---

## 4. Kampanya Tipleri

### 4.1 Standart Lead Gen Kampanyası
Normal akış: hedef kitle belirleme → kreatif seçimi → lead form oluşturma → yayına alma → optimizasyon.

Kullanılan formatlar:
- **Lead Gen Form** — her pazarda kullanılabilir
- **Landing Page + Form** — detaylı bilgi sunma imkanı
- **WhatsApp kampanyası** — sadece ABD, Kanada, Avustralya (konuşma optimizasyonu olan ülkeler). Avrupa'da WhatsApp konuşma optimizasyonu YOK.
- **Instagram DM** — her pazarda kullanılabilir
- **Karmaşık Funnel** — Awareness → Consideration (retargeting) → Conversion

### 4.2 Event/Meeting Kampanyası
Doktor/klinik hedef ülkeye fiziksel olarak gidiyor, belirli bir tarihte yüz yüze konsültasyon yapıyor.

Özel kuralları:
- Event tarihi, saati, şehir ve lokasyon adresi girilir
- Event'ten 2-4 hafta önce kampanya başlar, event günü biter
- Geo-targeting: event şehri + çevresi
- Aciliyet mesajı: "Nur begrenzte Termine verfügbar!"
- Reklam metni hedef ülkenin dilinde
- Lead form event şablonu kullanır (event tanıtım sayfası + kontakt bilgileri + WhatsApp izni)
- Facebook + Instagram aynı anda

---

## 5. Kampanya Oluşturma Akışı

### Faz 0 — Onboarding Gate
Kampanya oluşturmadan önce müşteri altyapısı kontrol edilir. Eksik varsa kampanya kilitli.

**Kontrol listesi:**
- Facebook sayfası aktif, Instagram ve WhatsApp Business bağlı
- Meta Pixel kurulu ve reklam hesabına bağlı
- Lead hedefi belirlendi (CRM / Telegram grubu)
- Reklam hesabı vergi bilgileri doğru (teşvik için zorunlu)
- Müşteri tipi belirlendi (Acente / Klinik / Doktor)
- Hedef pazarlar ve diller tanımlandı
- Aylık reklam bütçesi sisteme girildi

### Faz 1 — Doğal Dil Girişi
Junior chat arayüzünde kampanyayı tanımlar: "Dr. Ahmet için Almanya'ya rhinoplasty kampanyası kur"

### Faz 2 — Strateji Belirleme (Claude + Knowledge MCP)
- Doktor/klinik profili ve geçmiş kampanya performansları çekilir
- Hedef ülke politikaları kontrol edilir
- EK-53 kontrolü: teşvik oranı belirlenir (%70 veya %50)
- Ülkeye göre uygun reklam formatı önerilir
- Müşteri tipi acente ise zorunlu ibare otomatik eklenir

### Faz 3 — Kreatif Seçimi (Claude + Kreatif Kütüphanesi)
- Bağlı hesaplardan en iyi performans gösteren kreatifler kategori + ülke bazında listelenir
- İki yol: klinikten içerik iste (örnek paket hazırla) veya mevcut/in-house kreatif seç

### Faz 4 — Lead Form Oluşturma (Claude + Meta Ads MCP)
- Tedavi kategorisine göre otomatik soru şablonu seçilir
- WhatsApp numarası her formda zorunlu — "Whats.App" formatı ile Meta politika bypass'ı otomatik uygulanır
- Kalite vs maliyet dengesi: 2-4 manuel soru ideal
- Meta Marketing API ile form programatik oluşturulur

### Faz 5 — Kampanya Birleştirme & Onay
- Strateji, kreatif, lead form ve bütçe bir araya getirilir
- Compliance kontrolü çalıştırılır (Türkçe metin kontrolü, zorunlu ibare, format uygunluğu)
- Junior onay ekranında her şeyi görür, onaylar veya düzenler

### Faz 6 — Sürekli Optimizasyon
- Performans izlenir (CPL, CTR, ROAS)
- Claude optimizasyon önerileri sunar (kreatif değişimi, bütçe kaydırma, hedef kitle ayarı)
- Bütçe aşım kontrolü (%80 bilgi, %100-120 uyarı, %120+ durdur)

---

## 6. Domain Kuralları & Politikalar

### 6.1 Dil Kısıtlaması (Teşvik Koşulu)
- Sağlık turizmi reklamlarında Türkçe metin KULLANILAMAZ. Türkçe metin kullanılırsa teşvik alınamaz.
- Reklam metni, lead form soruları, kreatif üzerindeki yazılar hedef ülkenin dilinde veya İngilizce olmalı.
- Sistem Türkçe karakter/metin tespit ederse BLOCKER uyarı verir.

### 6.2 Devlet Teşviki
- Türkiye'den yurtdışına reklam veren sağlık turizmi işletmeleri devlet teşviki alabiliyor.
- **%70 teşvik:** EK-53 listesindeki ülkelere reklam verildiğinde.
- **%50 teşvik:** EK-53 dışındaki ülkelere reklam verildiğinde.

**EK-53 Ülkeleri (%70):** Almanya, ABD, Azerbaycan, BAE, Birleşik Krallık, Fransa, İrlanda, İspanya, Kanada, Katar, Kazakistan, Mısır, Nijerya, Norveç, Özbekistan, Polonya, Romanya, Rusya Federasyonu, Senegal, Suudi Arabistan (kısmi liste — tam liste güncellenecek)

### 6.3 İhracatçılar Birliği Zorunlu İbare (Sadece Acenteler)
- Sağlık turizmi acenteleri reklam metinlerinde İhracatçılar Birliği'nin talep ettiği sabit ibareyi eklemek ZORUNDA.
- İbare eklenmezse teşvik verilmiyor.
- Klinik/doktor olarak reklam veriliyorsa bu ibare zorunlu DEĞİL.
- Almanca örnek: "Die Behandlungen werden in einer vertraglich verbundenen Gesundheitseinrichtung durchgeführt, die über eine offizielle Genehmigung für internationalen..."
- Her dil için karşılığı Knowledge MCP'de tutulacak.

### 6.4 WhatsApp Bölgesel Kısıtlama
- ABD, Kanada, Avustralya: WhatsApp konuşma optimizasyonu VAR
- Avrupa: WhatsApp konuşma optimizasyonu YOK

### 6.5 Meta Lead Form Politika Bypass
- Meta lead form'da short-answer sorularda "WhatsApp" kelimesi kişisel bilgi filtresi tetikler.
- Çözüm: "Whats.App" formatı kullanılarak filtre geçiliyor. Sistem otomatik uygular.

### 6.6 Müşteri Tipi Ayrımı
- **Acente:** Zorunlu ibare VAR, teşvik kuralları farklı olabilir
- **Klinik/Doktor:** Zorunlu ibare YOK, doğrudan reklam verebilir

---

## 7. Lead Form Stratejisi

### Genel Kurallar
- WhatsApp numarası her formda zorunlu (manuel alan)
- En az 2, en fazla 4 manuel soru (kalite vs maliyet dengesi)
- Sorular tedavi kategorisine göre değişiyor
- Claude geçmiş verilerden soru sayısı vs CPL ilişkisini analiz ederek optimum öneri yapar

### Kategori Bazlı Soru Şablonları

**Rhinoplasty:**
- [Multiple] What type of nose do you prefer? → Natural / Barbie / Half Barbie-Natural
- [Multiple] When are you considering rhinoplasty? → tarih aralıkları
- [Manuel] WhatsApp numarası (zorunlu)

**Diş:**
- [Multiple] Which treatment are you interested in?
- [Multiple] Which dental implant package are you interested in?
- [Manuel] WhatsApp numarası (zorunlu)

**Ortak sorular:**
- [Multiple] When are you planning to visit Turkey?
- [Manuel] Would you be interested in visiting Turkey for 5-7 days?

**Event kampanyaları için:**
- Sayfa 1: Event tanıtım (doktor, tarih, lokasyon, ücretsiz konsültasyon)
- Sayfa 2: Ad, Telefon, E-posta, WhatsApp
- Sayfa 3: WhatsApp mesaj gönderme izni

---

## 8. Kreatif Zekâsı

### Kreatif Kütüphanesi
Bağlı reklam hesaplarından otomatik beslenen kreatif havuzu:
- Tüm hesaplardan kreatifler çekilir ve performans metrikleriyle etiketlenir
- Otomatik kategorileme: tedavi alanı, format (video/görsel/carousel), hedef ülke, dil
- Filtreleme: "Rhinoplasty + Almanya + en iyi CTR" → top kreatifler anında listelenir

### Kullanım
1. **Klinikle paylaş:** Junior örnek kreatif paketini klinikle paylaşır (şimdilik manuel, ileride platform içi)
2. **In-house üretim:** Başarılı kalıplar referans alınarak ajans içinde kreatif üretilir

---

## 9. Bütçe Yönetimi

- Müşteri onboarding'inde aylık reklam bütçesi sisteme girilir
- Claude bu bütçe dahilinde kampanya önerisi yapar
- Ekip müdahale edebilir (Claude'un önerisini değiştirebilir)
- Tolerans: aylık harcama bütçeyi maksimum %20 aşabilir

**Aşım seviyeleri:**
- %0-80: Normal
- %80-100: Bilgilendirme
- %100-120: Uyarı (tolerans dahilinde, ekip bilgilendirilir)
- %120+: Kampanya duraklatılır, admin onayı gerekir

---

## 10. Onay Akışı & Yetkilendirme

### Roller
- **Admin:** Her şeyi yapabilir, bilgi tabanını yönetir, hesapları bağlar, onayı bypass edebilir
- **Manager:** Kampanyaları onaylar/reddeder, operasyonel feedback bırakır, kreatif kütüphanesini yönetir
- **Junior:** Chat ile kampanya oluşturur, müşteri bütçesi dahilinde onaylayabilir, bütçe dışı → manager/admin onayına gider

### Onay kuralları
Müşteri bütçesi dahilinde ve compliance check geçen kampanyalar → Junior doğrudan onaylayabilir.
Bütçe dışı, compliance fail veya ilk kez reklam veren müşteri → Manager/Admin onayı gerekli.

---

## 11. Öğrenen Sistem

### 3 Öğrenme Kanalı:
1. **Otomatik — Performans verisi:** Günlük API sync ile kampanya sonuçları çekilir. Sistem kalıpları keşfeder (örn: "Rhinoplasty + DE + video = CPL €4")
2. **Admin — Kural güncellemeleri:** Yönetmelik/politika değişiklikleri admin panelinden girilir (EK-53 güncelleme, Meta politika değişikliği)
3. **Operasyonel — Ekip geri bildirimi:** Kampanya bazlı notlar (örn: "Bu klinik before/after istemiyor")

### Öğrenme tabloları
- `performance_snapshots` — günlük kampanya metrikleri
- `strategy_outcomes` — kampanya kapandığında toplam sonuç + kalite skoru
- `knowledge_updates` — politika/kural değişiklikleri (tarihli, kaynaklı)
- `operational_feedback` — ekipten kampanya bazlı geri bildirim
- `rule_changelog` — tüm kural değişikliklerinin logu

---

## 12. Veri Modeli

### Core Tables
- `organizations` — ajans/tenant (multi-tenant hazırlığı)
- `users` — id, org_id, name, email, role (admin|manager|junior)
- `clients` — klinik/doktor/acente, type, target_markets (JSON), onboarding_status, monthly_budget
- `client_onboarding_checks` — check_key, status (pass|fail|pending)

### Meta Integration
- `meta_ad_accounts` — account_id, access_token (encrypted), page_id, pixel_id
- `campaigns` — meta_campaign_id, objective, status, approval_status, incentive_rate, campaign_type (standard|event)
- `ad_sets` — targeting (JSON), optimization_goal, ad_format
- `ads` — creative_id, lead_form_id, performance_data
- `lead_forms` — meta_form_id, questions (JSON), template_used, locale

### Creative Library
- `creatives` — type, treatment_category, target_country, language, media_url
- `creative_performance` — impressions, clicks, ctr, leads, cpl, spend

### Knowledge Base
- `platform_rules` — platform, rule_type, country_scope, client_type_scope
- `lead_form_templates` — treatment_category, locale, questions, avg_cpl
- `incentive_countries` — country_code, incentive_rate, source ("EK-53")
- `agency_disclaimers` — locale, disclaimer_text

### Learning Tables
- `performance_snapshots` — daily metrics per campaign/ad_set/ad
- `strategy_outcomes` — campaign-level outcomes with quality score
- `knowledge_updates` — dated policy/rule changes
- `operational_feedback` — team feedback per campaign/client
- `rule_changelog` — audit trail for all rule changes

### Event Campaign Fields
- `events` — client_id, event_date, event_time, city, location_address, doctor_name, is_free_consultation

---

## 13. MCP Server'lar

### meta-ads-mcp (24 tool)
- **Hesap:** list_ad_accounts, get_ad_account_info, list_pages, check_account_health
- **Kampanya CRUD:** create_campaign, get_campaign, update_campaign, pause_campaign, resume_campaign, list_campaigns
- **Ad Set:** create_ad_set, update_ad_set, get_targeting_options, estimate_audience_size
- **Reklam & Kreatif:** create_ad, create_ad_creative, upload_image, upload_video, get_ad_preview
- **Lead Form:** create_lead_form, list_lead_forms, get_lead_form, get_leads
- **Performans:** get_campaign_insights, get_adset_insights, get_ad_insights, get_creative_performance, get_account_spend
- **WhatsApp & IG:** create_whatsapp_campaign, create_ig_dm_campaign, get_whatsapp_templates

### rtnads-knowledge-mcp (14 tool)
- **Politika:** get_country_rules, check_compliance, get_disclaimer, get_incentive_rate
- **Strateji:** recommend_strategy, recommend_audience, recommend_budget, get_best_creatives
- **Lead Form:** get_form_template, analyze_form_performance
- **Müşteri:** get_client_profile, get_client_feedback, get_client_preferences
- **Admin:** update_rule, add_incentive_country, update_form_template, add_disclaimer, get_changelog

---

## 14. Tech Stack

| Katman | Teknoloji | Neden |
|--------|-----------|-------|
| Framework | Next.js 15 (App Router) | Full-stack, streaming, Vercel deploy |
| Dil | TypeScript | Tip güvenliği |
| Styling | Tailwind CSS + shadcn/ui | Hızlı, kontrollü UI |
| AI | Claude API (Vercel AI SDK) | Chat streaming, MCP entegrasyonu |
| MCP | MCP TypeScript SDK | MCP server geliştirme |
| Veritabanı | PostgreSQL (Neon) | Vercel Marketplace, serverless |
| ORM | Drizzle | Type-safe, hafif |
| Cache/Queue | Redis (Upstash) | Rate limiting, cache, async jobs |
| Auth | NextAuth.js (Auth.js) | Email/password + roller |
| Cron | Vercel Cron | Günlük performans sync |
| Async Jobs | Upstash QStash | Meta API çağrıları |
| Monorepo | Turborepo | MCP server'lar + web app |
| Deploy | Vercel | Otomatik deploy |

### Proje Yapısı
```
rtnads/
├── apps/web/                    → Next.js ana uygulama
│   ├── app/(auth)/              → login, register
│   ├── app/(dashboard)/         → clients, campaigns, creatives, knowledge, settings
│   ├── app/(chat)/              → Claude chat arayüzü
│   └── app/api/                 → chat, campaigns, clients, webhooks, cron
├── packages/
│   ├── meta-ads-mcp/            → Meta Ads MCP Server
│   ├── knowledge-mcp/           → Knowledge MCP Server
│   └── shared/                  → ortak tipler & constants
└── drizzle/                     → DB migration'lar
```

---

## 15. Mevcut Kaynaklar

- **Meta Marketing API izinleri:** 16 adet onaylı izin mevcut (CRM projesinden). ads_management, ads_read, leads_retrieval, pages_manage_ads, whatsapp_business_messaging, instagram_manage_messages, business_management vb. Ek izin başvurusu gerekmez.

---

## 16. Kapsam Dışı (İlk Faz)

- Google Ads entegrasyonu (faz 2)
- Müşteri paneli (ileride eklenecek)
- Platform içi kreatif paylaşım (şimdilik manuel)
- Multi-tenant SaaS (mimari hazır, implementasyon ileride)
- Landing page builder
- CRM entegrasyonu (leadler mevcut CRM/Telegram'a manuel aktarılır)

---

## 17. Alt Projeler & Sıralama

1. **Core Platform** — Next.js app, auth, veritabanı, temel UI
2. **Knowledge MCP Server** — domain bilgisi, politikalar, şablonlar
3. **Meta Ads MCP Server** — kampanya yönetimi, audience, creative, lead form
4. **Campaign Intelligence** — Claude destekli karar motoru + chat UI
5. **Kreatif Kütüphanesi** — performans bazlı kreatif havuzu
6. **Dashboard & Reporting** — performans takibi, raporlama, bütçe izleme
