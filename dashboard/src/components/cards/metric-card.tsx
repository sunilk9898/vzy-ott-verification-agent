"use client";

import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: { delta: number; label: string };
  status?: "good" | "warn" | "bad" | "neutral";
  className?: string;
  onClick?: () => void;
}

export function MetricCard({
  label,
  value,
  subtitle,
  icon: Icon,
  trend,
  status = "neutral",
  className,
  onClick,
}: MetricCardProps) {
  const isClickable = !!onClick;
  const Wrapper = isClickable ? "button" : "div";

  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        "card p-4 animate-fade-up text-left w-full",
        isClickable && "cursor-pointer hover:bg-white/[0.04] hover:border-brand-500/30 transition-all group",
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</div>
          <div
            className={cn(
              "text-2xl font-bold mt-1 tabular-nums",
              status === "good" && "text-green-400",
              status === "warn" && "text-amber-400",
              status === "bad" && "text-red-400",
              status === "neutral" && "text-gray-100",
            )}
          >
            {value}
          </div>
          {subtitle && <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-1">
          {Icon && (
            <div
              className={cn(
                "p-2 rounded-lg",
                status === "good" && "bg-green-500/10 text-green-400",
                status === "warn" && "bg-amber-500/10 text-amber-400",
                status === "bad" && "bg-red-500/10 text-red-400",
                status === "neutral" && "bg-white/[0.04] text-gray-400",
              )}
            >
              <Icon className="w-4 h-4" />
            </div>
          )}
          {isClickable && (
            <ChevronRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-brand-400 transition-colors" />
          )}
        </div>
      </div>

      {trend && (
        <div className="mt-3 pt-3 border-t border-white/[0.04] flex items-center gap-1.5">
          <span
            className={cn(
              "text-xs font-semibold",
              trend.delta > 0 ? "text-green-400" : trend.delta < 0 ? "text-red-400" : "text-gray-500",
            )}
          >
            {trend.delta > 0 ? "+" : ""}{trend.delta}
          </span>
          <span className="text-xs text-gray-500">{trend.label}</span>
        </div>
      )}

      {isClickable && (
        <div className="mt-2 text-[10px] text-gray-600 group-hover:text-gray-400 transition-colors">
          Click for details
        </div>
      )}
    </Wrapper>
  );
}
