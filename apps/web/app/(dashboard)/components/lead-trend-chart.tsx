"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface LeadTrendChartProps {
  data: Array<{ date: string; count: number }>;
}

export function LeadTrendChart({ data }: LeadTrendChartProps) {
  if (data.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-8">
        Son 7 günde lead verisi yok.
      </p>
    );
  }

  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }),
  }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={formatted}>
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip
          formatter={(value) => [String(value), "Lead"]}
          labelFormatter={(label) => String(label)}
        />
        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
