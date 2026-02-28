"use client";

import { AlertTriangle, ArrowDown } from "lucide-react";
import { cn, getSeverityBg } from "@/lib/utils";
import type { Regression } from "@/types/api";

interface RegressionBannerProps {
  regressions: Regression[];
}

export function RegressionBanner({ regressions }: RegressionBannerProps) {
  if (regressions.length === 0) return null;

  const criticalCount = regressions.filter((r) => r.severity === "critical" || r.severity === "high").length;

  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] p-4 animate-fade-up">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-lg bg-red-500/15">
          <AlertTriangle className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <div className="text-sm font-semibold text-red-400">
            {regressions.length} Regression{regressions.length !== 1 ? "s" : ""} Detected
          </div>
          <div className="text-xs text-gray-400">
            {criticalCount > 0 && `${criticalCount} critical/high severity`}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {regressions.slice(0, 5).map((r, i) => (
          <div key={i} className="flex items-center gap-3 text-sm">
            <span className={cn("badge text-[10px]", getSeverityBg(r.severity))}>
              {r.severity.toUpperCase()}
            </span>
            <span className="text-gray-300 flex-1 truncate">{r.metric}</span>
            <div className="flex items-center gap-1 text-red-400 text-xs font-medium tabular-nums">
              <ArrowDown className="w-3 h-3" />
              {Math.abs(r.delta).toFixed(1)}
            </div>
            <span className="text-xs text-gray-500 tabular-nums">
              {r.previousValue} → {r.currentValue}
            </span>
          </div>
        ))}
        {regressions.length > 5 && (
          <div className="text-xs text-gray-500 pl-8">
            +{regressions.length - 5} more regression(s)
          </div>
        )}
      </div>
    </div>
  );
}
