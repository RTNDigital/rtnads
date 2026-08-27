"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";

interface CampaignEditFormProps {
  campaignId: string;
  initialData: {
    name: string;
    dailyBudget: number | null;
    budgetCurrency: string | null;
    targetCountries: string[];
    headline: string | null;
    description: string | null;
    adCopy: string | null;
  };
}

export function CampaignEditForm({ campaignId, initialData }: CampaignEditFormProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(initialData);

  const updateField = (field: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/meta/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          dailyBudget: form.dailyBudget,
          targetCountries: form.targetCountries,
          headline: form.headline,
          description: form.description,
          adCopy: form.adCopy,
        }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm(initialData);
    setEditing(false);
  };

  if (!editing) {
    return (
      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
        Düzenle
      </Button>
    );
  }

  return (
    <Card className="p-6 flex flex-col gap-4">
      <h3 className="font-semibold">Kampanyayı Düzenle</h3>
      <div>
        <Label>Kampanya Adı</Label>
        <Input value={form.name} onChange={(e) => updateField("name", e.target.value)} />
      </div>
      <div>
        <Label>Günlük Bütçe ({form.budgetCurrency || "USD"})</Label>
        <Input
          type="number"
          value={form.dailyBudget ?? ""}
          onChange={(e) => updateField("dailyBudget", e.target.value ? parseInt(e.target.value) : null)}
        />
      </div>
      <div>
        <Label>Headline</Label>
        <Input value={form.headline ?? ""} onChange={(e) => updateField("headline", e.target.value)} />
      </div>
      <div>
        <Label>Description</Label>
        <Input value={form.description ?? ""} onChange={(e) => updateField("description", e.target.value)} />
      </div>
      <div>
        <Label>Ad Copy</Label>
        <Textarea rows={3} value={form.adCopy ?? ""} onChange={(e) => updateField("adCopy", e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </Button>
        <Button variant="outline" onClick={handleCancel}>İptal</Button>
      </div>
    </Card>
  );
}
