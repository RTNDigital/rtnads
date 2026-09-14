"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImageIcon, Film, LayoutGrid, Upload, X, Plus } from "lucide-react";
import Link from "next/link";

interface Client { id: string; name: string; type: string; }
interface PolicyResult { level: string; code: string; message: string; field?: string; }

const STEPS = ["Basics", "Targeting & Budget", "Ad Set & Format", "Creative & Ad", "Review"];

const EK53_COUNTRIES = [
  "Germany", "United States", "Azerbaijan", "United Arab Emirates",
  "United Kingdom", "France", "Ireland", "Spain", "Canada", "Qatar",
  "Kazakhstan", "Egypt", "Nigeria", "Norway", "Uzbekistan", "Poland",
  "Romania", "Russia", "Senegal", "Saudi Arabia",
];

const ALL_COUNTRIES = [
  ...EK53_COUNTRIES,
  "Italy", "Netherlands", "Belgium", "Austria", "Sweden", "Denmark",
  "Finland", "Portugal", "Greece", "Czech Republic", "Hungary",
  "Australia", "Japan", "South Korea", "Brazil", "Mexico", "India",
  "China", "Israel", "South Africa",
].sort();

const OBJECTIVES = [
  { value: "OUTCOME_LEADS", label: "Lead Generation" },
  { value: "OUTCOME_TRAFFIC", label: "Traffic" },
  { value: "OUTCOME_AWARENESS", label: "Awareness" },
  { value: "OUTCOME_SALES", label: "Conversions" },
];

const AD_FORMATS = [
  { value: "lead_form", label: "Lead Form" },
  { value: "landing_page", label: "Landing Page" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "ig_dm", label: "Instagram DM" },
  { value: "funnel", label: "Funnel" },
];

const MEDIA_TYPES = [
  { value: "image", label: "Görsel", icon: ImageIcon },
  { value: "video", label: "Video", icon: Film },
  { value: "carousel", label: "Carousel", icon: LayoutGrid },
] as const;

const CTA_OPTIONS = [
  { value: "LEARN_MORE", label: "Learn More" },
  { value: "SIGN_UP", label: "Sign Up" },
  { value: "BOOK_TRAVEL", label: "Book Now" },
  { value: "GET_QUOTE", label: "Get Quote" },
  { value: "CONTACT_US", label: "Contact Us" },
  { value: "SEND_WHATSAPP_MESSAGE", label: "WhatsApp Message" },
  { value: "APPLY_NOW", label: "Apply Now" },
];

interface PlacementGroup {
  key: string;
  label: string;
  placements: { key: string; label: string }[];
  defaultExcluded?: boolean;
}

const PLACEMENT_GROUPS: PlacementGroup[] = [
  {
    key: "feeds",
    label: "Akışlar (Feeds)",
    placements: [
      { key: "facebook_feed", label: "Facebook Feed" },
      { key: "instagram_feed", label: "Instagram Feed" },
      { key: "facebook_marketplace", label: "Facebook Marketplace" },
      { key: "facebook_video_feeds", label: "Facebook Video Feeds" },
      { key: "instagram_explore", label: "Instagram Explore" },
      { key: "instagram_profile_feed", label: "Instagram Profil" },
    ],
  },
  {
    key: "stories_reels",
    label: "Hikayeler ve Reels",
    placements: [
      { key: "facebook_stories", label: "Facebook Stories" },
      { key: "instagram_stories", label: "Instagram Stories" },
      { key: "instagram_reels", label: "Instagram Reels" },
      { key: "facebook_reels", label: "Facebook Reels" },
    ],
  },
  {
    key: "in_stream",
    label: "Yayın İçi (In-Stream)",
    defaultExcluded: true,
    placements: [
      { key: "instagram_reels_overlay", label: "Reels yayın içi reklamlar" },
      { key: "facebook_instream_video", label: "Facebook yayın içi video" },
    ],
  },
  {
    key: "search",
    label: "Arama Sonuçları",
    placements: [
      { key: "facebook_search", label: "Facebook Arama" },
      { key: "instagram_search", label: "Instagram Arama" },
    ],
  },
  {
    key: "messages",
    label: "Pazarlama Mesajları",
    placements: [
      { key: "messenger_inbox", label: "Messenger Gelen Kutusu" },
      { key: "messenger_stories", label: "Messenger Stories" },
    ],
  },
  {
    key: "audience_network",
    label: "Uygulamalar ve Siteler (Audience Network)",
    defaultExcluded: true,
    placements: [
      { key: "audience_network_classic", label: "Audience Network Klasik" },
      { key: "audience_network_rewarded_video", label: "Audience Network Ödüllü Video" },
    ],
  },
];

