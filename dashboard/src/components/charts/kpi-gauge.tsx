"use client";

import { useEffect, useState } from "react";
import { cn, getScoreColor, getScoreStatus } from "@/lib/utils";

interface KPIGaugeProps {
  score: number;
  label?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showStatus?: boolean;
  animate?: boolean;
}

const SIZES = {
  sm: { width: 80, stroke: 6, fontSize: "text-lg", labelSize: "text-[10px]" },
  md: { width: 120, stroke: 8, fontSize: "text-2xl", labelSize: "text-xs" },
  lg: { width: 180, stroke: 10, fontSize: "text-4xl", labelSize: "text-sm" },
  xl: { width: 240, stroke: 12, fontSize: "text-5xl", labelSize: "text-base" },
};

export function KPIGauge({
  score,
  label,
  size = "lg",
  showStatus = true,
  animate = true,
}: KPIGaugeProps) {
  const [displayed, setDisplayed] = useState(animate ? 0 : score);
  const config = SIZES[size];
  const radius = (config.width - config.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (displayed / 100) * circumference;
  const status = getScoreStatus(score);

  // Animate score counting up
  useEffect(() => {
    if (!animate) {
      setDisplayed(score);
      return;
    }
    let frame: number;
    const start = performance.now();
    const duration = 1200;
    const from = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(from + (score - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [score, animate]);

  const gradientId = `gauge-gradient-${size}-${score}`;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: config.width, height: config.width }}>
        <svg viewBox={`0 0 ${config.width} ${config.width}`} className="transform -rotate-90">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              {score >= 95 ? (
                <>
                  <stop offset="0%" stopColor="#22c55e" />
                  <stop offset="100%" stopColor="#4ade80" />
                </>
              ) : score >= 80 ? (
                <>
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#fbbf24" />
                </>
              ) : (
                <>
                  <stop offset="0%" stopColor="#ef4444" />
                  <stop offset="100%" stopColor="#f87171" />
                </>
              )}
            </linearGradient>
          </defs>

          {/* Track */}
          <circle
            cx={config.width / 2}
            cy={config.width / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={config.stroke}
          />

          {/* Value arc */}
          <circle
            cx={config.width / 2}
            cy={config.width / 2}
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={config.stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="gauge-ring"
          />
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("font-bold tabular-nums", config.fontSize, getScoreColor(score))}>
            {displayed}
          </span>
          {label && (
            <span className={cn("text-gray-400 font-medium", config.labelSize)}>
              {label}
            </span>
          )}
        </div>
      </div>

      {/* Status badge */}
      {showStatus && (
        <div
          className={cn(
            "badge",
            status === "healthy" && "bg-green-500/15 text-green-400 border-green-500/30",
            status === "warning" && "bg-amber-500/15 text-amber-400 border-amber-500/30",
            status === "critical" && "bg-red-500/15 text-red-400 border-red-500/30",
          )}
        >
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              status === "healthy" && "bg-green-400",
              status === "warning" && "bg-amber-400",
              status === "critical" && "bg-red-400 animate-pulse",
            )}
          />
          {status === "healthy" ? "Healthy" : status === "warning" ? "Warning" : "Critical"}
        </div>
      )}
    </div>
  );
}
