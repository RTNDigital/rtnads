"use client";

import { useState } from "react";
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

function formatToolResult(toolName: string, result: unknown): string {
  if (!result || typeof result !== "object") return String(result ?? "");

  try {
    if (Array.isArray(result)) {
      if (toolName === "getCountries") {
        const countries = result as Array<{ name?: string; nameLocal?: string }>;
        const names = countries.map((c) => c.nameLocal || c.name).filter(Boolean);
        return `${names.length} ülke: ${names.join(", ")}`;
      }
      if (toolName === "getTreatmentCategories") {
        const cats = result as Array<{ name?: string; nameLocal?: string }>;
        const names = cats.map((c) => c.nameLocal || c.name).filter(Boolean);
        return `${names.length} kategori: ${names.join(", ")}`;
      }
      if (toolName === "getCampaignList") {
        const campaigns = result as Array<{ name?: string }>;
        return `${campaigns.length} kampanya`;
      }
      return `${result.length} kayıt`;
    }

    const obj = result as Record<string, unknown>;
    if (obj.name) return String(obj.name);
    if (obj.status) return `Durum: ${obj.status}`;

    const keys = Object.keys(obj).slice(0, 5);
    return keys.map((k) => `${k}: ${JSON.stringify(obj[k])}`).join(", ");
  } catch {
    return JSON.stringify(result).slice(0, 200);
  }
}

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
  const [expanded, setExpanded] = useState(false);
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
      <div className="my-1">
        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-xs hover:bg-muted transition-colors cursor-pointer"
        >
          <span className="text-green-600">✓</span>
          <span>{label}</span>
          <span className="text-muted-foreground">{expanded ? "▲" : "▼"}</span>
        </button>
        {expanded && result != null && (
          <div className="mt-1 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {formatToolResult(toolName, result)}
          </div>
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
