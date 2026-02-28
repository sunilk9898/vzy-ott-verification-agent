"use client";

import { useEffect, useCallback } from "react";
import { useReportStore, useScanStore } from "@/lib/store";
import { getLatestReport, triggerScan, type ScanRequest } from "@/lib/api";
import { onScanComplete, onScanError } from "@/lib/websocket";
import type { ScanReport, AgentResult } from "@/types/api";

/** Central hook for consuming scan report data */
export function useScanReport() {
  const { report, target, loading, error, setReport, setTarget, setLoading, setError } = useReportStore();
  const { activeScan, setActiveScan, completeScan } = useScanStore();

  // Reload report
  const refresh = useCallback(async () => {
    if (!target) return;
    setLoading(true);
    try {
      const r = await getLatestReport(target);
      setReport(r);
    } catch (e: any) {
      setError(e.message);
    }
  }, [target, setReport, setLoading, setError]);

  // Trigger a new scan
  const startScan = useCallback(async (req: ScanRequest) => {
    setLoading(true);
    try {
      const res = await triggerScan(req);
      setActiveScan({
        scanId: res.scanId,
        status: "running",
        agents: {
          security: { progress: 0, status: "queued" },
          performance: { progress: 0, status: "queued" },
          "code-quality": { progress: 0, status: "queued" },
          "report-generator": { progress: 0, status: "queued" },
        },
        startedAt: new Date().toISOString(),
      });
      return res;
    } catch (e: any) {
      setError(e.message);
      throw e;
    }
  }, [setActiveScan, setLoading, setError]);

  // Listen for scan completion via WebSocket
  useEffect(() => {
    const unsubComplete = onScanComplete((data) => {
      completeScan(data.scanId, data.score, data.status);
      refresh();
    });
    const unsubError = onScanError(() => {
      setActiveScan(null);
      setLoading(false);
    });
    return () => {
      unsubComplete();
      unsubError();
    };
  }, [completeScan, setActiveScan, refresh, setLoading]);

  // Derived data helpers
  const securityResult = report?.agentResults.find((r) => r.agentType === "security") || null;
  const performanceResult = report?.agentResults.find((r) => r.agentType === "performance") || null;
  const codeQualityResult = report?.agentResults.find((r) => r.agentType === "code-quality") || null;

  const findingsBySeverity = (report?.agentResults.flatMap((r) => r.findings) || []).reduce(
    (acc, f) => {
      acc[f.severity] = (acc[f.severity] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return {
    report,
    target,
    loading,
    error,
    activeScan,
    securityResult,
    performanceResult,
    codeQualityResult,
    findingsBySeverity,
    setTarget,
    startScan,
    refresh,
  };
}
