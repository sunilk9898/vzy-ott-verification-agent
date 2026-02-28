"use client";

import { useReportStore, useAuthStore, useScanStore } from "@/lib/store";
import { getScoreStatus, timeAgo, cn } from "@/lib/utils";
import { abortScan } from "@/lib/api";
import {
  Bell, User, LogOut, Loader2, Activity, StopCircle,
} from "lucide-react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function Header() {
  const { report } = useReportStore();
  const { user, logout } = useAuthStore();
  const { activeScan, setActiveScan } = useScanStore();

  const status = report ? getScoreStatus(report.kpiScore.overallScore) : null;

  return (
    <header className="h-16 border-b border-white/[0.06] bg-surface-1/80 backdrop-blur-lg flex items-center justify-between px-6 sticky top-0 z-30">
      {/* Left: scan target + status */}
      <div className="flex items-center gap-4">
        {report && (
          <>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "status-dot",
                  status === "healthy" && "status-dot-healthy",
                  status === "warning" && "status-dot-warning",
                  status === "critical" && "status-dot-critical",
                )}
              />
              <span className="text-sm font-medium text-gray-200">
                {report.target.url || report.target.repoPath}
              </span>
            </div>
            <span className="text-xs text-gray-500">
              Last scan: {timeAgo(report.generatedAt)}
            </span>
          </>
        )}

        {/* Active scan indicator with abort */}
        {activeScan && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-brand-600/15 border border-brand-500/30">
            <Loader2 className="w-3.5 h-3.5 text-brand-400 animate-spin" />
            <span className="text-xs font-medium text-brand-400">Scanning...</span>
            <button
              onClick={async () => {
                try { await abortScan(activeScan.scanId); } catch {}
                setActiveScan(null);
              }}
              className="ml-1 p-0.5 rounded hover:bg-red-500/20 transition-colors"
              title="Abort scan"
            >
              <StopCircle className="w-3.5 h-3.5 text-red-400" />
            </button>
          </div>
        )}
      </div>

      {/* Right: notifications + user */}
      <div className="flex items-center gap-3">
        {/* System health indicator */}
        <button className="btn-ghost p-2 relative" aria-label="System health">
          <Activity className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-kpi-pass" />
        </button>

        {/* Notifications */}
        <button className="btn-ghost p-2 relative" aria-label="Notifications">
          <Bell className="w-4 h-4" />
          {report && report.criticalFindings.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {report.criticalFindings.length > 9 ? "9+" : report.criticalFindings.length}
            </span>
          )}
        </button>

        {/* User menu */}
        {user && (
          <div className="flex items-center gap-2 pl-3 border-l border-white/[0.06]">
            <div className="w-7 h-7 rounded-full bg-brand-600/30 flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-brand-400" />
            </div>
            <div className="hidden sm:block">
              <div className="text-xs font-medium text-gray-200">{user.name}</div>
              <div className="text-[10px] text-gray-500 uppercase">{user.role}</div>
            </div>
            <button
              onClick={() => {
                logout();
                window.location.href = basePath + "/login";
              }}
              className="btn-ghost p-1.5 ml-1"
              aria-label="Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
