"use client";

import { useEffect, useState } from "react";
import {
  Shield, Gauge, Code2, AlertTriangle, TrendingUp, TrendingDown, Minus,
  Clock, BarChart3, ArrowRight, Loader2, CheckCircle2, XCircle, List,
} from "lucide-react";
import Link from "next/link";
import { KPIGauge } from "@/components/charts/kpi-gauge";
import { TrendChart } from "@/components/charts/trend-chart";
import { ScoreRing } from "@/components/charts/score-ring";
import { SeverityPie } from "@/components/charts/severity-pie";
import { MetricCard } from "@/components/cards/metric-card";
import { RegressionBanner } from "@/components/cards/regression-banner";
import { FindingRow } from "@/components/cards/finding-row";
import { ScanInput } from "@/components/shared/scan-input";
import { useScanReport } from "@/hooks/use-scan-report";
import { getTrends, triggerBatchScan, getLatestReport, type TrendPoint } from "@/lib/api";
import { cn, timeAgo, getScoreStatus } from "@/lib/utils";
import { useUIStore, useBatchStore, useReportStore, type BatchScanEntry } from "@/lib/store";
import { onBatchProgress, onBatchComplete } from "@/lib/websocket";

export default function OverviewPage() {
  const {
    report, target, loading, error, findingsBySeverity,
    setTarget, startScan, refresh,
  } = useScanReport();

  const { trendRange, setTrendRange } = useUIStore();
  const { batchScans, batchRunning, startBatch, updateBatchEntry, clearBatch } = useBatchStore();
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);

  // Load a specific URL's report into the global store (used by all sub-pages)
  const loadReportForUrl = async (url: string) => {
    setTarget(url);
    try {
      const r = await getLatestReport(url);
      useReportStore.getState().setReport(r);
    } catch (e: any) {
      console.warn("Failed to load report for", url, e.message);
    }
  };

  // Handle batch scan submission
  const handleBatchSubmit = async (config: { urls: string[]; platform: any; agents: any[] }) => {
    try {
      const res = await triggerBatchScan(config);
      startBatch(res.batchId, res.scans.map((s) => ({ url: s.url, scanId: s.scanId })));
    } catch (err: any) {
      alert(`Batch scan failed: ${err.message}`);
    }
  };

  // Listen for batch WebSocket events
  useEffect(() => {
    const unsubProgress = onBatchProgress((data) => {
      updateBatchEntry(data.scanId, {
        status: data.status as BatchScanEntry["status"],
        score: data.score,
        error: data.error,
      });
      // Auto-load the first completed URL's report so sub-pages have data
      if (data.status === "completed" && data.url && !target) {
        loadReportForUrl(data.url);
      }
    });
    const unsubComplete = onBatchComplete(() => {
      useBatchStore.setState({ batchRunning: false });
      // If still no target set, load the first completed URL
      const completed = useBatchStore.getState().batchScans.find((s) => s.status === "completed");
      if (completed && !useReportStore.getState().target) {
        loadReportForUrl(completed.url);
      }
    });
    return () => {
      unsubProgress();
      unsubComplete();
    };
  }, [updateBatchEntry, target]);

  // Load trend data
  useEffect(() => {
    if (!target) return;
    getTrends(target, trendRange).then(setTrendData).catch(() => {});
  }, [target, trendRange]);

  const kpi = report?.kpiScore;

  // ── No target selected: show input ──
  if (!target) {
    return (
      <div className="max-w-xl mx-auto mt-20 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gradient">VZY OTT Verification Agent</h1>
          <p className="text-gray-400">
            Enter a website URL or source code path to start analyzing security, performance, and code quality.
          </p>
        </div>
        <ScanInput
          onSubmit={(config) => {
            const t = config.url || config.repoPath || "";
            setTarget(t);
            startScan(config);
          }}
          onBatchSubmit={handleBatchSubmit}
          loading={loading || batchRunning}
        />

        {/* Batch progress tracker */}
        {batchScans.length > 0 && <BatchProgressPanel batchScans={batchScans} batchRunning={batchRunning} clearBatch={clearBatch} onSelectUrl={loadReportForUrl} activeUrl={target} />}
      </div>
    );
  }

  // ── Loading state ──
  if (loading && !report) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-brand-500/30 border-t-brand-500 rounded-full animate-spin mx-auto" />
          <div className="text-gray-400">Loading scan report...</div>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error && !report) {
    return (
      <div className="max-w-xl mx-auto mt-20 space-y-6">
        <div className="card p-6 text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
          <div className="text-red-400 text-sm">{error}</div>
          <p className="text-gray-500 text-xs">No scan data found. Run a scan to get started.</p>
        </div>
        <ScanInput
          onSubmit={(config) => startScan(config)}
          onBatchSubmit={handleBatchSubmit}
          loading={loading || batchRunning}
        />

        {/* Batch progress tracker */}
        {batchScans.length > 0 && <BatchProgressPanel batchScans={batchScans} batchRunning={batchRunning} clearBatch={clearBatch} onSelectUrl={loadReportForUrl} activeUrl={target} />}
      </div>
    );
  }

  if (!report || !kpi) return null;

  const trendIcon = kpi.trend.direction === "improving"
    ? TrendingUp
    : kpi.trend.direction === "declining"
    ? TrendingDown
    : Minus;

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto">
      {/* ── Regression Alert Banner ── */}
      <RegressionBanner regressions={kpi.regressions} />

      {/* ── Top Row: Central KPI + Agent Scores ── */}
      <div className="grid grid-cols-12 gap-6">
        {/* Central KPI Gauge */}
        <div className="col-span-12 lg:col-span-4">
          <div className="card p-8 flex flex-col items-center justify-center h-full">
            <KPIGauge score={kpi.overallScore} label="Overall KPI" size="xl" />
            <div className="flex items-center gap-2 mt-4 text-sm">
              {(() => {
                const Icon = trendIcon;
                return (
                  <Icon className={cn(
                    "w-4 h-4",
                    kpi.trend.direction === "improving" ? "text-green-400"
                    : kpi.trend.direction === "declining" ? "text-red-400"
                    : "text-gray-500",
                  )} />
                );
              })()}
              <span className={cn(
                "font-medium",
                kpi.trend.direction === "improving" ? "text-green-400"
                : kpi.trend.direction === "declining" ? "text-red-400"
                : "text-gray-500",
              )}>
                {kpi.trend.delta > 0 ? "+" : ""}{kpi.trend.delta.toFixed(1)}
              </span>
              <span className="text-gray-500">vs last scan</span>
            </div>
          </div>
        </div>

        {/* Agent Score Cards */}
        <div className="col-span-12 lg:col-span-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/security" className="block">
            <ScoreRing
              score={kpi.grades.security.rawScore}
              label="Security"
              weight="40%"
            />
          </Link>
          <Link href="/performance" className="block">
            <ScoreRing
              score={kpi.grades.performance.rawScore}
              label="Performance"
              weight="35%"
            />
          </Link>
          <Link href="/code-quality" className="block">
            <ScoreRing
              score={kpi.grades.codeQuality.rawScore}
              label="Code Quality"
              weight="25%"
            />
          </Link>

          {/* Quick Metrics Row */}
          <MetricCard
            label="Critical Issues"
            value={findingsBySeverity.critical || 0}
            icon={AlertTriangle}
            status={findingsBySeverity.critical ? "bad" : "good"}
          />
          <MetricCard
            label="High Issues"
            value={findingsBySeverity.high || 0}
            icon={Shield}
            status={findingsBySeverity.high ? "warn" : "good"}
          />
          <MetricCard
            label="Last Scan"
            value={timeAgo(report.generatedAt)}
            subtitle={report.platform === "both" ? "Desktop + mWeb" : report.platform}
            icon={Clock}
            status="neutral"
          />
        </div>
      </div>

      {/* ── Trend Chart ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-200">KPI Score Trend</h2>
            <p className="text-xs text-gray-500">Overall score over time (target: 95)</p>
          </div>
          <div className="flex gap-1">
            {([7, 30, 90] as const).map((d) => (
              <button
                key={d}
                onClick={() => setTrendRange(d)}
                className={cn(
                  "btn text-xs py-1 px-3",
                  trendRange === d
                    ? "bg-brand-600/20 text-brand-400 border border-brand-500/30"
                    : "btn-ghost",
                )}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        <TrendChart
          data={trendData.length > 0 ? trendData : kpi.trend.history}
          showBreakdown
        />
      </div>

      {/* ── Bottom Row: Findings + Severity Distribution ── */}
      <div className="grid grid-cols-12 gap-6">
        {/* Critical Findings List */}
        <div className="col-span-12 lg:col-span-8">
          <div className="card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <h2 className="text-sm font-semibold text-gray-200">
                Critical & High Findings ({report.criticalFindings.length})
              </h2>
              <Link href="/security" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {report.criticalFindings.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-500">
                  No critical or high findings. Great job!
                </div>
              ) : (
                report.criticalFindings.slice(0, 10).map((f) => (
                  <FindingRow key={f.id} finding={f} />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Severity Distribution */}
        <div className="col-span-12 lg:col-span-4">
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-200 mb-2">Severity Distribution</h2>
            <SeverityPie data={findingsBySeverity} />
          </div>

          {/* Executive Summary */}
          <div className="card p-5 mt-6">
            <h2 className="text-sm font-semibold text-gray-200 mb-2">Executive Summary</h2>
            <p className="text-xs text-gray-400 leading-relaxed">{report.executiveSummary}</p>
          </div>
        </div>
      </div>

      {/* ── Recommendations ── */}
      {report.recommendations.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-200 mb-4">Top Recommendations</h2>
          <div className="space-y-3">
            {report.recommendations.slice(0, 5).map((r) => (
              <div key={r.priority} className="flex items-start gap-4 p-3 rounded-lg bg-surface-1">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-600/20 text-brand-400 flex items-center justify-center text-xs font-bold">
                  {r.priority}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-200">{r.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{r.description}</div>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[10px] text-gray-500 uppercase">Impact: {r.impact}</span>
                    <span className={cn(
                      "badge text-[10px]",
                      r.effort === "low" ? "bg-green-500/15 text-green-400 border-green-500/30"
                      : r.effort === "medium" ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                      : "bg-red-500/15 text-red-400 border-red-500/30",
                    )}>
                      Effort: {r.effort}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Batch progress tracker (shown when report is loaded too) */}
      {batchScans.length > 0 && <BatchProgressPanel batchScans={batchScans} batchRunning={batchRunning} clearBatch={clearBatch} onSelectUrl={loadReportForUrl} activeUrl={target} />}
    </div>
  );
}

// ── Batch Progress Panel (reusable within this page) ──
function BatchProgressPanel({
  batchScans,
  batchRunning,
  clearBatch,
  onSelectUrl,
  activeUrl,
}: {
  batchScans: BatchScanEntry[];
  batchRunning: boolean;
  clearBatch: () => void;
  onSelectUrl?: (url: string) => void;
  activeUrl?: string;
}) {
  const completed = batchScans.filter((s) => s.status === "completed").length;
  const errors = batchScans.filter((s) => s.status === "error").length;
  const total = batchScans.length;

  return (
    <div className="card mt-6">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          {batchRunning ? (
            <Loader2 className="w-4 h-4 text-brand-400 animate-spin" />
          ) : (
            <List className="w-4 h-4 text-brand-400" />
          )}
          <div>
            <h3 className="text-sm font-semibold text-gray-200">
              Batch Scan {batchRunning ? "in Progress" : "Complete"}
            </h3>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {completed}/{total} completed
              {errors > 0 && ` · ${errors} failed`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-32 h-1.5 bg-surface-4 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all duration-500"
              style={{ width: `${total > 0 ? ((completed + errors) / total) * 100 : 0}%` }}
            />
          </div>
          {!batchRunning && (
            <button onClick={clearBatch} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
              Clear
            </button>
          )}
        </div>
      </div>
      <div className="divide-y divide-white/[0.04] max-h-[400px] overflow-y-auto">
        {batchScans.map((scan, i) => {
          const isClickable = scan.status === "completed" && onSelectUrl;
          const isActive = activeUrl === scan.url;
          return (
            <div
              key={scan.scanId}
              onClick={() => isClickable && onSelectUrl(scan.url)}
              className={cn(
                "px-5 py-3 flex items-center justify-between transition-colors",
                isClickable && "cursor-pointer hover:bg-white/[0.04]",
                isActive && "bg-brand-600/10 border-l-2 border-brand-500",
              )}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="text-[10px] text-gray-600 w-5 text-right shrink-0">{i + 1}.</span>
                {scan.status === "completed" ? (
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                ) : scan.status === "running" ? (
                  <Loader2 className="w-4 h-4 text-brand-400 animate-spin shrink-0" />
                ) : scan.status === "error" ? (
                  <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                ) : (
                  <Clock className="w-4 h-4 text-gray-500 shrink-0" />
                )}
                <span className="text-xs text-gray-300 truncate">{scan.url}</span>
                {isActive && <span className="text-[9px] text-brand-400 font-medium ml-1">Active</span>}
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-3">
                {scan.score !== undefined && (
                  <span className={cn(
                    "text-sm font-bold",
                    scan.score >= 95 ? "text-green-400" : scan.score >= 70 ? "text-amber-400" : "text-red-400",
                  )}>
                    {scan.score}
                  </span>
                )}
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full font-medium",
                  scan.status === "completed" ? "bg-green-500/15 text-green-400" :
                  scan.status === "running" ? "bg-brand-500/15 text-brand-400" :
                  scan.status === "error" ? "bg-red-500/15 text-red-400" :
                  "bg-white/[0.06] text-gray-500",
                )}>
                  {scan.status === "completed" ? "Done" : scan.status === "running" ? "Scanning" : scan.status === "error" ? "Failed" : "Queued"}
                </span>
                {isClickable && (
                  <ArrowRight className="w-3 h-3 text-gray-500" />
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!batchRunning && batchScans.some((s) => s.status === "completed") && (
        <div className="px-5 py-2 border-t border-white/[0.06]">
          <p className="text-[10px] text-gray-500">Click a completed scan to view its detailed report across all pages</p>
        </div>
      )}
    </div>
  );
}
