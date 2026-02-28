// ============================================================================
// Utility Functions
// ============================================================================

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Severity } from "@/types/api";

/** Merge Tailwind classes safely */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Score -> status label */
export function getScoreStatus(score: number): "healthy" | "warning" | "critical" {
  if (score >= 95) return "healthy";
  if (score >= 80) return "warning";
  return "critical";
}

/** Score -> color class */
export function getScoreColor(score: number): string {
  if (score >= 95) return "text-kpi-pass";
  if (score >= 80) return "text-kpi-warn";
  return "text-kpi-fail";
}

/** Score -> background class */
export function getScoreBg(score: number): string {
  if (score >= 95) return "bg-kpi-pass";
  if (score >= 80) return "bg-kpi-warn";
  return "bg-kpi-fail";
}

/** Severity -> color */
export function getSeverityColor(severity: Severity): string {
  const map: Record<Severity, string> = {
    critical: "text-severity-critical",
    high: "text-severity-high",
    medium: "text-severity-medium",
    low: "text-severity-low",
    info: "text-severity-info",
  };
  return map[severity];
}

/** Severity -> background */
export function getSeverityBg(severity: Severity): string {
  const map: Record<Severity, string> = {
    critical: "bg-red-500/15 text-red-400 border-red-500/30",
    high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    low: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    info: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  };
  return map[severity];
}

/** Format bytes to human-readable */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/** Format milliseconds */
export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Relative time */
export function timeAgo(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Truncate string */
export function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len) + "...";
}
