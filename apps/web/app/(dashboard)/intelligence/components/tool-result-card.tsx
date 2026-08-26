"use client";

import { useState } from "react";
import { isActionTool } from "@/lib/ai/tools/actions";

interface ToolResultCardProps {
  toolName: string;
  state: string;
  result?: unknown;
  errorText?: string;
  onSendMessage?: (text: string) => void;
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

const SELECTABLE_TOOLS: Record<string, { nameKey: string; localKey: string; sendPrefix: string }> = {
  getCountries: { nameKey: "name", localKey: "nameLocal", sendPrefix: "Hedef ülkeler" },
  getTreatmentCategories: { nameKey: "name", localKey: "nameLocal", sendPrefix: "Tedavi kategorileri" },
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

function SelectableChipList({
  items,
  config,
  onSend,
}: {
  items: Array<Record<string, unknown>>;
  config: { nameKey: string; localKey: string; sendPrefix: string };
  onSend: (text: string) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sent, setSent] = useState(false);

  const names = items
    .map((item) => String(item[config.localKey] || item[config.nameKey] || ""))
    .filter(Boolean);

  const toggle = (name: string) => {
    if (sent) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleSend = () => {
    if (selected.size === 0) return;
    const selectedNames = names.filter((n) => selected.has(n));
    onSend(`${config.sendPrefix}: ${selectedNames.join(", ")}`);
    setSent(true);
  };

  if (sent) {
    const selectedNames = names.filter((n) => selected.has(n));
    return (
      <div className="mt-1 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {selectedNames.map((name) => (
            <span
              key={name}
              className="inline-flex items-center rounded-full border border-green-300 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:border-green-700 dark:bg-green-950/30 dark:text-green-400"
            >
              {name}
            </span>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{selectedNames.length} seçim gönderildi</p>
      </div>
    );
  }

  return (
    <div className="mt-1 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {names.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => toggle(name)}
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer ${
              selected.has(name)
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:bg-muted"
            }`}
          >
            {name}
          </button>
        ))}
      </div>
      {selected.size > 0 && (
        <button
          type="button"
          onClick={handleSend}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
        >
          {selected.size} seçimi gönder
        </button>
      )}
    </div>
  );
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

export function ToolResultCard({ toolName, state, result, errorText, onSendMessage }: ToolResultCardProps) {
  const [expanded, setExpanded] = useState(false);
  const label = TOOL_LABELS[toolName] ?? toolName;
  const isAction = isActionTool(toolName);
  const selectableConfig = SELECTABLE_TOOLS[toolName];
  const isSelectable = Boolean(selectableConfig) && Array.isArray(result) && Boolean(onSendMessage);

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
            {isSelectable ? (
              <SelectableChipList
                items={result as Array<Record<string, unknown>>}
                config={selectableConfig!}
                onSend={onSendMessage!}
              />
            ) : (
              formatToolResult(toolName, result)
            )}
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
