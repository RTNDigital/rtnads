"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface SpendTrendChartProps {
  data: Array<{ date: string; spend: number }>;
}

export function SpendTrendChart({ data }: SpendTrendChartProps) {
  if (data.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-8">
        Seçilen dönemde harcama verisi yok.
      </p>
    );
  }

  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "short",
    }),
  }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart data={formatted}>
        <defs>
          <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
        <Tooltip
          formatter={(value) => [
            `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            "Harcama",
          ]}
          labelFormatter={(label) => String(label)}
        />
        <Area
          type="monotone"
          dataKey="spend"
          stroke="hsl(var(--primary))"
          fill="url(#spendGradient)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
