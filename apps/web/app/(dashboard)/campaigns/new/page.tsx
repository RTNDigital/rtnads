"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
  "China", "Turkey", "Israel", "South Africa",
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
    adCopy: "",
    headline: "",
    description: "",
    hasWhatsAppField: true,
    hasDisclaimer: false,
  });

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
          <Badge key={s} className={i === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}>
            {i + 1}. {s}
          </Badge>
        ))}
      </div>

      {step === 0 && (
        <Card className="p-6 flex flex-col gap-4">
          <div>
            <Label>Campaign Name</Label>
            <Input value={form.name} onChange={(e) => updateField("name", e.target.value)} placeholder="e.g. Rhinoplasty DE Q1 2026" />
          </div>
          <div>
            <Label>Client</Label>
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={form.clientId} onChange={(e) => updateField("clientId", e.target.value)}>
              <option value="">Select client...</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
            </select>
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
        </Card>
      )}

      {step === 3 && (
        <Card className="p-6 flex flex-col gap-4">
          <div>
            <Label>Ad Copy (Primary Text)</Label>
            <Textarea rows={4} value={form.adCopy} onChange={(e) => updateField("adCopy", e.target.value)} placeholder="Main ad text..." />
          </div>
          <div>
            <Label>Headline</Label>
            <Input value={form.headline} onChange={(e) => updateField("headline", e.target.value)} placeholder="Ad headline" />
          </div>
          <div>
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => updateField("description", e.target.value)} placeholder="Short description" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.hasWhatsAppField} onChange={(e) => updateField("hasWhatsAppField", e.target.checked)} />
            <Label>Include WhatsApp field in lead form (mandatory)</Label>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.hasDisclaimer} onChange={(e) => updateField("hasDisclaimer", e.target.checked)} />
            <Label>Includes mandatory İhracatçılar Birliği disclaimer (for agencies)</Label>
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card className="p-6 flex flex-col gap-4">
          <h2 className="font-semibold text-lg">Review Campaign</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">Name:</span><span>{form.name}</span>
            <span className="text-muted-foreground">Objective:</span><span>{OBJECTIVES.find((o) => o.value === form.objective)?.label}</span>
            <span className="text-muted-foreground">Countries:</span><span>{form.targetCountries.join(", ") || "—"}</span>
            <span className="text-muted-foreground">Budget:</span><span>{form.dailyBudget ? `${form.budgetCurrency} ${form.dailyBudget}/day` : form.lifetimeBudget ? `${form.budgetCurrency} ${form.lifetimeBudget} lifetime` : "—"}</span>
            <span className="text-muted-foreground">Format:</span><span>{AD_FORMATS.find((f) => f.value === form.adFormat)?.label}</span>
            <span className="text-muted-foreground">Incentive:</span><span>{incentiveRate ? `${incentiveRate}%` : "—"}</span>
          </div>
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
        <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          Previous
        </Button>
        {step < 4 ? (
          <Button onClick={() => setStep((s) => s + 1)}>
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
