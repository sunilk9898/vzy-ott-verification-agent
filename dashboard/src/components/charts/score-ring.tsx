"use client";

import { cn, getScoreColor } from "@/lib/utils";

interface ScoreRingProps {
  score: number;
  label: string;
  weight: string;
  delta?: number;
  size?: number;
}

export function ScoreRing({ score, label, weight, delta, size = 100 }: ScoreRingProps) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="card p-4 flex items-center gap-4 animate-fade-up">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6}
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none"
            stroke={score >= 95 ? "#22c55e" : score >= 80 ? "#f59e0b" : "#ef4444"}
            strokeWidth={6} strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            className="gauge-ring"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("text-xl font-bold tabular-nums", getScoreColor(score))}>
            {score}
          </span>
        </div>
      </div>

      <div className="min-w-0">
        <div className="text-sm font-semibold text-gray-200">{label}</div>
        <div className="text-xs text-gray-500">Weight: {weight}</div>
        {delta !== undefined && delta !== 0 && (
          <div className={cn(
            "text-xs font-medium mt-1",
            delta > 0 ? "text-green-400" : "text-red-400",
          )}>
            {delta > 0 ? "+" : ""}{delta.toFixed(1)} from last scan
          </div>
        )}
      </div>
    </div>
  );
}
