"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface CreativeFiltersProps {
  categories: string[];
  countries: string[];
  selectedType?: string;
  selectedCategory?: string;
  selectedCountry?: string;
}

export function CreativeFilters({
  categories,
  countries,
  selectedType,
  selectedCategory,
  selectedCountry,
}: CreativeFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/creatives?${params.toString()}`);
  }

  const hasFilters = selectedType || selectedCategory || selectedCountry;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        className="rounded-md border px-3 py-1.5 text-sm bg-background"
        value={selectedType || ""}
        onChange={(e) => updateParam("type", e.target.value)}
      >
        <option value="">Tüm tipler</option>
        <option value="image">Görsel</option>
        <option value="video">Video</option>
        <option value="carousel">Carousel</option>
      </select>

      {categories.length > 0 && (
        <select
          className="rounded-md border px-3 py-1.5 text-sm bg-background"
          value={selectedCategory || ""}
          onChange={(e) => updateParam("category", e.target.value)}
        >
          <option value="">Tüm kategoriler</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      )}

      {countries.length > 0 && (
        <select
          className="rounded-md border px-3 py-1.5 text-sm bg-background"
          value={selectedCountry || ""}
          onChange={(e) => updateParam("country", e.target.value)}
        >
          <option value="">Tüm ülkeler</option>
          {countries.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      )}

      {hasFilters && (
        <button
          onClick={() => router.push("/creatives")}
          className="text-xs text-primary hover:underline"
        >
          Filtreleri temizle
        </button>
      )}
    </div>
  );
}
