"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface CountryChartProps {
  data: Array<{ country: string; count: number }>;
}

export function CountryChart({ data }: CountryChartProps) {
  if (data.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-8">
        Lead ülke verisi yok.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 36)}>
      <BarChart data={data} layout="vertical" margin={{ left: 80 }}>
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey="country" tick={{ fontSize: 12 }} width={80} />
        <Tooltip formatter={(value) => [String(value), "Lead"]} />
        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
