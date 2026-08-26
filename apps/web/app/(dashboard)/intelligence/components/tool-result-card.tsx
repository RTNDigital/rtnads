"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface ToolResultCardProps {
  toolName: string;
  state: string;
  result?: unknown;
  errorText?: string;
}

const TOOL_LABELS: Record<string, string> = {
  getCountries: "Ülke Verileri",
  getTreatmentCategories: "Tedavi Kategorileri",
  getLeadFormTemplates: "Form Şablonları",
  getDisclaimer: "Disclaimer",
  checkPolicies: "Policy Kontrol",
  getCampaignList: "Kampanya Listesi",
  getCampaignDetails: "Kampanya Detayı",
  createCampaign: "Kampanya Oluştur",
  updateCampaign: "Kampanya Güncelle",
  generateAdCopy: "Ad Copy",
  publishCampaign: "Yayınla",
};

export function ToolResultCard({ toolName, state, result, errorText }: ToolResultCardProps) {
  const [expanded, setExpanded] = useState(false);
  const label = TOOL_LABELS[toolName] ?? toolName;

  if (state === "output-error") {
    return (
      <div className="my-1 inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs dark:border-red-800 dark:bg-red-950/30">
        <span className="text-red-600">✕</span>
        <span>{label}: {errorText ?? "Hata oluştu"}</span>
      </div>
    );
  }

  if (state === "output-available") {
    return (
      <div className="my-1">
        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-xs hover:bg-muted transition-colors"
        >
          <span className="text-green-600">✓</span>
          <span>{label}</span>
          <span className="text-muted-foreground">{expanded ? "▲" : "▼"}</span>
        </button>
        {expanded && result != null && (
          <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs">
            {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div className="my-1 inline-flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-xs">
      <span className="animate-spin">⏳</span>
      <span>{label} çalışıyor...</span>
    </div>
  );
}
