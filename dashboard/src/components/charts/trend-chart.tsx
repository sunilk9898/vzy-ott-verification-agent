"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { format, parseISO } from "date-fns";

interface TrendChartProps {
  data: { date: string; score: number; security?: number; performance?: number; codeQuality?: number }[];
  height?: number;
  showBreakdown?: boolean;
  target?: number;
}

export function TrendChart({
  data,
  height = 280,
  showBreakdown = false,
  target = 95,
}: TrendChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    dateLabel: (() => {
      try { return format(parseISO(d.date), "MMM d"); }
      catch { return d.date; }
    })(),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={formatted} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="gradOverall" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradSecurity" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradPerf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradCode" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a855f7" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />

        <XAxis
          dataKey="dateLabel"
          tick={{ fill: "#6b7280", fontSize: 11 }}
          axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: "#6b7280", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />

        {/* Target line */}
        <ReferenceLine
          y={target}
          stroke="#22c55e"
          strokeDasharray="6 4"
          strokeOpacity={0.5}
          label={{ value: `Target ${target}`, position: "right", fill: "#22c55e", fontSize: 10 }}
        />

        <Tooltip
          contentStyle={{
            backgroundColor: "#1a1a24",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          labelStyle={{ color: "#9ca3af" }}
          itemStyle={{ color: "#e5e7eb" }}
        />

        {/* Breakdown lines (optional) */}
        {showBreakdown && (
          <>
            <Area type="monotone" dataKey="security" stroke="#ef4444" fill="url(#gradSecurity)" strokeWidth={1.5} dot={false} name="Security" />
            <Area type="monotone" dataKey="performance" stroke="#22c55e" fill="url(#gradPerf)" strokeWidth={1.5} dot={false} name="Performance" />
            <Area type="monotone" dataKey="codeQuality" stroke="#a855f7" fill="url(#gradCode)" strokeWidth={1.5} dot={false} name="Code Quality" />
          </>
        )}

        {/* Overall score */}
        <Area
          type="monotone"
          dataKey="score"
          stroke="#3b82f6"
          fill="url(#gradOverall)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "#3b82f6", stroke: "#1a1a24", strokeWidth: 2 }}
          name="Overall"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
