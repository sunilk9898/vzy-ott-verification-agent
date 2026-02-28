"use client";

import { useEffect } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { useUIStore, useReportStore, useScanStore } from "@/lib/store";
import { getLatestReport } from "@/lib/api";
import { connect, disconnect, onScanComplete, onScanError } from "@/lib/websocket";
import { cn } from "@/lib/utils";

export function Shell({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed } = useUIStore();
  const { target, setReport, setLoading, setError } = useReportStore();

  // Load latest report when target changes
  useEffect(() => {
    if (!target) return;
    let cancelled = false;

    setLoading(true);
    getLatestReport(target)
      .then((report) => {
        if (!cancelled) setReport(report);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => { cancelled = true; };
  }, [target, setReport, setLoading, setError]);

  const { completeScan, setActiveScan } = useScanStore();

  // Connect WebSocket on mount
  useEffect(() => {
    const socket = connect();
    const unsubComplete = onScanComplete((data) => {
      // Clear scan state and refresh report
      completeScan(data.scanId, data.score, data.status);
      if (target) {
        getLatestReport(target).then(setReport).catch(() => {});
      }
    });
    const unsubError = onScanError((data) => {
      // Clear scan state on error
      setActiveScan(null);
    });

    return () => {
      unsubComplete();
      unsubError();
      disconnect();
    };
  }, [target, setReport, completeScan, setActiveScan]);

  return (
    <div className="min-h-screen bg-surface-0">
      <Sidebar />
      <div
        className={cn(
          "transition-all duration-300",
          sidebarCollapsed ? "ml-[68px]" : "ml-[240px]",
        )}
      >
        <Header />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
