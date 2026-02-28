"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from "recharts";

interface CWVBarsProps {
  vitals: Record<string, { value: number; rating: string }>;
  height?: number;
}

const TARGETS: Record<string, { target: number; unit: string }> = {
  lcp:  { target: 2500, unit: "ms" },
  fcp:  { target: 1800, unit: "ms" },
  cls:  { target: 0.1,  unit: "" },
  ttfb: { target: 800,  unit: "ms" },
  fid:  { target: 100,  unit: "ms" },
  inp:  { target: 200,  unit: "ms" },
};

export function CWVBars({ vitals, height = 260 }: CWVBarsProps) {
  const data = Object.entries(vitals).map(([key, v]) => {
    const t = TARGETS[key];
    const pct = t ? (v.value / t.target) * 100 : v.value;
    return {
      name: key.toUpperCase(),
      value: v.value,
      pct: Math.min(pct, 200),
      rating: v.rating,
      target: t?.target || 0,
      unit: t?.unit || "",
    };
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 10, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.04)" />
        <XAxis type="number" domain={[0, 200]} tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} hide />
        <YAxis
          type="category" dataKey="name" width={50}
          tick={{ fill: "#9ca3af", fontSize: 12, fontWeight: 600 }}
          axisLine={false} tickLine={false}
        />
        <ReferenceLine x={100} stroke="#22c55e" strokeDasharray="4 3" strokeOpacity={0.6} />
        <Tooltip
          contentStyle={{ backgroundColor: "#1a1a24", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", fontSize: "12px" }}
          formatter={(_, __, props) => {
            const item = props.payload;
            return [`${item.value}${item.unit} (target: <${item.target}${item.unit})`, item.name];
          }}
        />
        <Bar dataKey="pct" radius={[0, 4, 4, 0]} barSize={20}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={
                entry.rating === "good" ? "#22c55e"
                : entry.rating === "needs-improvement" ? "#f59e0b"
                : "#ef4444"
              }
              fillOpacity={0.8}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
