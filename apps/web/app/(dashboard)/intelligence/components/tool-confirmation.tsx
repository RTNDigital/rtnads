"use client";

import { cn } from "@/lib/utils";

interface ToolConfirmationProps {
  toolName: string;
  input: Record<string, unknown>;
  onApprove: () => void;
  onReject: () => void;
  isExecuting: boolean;
}

const TOOL_LABELS: Record<string, string> = {
  createCampaign: "Kampanya Oluştur",
  updateCampaign: "Kampanya Güncelle",
  generateAdCopy: "Ad Copy Kaydet",
  publishCampaign: "Kampanya Yayınla",
};

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object" && value !== null) return JSON.stringify(value, null, 2);
  return String(value);
}

export function ToolConfirmation({ toolName, input, onApprove, onReject, isExecuting }: ToolConfirmationProps) {
  const label = TOOL_LABELS[toolName] ?? toolName;
  const hiddenKeys = toolName === "publishCampaign" ? ["clientId"] : ["clientId", "campaignId"];
  const displayArgs = Object.entries(input).filter(([key]) => !hiddenKeys.includes(key));

  return (
    <div className="my-2 max-w-md rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-lg">🔧</span>
        <span className="font-medium text-sm">{label}</span>
      </div>
      <div className="mb-3 space-y-1">
        {displayArgs.map(([key, value]) => (
          <div key={key} className="flex gap-2 text-xs">
            <span className="shrink-0 font-medium text-muted-foreground">{key}:</span>
            <span className="text-foreground">{formatValue(value)}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onApprove}
          disabled={isExecuting}
          className={cn(
            "rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground",
            "hover:bg-primary/90 disabled:opacity-50",
          )}
        >
          {isExecuting ? "İşleniyor..." : "Onayla"}
        </button>
        <button
          onClick={onReject}
          disabled={isExecuting}
          className={cn(
            "rounded-md border px-3 py-1.5 text-xs font-medium",
            "hover:bg-muted disabled:opacity-50",
          )}
        >
          İptal
        </button>
      </div>
    </div>
  );
}
