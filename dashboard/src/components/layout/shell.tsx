"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { useAuthStore, useUIStore, useReportStore, useScanStore } from "@/lib/store";
import { getLatestReport } from "@/lib/api";
import { connect, disconnect, onScanComplete, onScanError } from "@/lib/websocket";
import { cn } from "@/lib/utils";
import { isDemoMode, DEMO_REPORT } from "@/lib/demo-data";

export function Shell({ children }: { children: React.ReactNode }) {
  // ---- ALL hooks MUST be called before any conditional return ----
  const { sidebarCollapsed } = useUIStore();
  const { target, report, setReport, setTarget, setLoading, setError } = useReportStore();
  const { token } = useAuthStore();
  const { completeScan, setActiveScan } = useScanStore();
  const pathname = usePathname();
  const router = useRouter();

  // Hydration guard: zustand persist loads from localStorage async,
  // so token is null on the very first render. Wait one tick.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const isLoginPage = pathname === "/login";

  // Client-side auth guard (middleware doesn't work in static export)
  useEffect(() => {
    if (!hydrated) return;
    if (!token && !isLoginPage) {
      router.replace("/login");
    }
  }, [hydrated, token, isLoginPage, router]);

  // Auto-load demo data when in demo mode and no report loaded
  useEffect(() => {
    if (!hydrated || isLoginPage || !token) return;
    if (isDemoMode() && !report) {
      const demoTarget = DEMO_REPORT.target.url || "https://www.watcho.com";
      setTarget(demoTarget);
      setReport(DEMO_REPORT as any);
    }
  }, [hydrated, isLoginPage, token, report, setTarget, setReport]);

  // Load latest report when target changes (only when authenticated, skip in demo mode)
  useEffect(() => {
    if (!token || isLoginPage || !target) return;
    // In demo mode, report is already loaded above — don't re-fetch
    if (isDemoMode()) return;
    let cancelled = false;

    setLoading(true);
    getLatestReport(target)
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => { cancelled = true; };
  }, [token, isLoginPage, target, setReport, setLoading, setError]);

  // Connect WebSocket on mount (only when authenticated, skip in demo mode)
  useEffect(() => {
    if (!token || isLoginPage) return;
    if (isDemoMode()) return; // no websocket needed in demo mode

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

  // Wait for hydration before deciding to show content or redirect
  if (!hydrated || !token) {
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
