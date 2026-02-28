"use client";

import { useState, useMemo } from "react";
import {
  Code2, Bug, Trash2, Timer, Brain, AlertOctagon, FileCode,
  BarChart3, AlertTriangle,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  Treemap,
} from "recharts";
import { KPIGauge } from "@/components/charts/kpi-gauge";
import { MetricCard } from "@/components/cards/metric-card";
import { FindingRow } from "@/components/cards/finding-row";
import { JsonViewer } from "@/components/shared/json-viewer";
import { useScanReport } from "@/hooks/use-scan-report";
import { cn, getSeverityBg } from "@/lib/utils";
import type { CodeQualityMetadata, Finding } from "@/types/api";

export default function CodeQualityPage() {
  const { report, codeQualityResult } = useScanReport();
  const [activeTab, setActiveTab] = useState<"overview" | "complexity" | "leaks" | "files" | "raw">("overview");

  if (!report || !codeQualityResult) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center text-gray-500 space-y-2">
          <Code2 className="w-12 h-12 mx-auto opacity-30" />
          <p className="text-sm">No code quality data available. Run a scan with code-quality agent enabled.</p>
        </div>
      </div>
    );
  }

  const meta = codeQualityResult.metadata as unknown as CodeQualityMetadata;
  const findings = codeQualityResult.findings;

  const tabs = [
    { id: "overview" as const, label: "Overview" },
    { id: "complexity" as const, label: "Complexity" },
    { id: "leaks" as const, label: "Memory & Async" },
    { id: "files" as const, label: "Problematic Files" },
    { id: "raw" as const, label: "Raw JSON" },
  ];

  // Group findings by category for the overview
  const categoryGroups = useMemo(() => {
    const groups: Record<string, Finding[]> = {};
    for (const f of findings) {
      const cat = f.category;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(f);
    }
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [findings]);

  // Top problematic files
  const fileHeatmap = useMemo(() => {
    const fileCounts: Record<string, { total: number; critical: number; high: number }> = {};
    for (const f of findings) {
      const file = f.location?.file || "Unknown";
      if (!fileCounts[file]) fileCounts[file] = { total: 0, critical: 0, high: 0 };
      fileCounts[file].total++;
      if (f.severity === "critical") fileCounts[file].critical++;
      if (f.severity === "high") fileCounts[file].high++;
    }
    return Object.entries(fileCounts)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 20)
      .map(([name, counts]) => ({
        name: name.split("/").pop() || name,
        fullPath: name,
        size: counts.total,
        critical: counts.critical,
        high: counts.high,
      }));
  }, [findings]);

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-100">Code Quality Analysis</h1>
          <p className="text-sm text-gray-500">Static analysis, dead code, memory leaks, anti-patterns, complexity</p>
        </div>
        <KPIGauge score={codeQualityResult.score.rawScore} label="Code Quality" size="sm" showStatus={false} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.06] pb-px">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab.id ? "text-brand-400 border-brand-500" : "text-gray-400 border-transparent hover:text-gray-200",
            )}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <MetricCard label="Lint Errors" value={meta?.lintResults?.errors || 0} icon={Bug} status={(meta?.lintResults?.errors || 0) > 0 ? "bad" : "good"} />
            <MetricCard label="Lint Warnings" value={meta?.lintResults?.warnings || 0} icon={AlertTriangle} status={(meta?.lintResults?.warnings || 0) > 20 ? "warn" : "good"} />
            <MetricCard label="Auto-fixable" value={meta?.lintResults?.fixable || 0} icon={Code2} status="neutral" />
            <MetricCard label="Dead Code" value={meta?.deadCode?.length || 0} icon={Trash2} status={(meta?.deadCode?.length || 0) > 10 ? "warn" : "good"} />
            <MetricCard label="Memory Leaks" value={meta?.memoryLeaks?.length || 0} icon={Timer} status={(meta?.memoryLeaks?.length || 0) > 0 ? "bad" : "good"} />
            <MetricCard
              label="Tech Debt"
              value={meta?.complexity?.technicalDebt || "0d"}
              icon={Brain}
              status="neutral"
            />
          </div>

          {/* Anti-pattern + Complexity summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Anti-patterns" value={meta?.antiPatterns?.length || 0} icon={AlertOctagon} status={(meta?.antiPatterns?.length || 0) > 5 ? "warn" : "good"} />
            <MetricCard label="Async Issues" value={meta?.asyncIssues?.length || 0} icon={Timer} status={(meta?.asyncIssues?.length || 0) > 0 ? "warn" : "good"} />
            <MetricCard label="Avg Complexity" value={meta?.complexity?.avgCyclomaticComplexity?.toFixed(1) || "—"} icon={Brain} status={(meta?.complexity?.avgCyclomaticComplexity || 0) > 10 ? "warn" : "good"} />
            <MetricCard label="Max Complexity" value={meta?.complexity?.maxCyclomaticComplexity || 0} icon={Brain} status={(meta?.complexity?.maxCyclomaticComplexity || 0) > 20 ? "bad" : "good"} />
          </div>

          {/* Category Breakdown Chart */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-200 mb-4">Findings by Category</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={categoryGroups.map(([cat, items]) => ({ name: cat, count: items.length }))} layout="vertical" margin={{ left: 120, right: 20 }}>
                <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.04)" />
                <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
                <Tooltip contentStyle={{ backgroundColor: "#1a1a24", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", fontSize: "12px" }} />
                <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Findings list */}
          <div className="card">
            <div className="px-5 py-4 border-b border-white/[0.06]">
              <h3 className="text-sm font-semibold text-gray-200">All Findings ({findings.length})</h3>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {findings.map((f) => <FindingRow key={f.id} finding={f} />)}
            </div>
          </div>
        </div>
      )}

      {/* ── COMPLEXITY TAB ── */}
      {activeTab === "complexity" && meta?.complexity && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Avg Cyclomatic" value={meta.complexity.avgCyclomaticComplexity.toFixed(1)} icon={Brain} status={meta.complexity.avgCyclomaticComplexity > 10 ? "warn" : "good"} />
            <MetricCard label="Max Cyclomatic" value={meta.complexity.maxCyclomaticComplexity} icon={Brain} status={meta.complexity.maxCyclomaticComplexity > 25 ? "bad" : "good"} />
            <MetricCard label="Avg Cognitive" value={meta.complexity.avgCognitiveComplexity.toFixed(1)} icon={Brain} status={meta.complexity.avgCognitiveComplexity > 15 ? "warn" : "good"} />
            <MetricCard label="Duplicate Blocks" value={meta.complexity.duplicateBlocks} icon={FileCode} status={meta.complexity.duplicateBlocks > 10 ? "warn" : "good"} />
          </div>

          {/* Complexity findings */}
          <div className="card">
            <div className="px-5 py-4 border-b border-white/[0.06]">
              <h3 className="text-sm font-semibold text-gray-200">High Complexity Functions</h3>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {findings.filter((f) => f.category === "Complexity").map((f) => (
                <FindingRow key={f.id} finding={f} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── MEMORY & ASYNC TAB ── */}
      {activeTab === "leaks" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Memory Leaks */}
            <div className="card">
              <div className="px-5 py-4 border-b border-white/[0.06]">
                <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                  <Timer className="w-4 h-4 text-red-400" /> Memory Leak Flags ({meta?.memoryLeaks?.length || 0})
                </h3>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {(meta?.memoryLeaks || []).map((leak, i) => (
                  <div key={i} className="px-5 py-3 border-b border-white/[0.04] last:border-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn("badge text-[10px]", getSeverityBg(leak.severity))}>{leak.severity.toUpperCase()}</span>
                      <span className="text-xs text-gray-400 font-mono">{leak.type}</span>
                    </div>
                    <div className="text-sm text-gray-200">{leak.description}</div>
                    <div className="text-xs text-gray-500 mt-1">{leak.file}:{leak.line}</div>
                  </div>
                ))}
                {(!meta?.memoryLeaks || meta.memoryLeaks.length === 0) && (
                  <div className="p-6 text-center text-gray-500 text-sm">No memory leaks detected</div>
                )}
              </div>
            </div>

            {/* Async Issues */}
            <div className="card">
              <div className="px-5 py-4 border-b border-white/[0.06]">
                <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4 text-amber-400" /> Async Issues ({meta?.asyncIssues?.length || 0})
                </h3>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {(meta?.asyncIssues || []).map((issue, i) => (
                  <div key={i} className="px-5 py-3 border-b border-white/[0.04] last:border-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn("badge text-[10px]", getSeverityBg(issue.severity))}>{issue.severity.toUpperCase()}</span>
                      <span className="text-xs text-gray-400 font-mono">{issue.type}</span>
                    </div>
                    <div className="text-sm text-gray-200">{issue.description}</div>
                    <div className="text-xs text-gray-500 mt-1">{issue.file}:{issue.line}</div>
                  </div>
                ))}
                {(!meta?.asyncIssues || meta.asyncIssues.length === 0) && (
                  <div className="p-6 text-center text-gray-500 text-sm">No async issues detected</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PROBLEMATIC FILES TAB ── */}
      {activeTab === "files" && (
        <div className="space-y-6">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-200 mb-4">Risk Heatmap - Top 20 Files by Finding Count</h3>
            <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-10 gap-2">
              {fileHeatmap.map((file, i) => {
                const maxSize = fileHeatmap[0]?.size || 1;
                const intensity = file.size / maxSize;
                const hasCritical = file.critical > 0;
                const hasHigh = file.high > 0;

                return (
                  <div
                    key={i}
                    className="relative p-2 rounded-lg text-center cursor-default group"
                    style={{
                      backgroundColor: hasCritical
                        ? `rgba(239,68,68,${0.1 + intensity * 0.4})`
                        : hasHigh
                        ? `rgba(249,115,22,${0.1 + intensity * 0.3})`
                        : `rgba(59,130,246,${0.05 + intensity * 0.2})`,
                    }}
                    title={file.fullPath}
                  >
                    <div className="text-[10px] text-gray-300 truncate">{file.name}</div>
                    <div className="text-lg font-bold tabular-nums text-gray-100">{file.size}</div>
                    <div className="text-[9px] text-gray-500">findings</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* File table */}
          <div className="card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Total</th>
                  <th>Critical</th>
                  <th>High</th>
                </tr>
              </thead>
              <tbody>
                {fileHeatmap.map((file, i) => (
                  <tr key={i}>
                    <td className="font-mono text-xs text-gray-200 max-w-[300px] truncate" title={file.fullPath}>{file.fullPath}</td>
                    <td className="text-sm font-bold text-gray-200">{file.size}</td>
                    <td><span className={cn("font-bold", file.critical > 0 ? "text-red-400" : "text-gray-600")}>{file.critical}</span></td>
                    <td><span className={cn("font-bold", file.high > 0 ? "text-orange-400" : "text-gray-600")}>{file.high}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── RAW JSON ── */}
      {activeTab === "raw" && <JsonViewer data={codeQualityResult} defaultExpanded maxHeight={600} />}
    </div>
  );
}
