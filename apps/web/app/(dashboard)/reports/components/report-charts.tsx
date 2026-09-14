"use client";

import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

interface ChartData {
  date: string;
  spend: number;
  leads: number;
}

export function ReportCharts({ data }: { data: ChartData[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        Seçilen dönemde grafik verisi yok.
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
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <h4 className="mb-3 text-sm font-medium text-muted-foreground">Günlük Harcama</h4>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={formatted}>
            <defs>
              <linearGradient id="reportSpendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              formatter={(value) => [
                `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                "Harcama",
              ]}
            />
            <Area
              type="monotone"
              dataKey="spend"
              stroke="hsl(var(--primary))"
              fill="url(#reportSpendGrad)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h4 className="mb-3 text-sm font-medium text-muted-foreground">Günlük Lead</h4>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={formatted}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              formatter={(value) => [Number(value), "Lead"]}
            />
            <Bar
              dataKey="leads"
              fill="hsl(var(--primary))"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
