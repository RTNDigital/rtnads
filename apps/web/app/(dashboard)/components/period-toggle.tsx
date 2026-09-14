"use client";

import { useRouter, useSearchParams } from "next/navigation";

const periods = [
  { value: "7", label: "7 Gün" },
  { value: "30", label: "30 Gün" },
] as const;

export function PeriodToggle() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("period") || "7";

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", value);
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="inline-flex items-center rounded-lg border bg-muted p-1">
      {periods.map((p) => (
        <button
          key={p.value}
          onClick={() => handleChange(p.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            current === p.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
