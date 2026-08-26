"use client";

import { cn } from "@/lib/utils";

interface SuggestionCardsProps {
  onSelect: (prompt: string) => void;
}

const SUGGESTIONS = [
  { label: "Yeni kampanya oluştur", prompt: "Yeni bir kampanya oluşturmak istiyorum" },
  { label: "Kampanya analizi", prompt: "Aktif kampanyalarımın performansını analiz et" },
  { label: "Bütçe önerisi", prompt: "Bu ay için bütçe dağılımı öner" },
  { label: "Ad copy yaz", prompt: "Almanya hedefli rhinoplasty için ad copy yaz" },
];

export function SuggestionCards({ onSelect }: SuggestionCardsProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-lg text-center">
        <h2 className="mb-2 text-xl font-semibold">Campaign Intelligence</h2>
        <p className="mb-8 text-sm text-muted-foreground">
          Kampanya oluşturma, analiz ve strateji konusunda size yardımcı olabilirim.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              onClick={() => onSelect(s.prompt)}
              className={cn(
                "rounded-lg border p-4 text-left text-sm transition-colors",
                "hover:bg-muted hover:border-primary/30",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
