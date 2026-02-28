"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { useAuthStore, useUIStore, useReportStore, useScanStore } from "@/lib/store";
import { getLatestReport } from "@/lib/api";
import { connect, disconnect, onScanComplete, onScanError } from "@/lib/websocket";
import { cn } from "@/lib/utils";

export function Shell({ children }: { children: React.ReactNode }) {
  // ---- ALL hooks MUST be called before any conditional return ----
  const { sidebarCollapsed } = useUIStore();
  const { target, setReport, setLoading, setError } = useReportStore();
  const { token } = useAuthStore();
  const { completeScan, setActiveScan } = useScanStore();
  const pathname = usePathname();
  const router = useRouter();

  const isLoginPage = pathname === "/login";

  // Client-side auth guard (middleware doesn't work in static export)
  useEffect(() => {
    if (!token && !isLoginPage) {
      router.replace("/login");
    }
  }, [token, isLoginPage, router]);

  // Load latest report when target changes (only when authenticated)
  useEffect(() => {
    if (!token || isLoginPage || !target) return;
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
  }, [token, isLoginPage, target, setReport, setLoading, setError]);

  // Connect WebSocket on mount (only when authenticated)
  useEffect(() => {
    if (!token || isLoginPage) return;

    const socket = connect();
    const unsubComplete = onScanComplete((data) => {
      completeScan(data.scanId, data.score, data.status);
      if (target) {
        getLatestReport(target).then(setReport).catch(() => {});
      }
    });
    const unsubError = onScanError((data) => {
      setActiveScan(null);
    });

    return () => {
      unsubComplete();
      unsubError();
      disconnect();
    };
  }, [token, isLoginPage, target, setReport, completeScan, setActiveScan]);

  // ---- Conditional returns AFTER all hooks ----

  // If on login page, render children directly (no sidebar/header)
  if (isLoginPage) {
    return <>{children}</>;
  }

  // If no token and not on login page, show nothing while redirecting
  if (!token) {
    return null;
  }

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