const DEFAULT_EXCLUDED = PLACEMENT_GROUPS
  .filter((g) => g.defaultExcluded)
  .flatMap((g) => g.placements.map((p) => p.key));

export default function NewCampaignPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [clients, setClients] = useState<Client[]>([]);
  const [policyResults, setPolicyResults] = useState<PolicyResult[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    clientId: "",
    metaAdAccountId: "",
    campaignType: "standard",
    objective: "OUTCOME_LEADS",
    treatmentCategory: "",
    targetCountries: [] as string[],
    dailyBudget: "",
    lifetimeBudget: "",
    budgetCurrency: "USD",
    startDate: "",
    endDate: "",
    adFormat: "lead_form",
    optimizationGoal: "LEAD_GENERATION",
    bidStrategy: "LOWEST_COST_WITHOUT_CAP",
    excludedPlacements: [...DEFAULT_EXCLUDED] as string[],
    mediaType: "image" as "image" | "video" | "carousel",
    mediaFiles: [] as File[],
    mediaPreviews: [] as string[],
    ctaType: "LEARN_MORE",
    destinationUrl: "",
    adCopy: "",
    headline: "",
    description: "",
    hasWhatsAppField: true,
    hasDisclaimer: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const validateStep = (currentStep: number): boolean => {
    const errors: Record<string, string> = {};
    if (currentStep === 0) {
      if (!form.name.trim()) errors.name = "Kampanya adı zorunlu";
      if (!form.clientId) errors.clientId = "Müşteri seçimi zorunlu";
    }
    if (currentStep === 1) {
      if (form.targetCountries.length === 0) errors.targetCountries = "En az bir ülke seçin";
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const goToStep = (target: number) => {
    if (target < step) {
      setValidationErrors({});
      setStep(target);
      return;
    }
    for (let i = step; i < target; i++) {
      if (!validateStep(i)) return;
    }
    setStep(target);
  };

  useEffect(() => {
    fetch("/api/clients").then((r) => r.json()).then(setClients);
  }, []);

  const updateField = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleCountry = (country: string) => {
    setForm((prev) => ({
      ...prev,
      targetCountries: prev.targetCountries.includes(country)
        ? prev.targetCountries.filter((c) => c !== country)
        : [...prev.targetCountries, country],
    }));
  };

  const togglePlacement = (placementKey: string) => {
    setForm((prev) => ({
      ...prev,
      excludedPlacements: prev.excludedPlacements.includes(placementKey)
        ? prev.excludedPlacements.filter((p) => p !== placementKey)
        : [...prev.excludedPlacements, placementKey],
    }));
  };

  const togglePlacementGroup = (group: PlacementGroup) => {
    const groupKeys = group.placements.map((p) => p.key);
    const allExcluded = groupKeys.every((k) => form.excludedPlacements.includes(k));
    setForm((prev) => ({
      ...prev,
      excludedPlacements: allExcluded
        ? prev.excludedPlacements.filter((p) => !groupKeys.includes(p))
        : [...new Set([...prev.excludedPlacements, ...groupKeys])],
    }));
  };

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const maxFiles = form.mediaType === "carousel" ? 10 : 1;
    const newFiles = [...form.mediaFiles, ...files].slice(0, maxFiles);

    const newPreviews = newFiles.map((f) => URL.createObjectURL(f));
    form.mediaPreviews.forEach((url) => URL.revokeObjectURL(url));

    setForm((prev) => ({
      ...prev,
      mediaFiles: newFiles,
      mediaPreviews: newPreviews,
    }));

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeMedia = (index: number) => {
    URL.revokeObjectURL(form.mediaPreviews[index]);
    setForm((prev) => ({
      ...prev,
      mediaFiles: prev.mediaFiles.filter((_, i) => i !== index),
      mediaPreviews: prev.mediaPreviews.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/meta/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          metaAdAccountId: form.metaAdAccountId || null,
          dailyBudget: form.dailyBudget ? parseInt(form.dailyBudget) : null,
          lifetimeBudget: form.lifetimeBudget ? parseInt(form.lifetimeBudget) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.blockers) {
          setPolicyResults(data.blockers);
          return;
        }
        alert(data.error);
        return;
      }
      if (data.policyResults) setPolicyResults(data.policyResults);
      router.push(`/campaigns/${data.campaign.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  const ek53Count = form.targetCountries.filter((c) => EK53_COUNTRIES.includes(c)).length;
  const incentiveRate = form.targetCountries.length === 0 ? null
    : ek53Count === form.targetCountries.length ? 70
    : ek53Count > 0 ? "50-70" : 50;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h1 className="text-2xl font-bold">New Campaign</h1>

      <div className="flex gap-2">
        {STEPS.map((s, i) => (
          <button key={s} type="button" onClick={() => goToStep(i)}>
            <Badge className={`cursor-pointer transition-colors ${i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-primary/20 text-primary hover:bg-primary/30" : "bg-muted text-muted-foreground"}`}>
              {i + 1}. {s}
            </Badge>
          </button>
        ))}
      </div>

      {step === 0 && (
        <Card className="p-6 flex flex-col gap-4">
          <div>
            <Label>Campaign Name <span className="text-red-500">*</span></Label>
            <Input value={form.name} onChange={(e) => { updateField("name", e.target.value); setValidationErrors((v) => ({ ...v, name: "" })); }} placeholder="e.g. Rhinoplasty DE Q1 2026" className={validationErrors.name ? "border-red-500" : ""} />
            {validationErrors.name && <p className="text-xs text-red-500 mt-1">{validationErrors.name}</p>}
          </div>
          <div>
            <Label>Client <span className="text-red-500">*</span></Label>
            {clients.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-3">
                <span className="text-sm text-muted-foreground">Henüz müşteri yok.</span>
                <Link href="/clients/new" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                  <Plus className="h-3.5 w-3.5" />
                  Müşteri ekle
                </Link>
              </div>
            ) : (
              <select className={`w-full rounded-md border px-3 py-2 text-sm ${validationErrors.clientId ? "border-red-500" : ""}`} value={form.clientId} onChange={(e) => { updateField("clientId", e.target.value); setValidationErrors((v) => ({ ...v, clientId: "" })); }}>
                <option value="">Müşteri seçin...</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
              </select>
            )}
            {validationErrors.clientId && <p className="text-xs text-red-500 mt-1">{validationErrors.clientId}</p>}
          </div>
          <div>
            <Label>Objective</Label>
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={form.objective} onChange={(e) => updateField("objective", e.target.value)}>
              {OBJECTIVES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Treatment Category</Label>
            <Input value={form.treatmentCategory} onChange={(e) => updateField("treatmentCategory", e.target.value)} placeholder="e.g. rhinoplasty, dental, bariatric" />
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card className="p-6 flex flex-col gap-4">
          <div>
            <Label>Target Countries</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {ALL_COUNTRIES.map((country) => (
                <button
                  key={country}
                  type="button"
                  onClick={() => toggleCountry(country)}
                  className={`px-2 py-1 text-xs rounded-md border ${form.targetCountries.includes(country) ? "bg-primary text-primary-foreground" : "bg-background"}`}
                >
                  {country} {EK53_COUNTRIES.includes(country) && "★"}
                </button>
              ))}
            </div>
            {incentiveRate && (
              <p className="text-sm text-muted-foreground mt-2">Incentive rate: {incentiveRate}% ({ek53Count} EK-53 countries selected)</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Daily Budget ({form.budgetCurrency})</Label>
              <Input type="number" value={form.dailyBudget} onChange={(e) => updateField("dailyBudget", e.target.value)} />
            </div>
            <div>
              <Label>Lifetime Budget ({form.budgetCurrency})</Label>
              <Input type="number" value={form.lifetimeBudget} onChange={(e) => updateField("lifetimeBudget", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={form.startDate} onChange={(e) => updateField("startDate", e.target.value)} />
            </div>
            <div>
              <Label>End Date</Label>
              <Input type="date" value={form.endDate} onChange={(e) => updateField("endDate", e.target.value)} />
            </div>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="p-6 flex flex-col gap-4">
          <div>
            <Label>Ad Format</Label>
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={form.adFormat} onChange={(e) => updateField("adFormat", e.target.value)}>
              {AD_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Bid Strategy</Label>
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={form.bidStrategy} onChange={(e) => updateField("bidStrategy", e.target.value)}>
              <option value="LOWEST_COST_WITHOUT_CAP">Lowest Cost (default)</option>
              <option value="COST_CAP">Cost Cap</option>
              <option value="BID_CAP">Bid Cap</option>
            </select>
          </div>

          <div>
            <Label className="mb-3 block">Yerleşim Hariç Tutma (Placements)</Label>
            <p className="text-xs text-muted-foreground mb-3">
              Hariç tutulan yerleşimlerde reklamınız gösterilmez. Audience Network ve Yayın İçi (In-Stream) varsayılan olarak hariç tutulur.
            </p>
            <div className="flex flex-col gap-1 rounded-lg border divide-y">
              {PLACEMENT_GROUPS.map((group) => {
                const groupKeys = group.placements.map((p) => p.key);
                const excludedCount = groupKeys.filter((k) => form.excludedPlacements.includes(k)).length;
                const allExcluded = excludedCount === groupKeys.length;
                const someExcluded = excludedCount > 0 && !allExcluded;

                return (
                  <div key={group.key}>
                    <button
                      type="button"
                      onClick={() => togglePlacementGroup(group)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
                    >
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${
                        allExcluded
                          ? "bg-red-500 border-red-500 text-white"
                          : someExcluded
                          ? "bg-amber-500 border-amber-500 text-white"
                          : "bg-green-500 border-green-500 text-white"
                      }`}>
                        {allExcluded ? "✕" : someExcluded ? "−" : "✓"}
                      </span>
                      <span className="flex-1 text-left font-medium">{group.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {allExcluded ? "Hariç" : someExcluded ? `${excludedCount}/${groupKeys.length} hariç` : "Dahil"}
                      </span>
                    </button>
                    <div className="pl-12 pr-4 pb-2 flex flex-wrap gap-1.5">
                      {group.placements.map((p) => {
                        const excluded = form.excludedPlacements.includes(p.key);
                        return (
                          <button
                            key={p.key}
                            type="button"
                            onClick={() => togglePlacement(p.key)}
                            className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                              excluded
                                ? "bg-red-50 text-red-700 border-red-200 line-through"
                                : "bg-green-50 text-green-700 border-green-200"
                            }`}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <span>
                {form.excludedPlacements.length} yerleşim hariç tutuldu
              </span>
              <button
                type="button"
                onClick={() => updateField("excludedPlacements", [...DEFAULT_EXCLUDED])}
                className="text-primary hover:underline"
              >
                Varsayılana sıfırla
              </button>
            </div>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="p-6 flex flex-col gap-6">
          <div>
            <Label className="mb-2 block">Medya Tipi</Label>
            <div className="flex gap-2">
              {MEDIA_TYPES.map((mt) => (
                <button
                  key={mt.value}
                  type="button"
                  onClick={() => {
                    form.mediaPreviews.forEach((url) => URL.revokeObjectURL(url));
                    setForm((prev) => ({
                      ...prev,
                      mediaType: mt.value,
                      mediaFiles: [],
                      mediaPreviews: [],
                    }));
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md border text-sm font-medium transition-colors ${
                    form.mediaType === mt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted"
                  }`}
                >
                  <mt.icon className="h-4 w-4" />
                  {mt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-2 block">
              Kreatif Yükle
              {form.mediaType === "carousel" && (
                <span className="text-muted-foreground font-normal ml-1">(maks. 10 görsel)</span>
              )}
            </Label>
            <input
              ref={fileInputRef}
              type="file"
              accept={form.mediaType === "video" ? "video/mp4,video/mov,video/avi" : "image/jpeg,image/png,image/webp"}
              multiple={form.mediaType === "carousel"}
              onChange={handleMediaUpload}
              className="hidden"
            />

            {form.mediaPreviews.length > 0 ? (
              <div className={`grid gap-3 ${form.mediaType === "carousel" ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1"}`}>
                {form.mediaPreviews.map((preview, i) => (
                  <div key={i} className="relative group rounded-lg overflow-hidden border bg-muted">
                    {form.mediaType === "video" ? (
                      <video src={preview} className="w-full aspect-video object-cover" controls />
                    ) : (
                      <img src={preview} alt={`Creative ${i + 1}`} className="w-full aspect-square object-cover" />
                    )}
                    <button
                      type="button"
                      onClick={() => removeMedia(i)}
                      className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {form.mediaType === "carousel" && form.mediaFiles.length < 10 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center aspect-square rounded-lg border-2 border-dashed text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                  >
                    <Upload className="h-5 w-5 mb-1" />
                    <span className="text-xs">Ekle</span>
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-10 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              >
                <Upload className="h-8 w-8" />
                <span className="text-sm font-medium">
                  {form.mediaType === "video" ? "Video yükle (MP4, MOV)" : "Görsel yükle (JPG, PNG, WebP)"}
                </span>
                <span className="text-xs">
                  {form.mediaType === "video" ? "Önerilen: 1080×1080 veya 9:16" : "Önerilen: 1080×1080px"}
                </span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Call to Action</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={form.ctaType} onChange={(e) => updateField("ctaType", e.target.value)}>
                {CTA_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <Label>Hedef URL</Label>
              <Input value={form.destinationUrl} onChange={(e) => updateField("destinationUrl", e.target.value)} placeholder="https://..." />
            </div>
          </div>

          <div>
            <Label>Ad Copy (Primary Text)</Label>
            <Textarea rows={4} value={form.adCopy} onChange={(e) => updateField("adCopy", e.target.value)} placeholder="Ana reklam metni..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Headline</Label>
              <Input value={form.headline} onChange={(e) => updateField("headline", e.target.value)} placeholder="Reklam başlığı" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => updateField("description", e.target.value)} placeholder="Kısa açıklama" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={form.hasWhatsAppField} onChange={(e) => updateField("hasWhatsAppField", e.target.checked)} />
              <Label>Lead formunda WhatsApp alanı ekle (zorunlu)</Label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={form.hasDisclaimer} onChange={(e) => updateField("hasDisclaimer", e.target.checked)} />
              <Label>İhracatçılar Birliği zorunlu ibaresi (ajanslar için)</Label>
            </div>
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card className="p-6 flex flex-col gap-4">
          <h2 className="font-semibold text-lg">Kampanya Özeti</h2>
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <span className="text-muted-foreground">Ad:</span><span className="font-medium">{form.name || "—"}</span>
            <span className="text-muted-foreground">Müşteri:</span><span>{clients.find((c) => c.id === form.clientId)?.name || "—"}</span>
            <span className="text-muted-foreground">Hedef:</span><span>{OBJECTIVES.find((o) => o.value === form.objective)?.label}</span>
            <span className="text-muted-foreground">Tedavi:</span><span>{form.treatmentCategory || "—"}</span>
            <span className="text-muted-foreground">Ülkeler:</span><span>{form.targetCountries.join(", ") || "—"}</span>
            <span className="text-muted-foreground">Bütçe:</span><span>{form.dailyBudget ? `${form.budgetCurrency} ${form.dailyBudget}/gün` : form.lifetimeBudget ? `${form.budgetCurrency} ${form.lifetimeBudget} toplam` : "—"}</span>
            <span className="text-muted-foreground">Tarih:</span><span>{form.startDate && form.endDate ? `${form.startDate} → ${form.endDate}` : form.startDate || "—"}</span>
            <span className="text-muted-foreground">Format:</span><span>{AD_FORMATS.find((f) => f.value === form.adFormat)?.label}</span>
            <span className="text-muted-foreground">Medya:</span><span>{MEDIA_TYPES.find((m) => m.value === form.mediaType)?.label} ({form.mediaFiles.length} dosya)</span>
            <span className="text-muted-foreground">CTA:</span><span>{CTA_OPTIONS.find((c) => c.value === form.ctaType)?.label}</span>
            <span className="text-muted-foreground">Hedef URL:</span><span className="truncate">{form.destinationUrl || "—"}</span>
            <span className="text-muted-foreground">Teşvik:</span><span>{incentiveRate ? `${incentiveRate}%` : "—"}</span>
            <span className="text-muted-foreground">Hariç tutulan:</span>
            <span>{form.excludedPlacements.length > 0
              ? PLACEMENT_GROUPS
                  .filter((g) => g.placements.some((p) => form.excludedPlacements.includes(p.key)))
                  .map((g) => g.label.split(" (")[0])
                  .join(", ")
              : "Yok"
            }</span>
          </div>
          {(form.headline || form.adCopy) && (
            <div className="mt-2 rounded-lg border p-4 text-sm">
              {form.headline && <p className="font-semibold">{form.headline}</p>}
              {form.adCopy && <p className="text-muted-foreground mt-1 whitespace-pre-line">{form.adCopy}</p>}
              {form.description && <p className="text-xs text-muted-foreground mt-1">{form.description}</p>}
            </div>
          )}
          {form.mediaPreviews.length > 0 && (
            <div className="flex gap-2 overflow-x-auto py-2">
              {form.mediaPreviews.map((preview, i) => (
                <img key={i} src={preview} alt={`Preview ${i + 1}`} className="h-20 w-20 rounded-md object-cover border shrink-0" />
              ))}
            </div>
          )}
          {policyResults.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              <h3 className="font-semibold">Policy Check Results</h3>
              {policyResults.map((r, i) => (
                <div key={i} className={`text-sm p-2 rounded ${r.level === "blocker" ? "bg-red-50 text-red-800 border border-red-200" : r.level === "warning" ? "bg-yellow-50 text-yellow-800 border border-yellow-200" : "bg-blue-50 text-blue-800 border border-blue-200"}`}>
                  <strong>{r.level.toUpperCase()}:</strong> {r.message}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => { setValidationErrors({}); setStep((s) => Math.max(0, s - 1)); }} disabled={step === 0}>
          Previous
        </Button>
        {step < 4 ? (
          <Button onClick={() => { if (validateStep(step)) setStep((s) => s + 1); }}>
            Next
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Creating..." : "Create Campaign"}
          </Button>
        )}
      </div>
    </div>
  );
}
