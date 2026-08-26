"use client";

import { cn } from "@/lib/utils";
import { isActionTool } from "@/lib/ai/tools/actions";

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
  createCampaign: "Kampanya Oluşturuldu",
  updateCampaign: "Kampanya Güncellendi",
  generateAdCopy: "Ad Copy Oluşturuldu",
  publishCampaign: "Kampanya Yayınlandı",
};

function ActionResultCard({ label, result }: { label: string; result: unknown }) {
  const data = result as Record<string, unknown> | null;
  const isError = data && "error" in data;

  if (isError) {
    return (
      <div className="my-1 inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs dark:border-red-800 dark:bg-red-950/30">
        <span className="text-red-600">✕</span>
        <span>{label}: {String(data.error)}</span>
      </div>
    );
  }

  return (
    <div className="my-1 inline-flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs dark:border-green-800 dark:bg-green-950/30">
      <span className="text-green-600">✓</span>
      <span>{label}</span>
    </div>
  );
}

export function ToolResultCard({ toolName, state, result, errorText }: ToolResultCardProps) {
  const label = TOOL_LABELS[toolName] ?? toolName;
  const isAction = isActionTool(toolName);

  if (state === "output-error") {
    return (
      <div className="my-1 inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs dark:border-red-800 dark:bg-red-950/30">
        <span className="text-red-600">✕</span>
        <span>{label}: {errorText ?? "Hata oluştu"}</span>
      </div>
    );
  }

  if (state === "output-available") {
    if (isAction) {
      return <ActionResultCard label={label} result={result} />;
    }

    return (
      <div className="my-1 inline-flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-xs">
        <span className="text-green-600">✓</span>
        <span className="text-muted-foreground">{label}</span>
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
