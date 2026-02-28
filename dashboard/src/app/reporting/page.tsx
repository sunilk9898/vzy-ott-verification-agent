"use client";

import { useState } from "react";
import {
  FileJson, FileText, Download, Share2, Calendar,
  TrendingUp, TrendingDown, ArrowRight, Copy, Check, Link2,
} from "lucide-react";
import { TrendChart } from "@/components/charts/trend-chart";
import { useScanReport } from "@/hooks/use-scan-report";
import { cn, timeAgo, getScoreColor, getSeverityBg } from "@/lib/utils";

export default function ReportingPage() {
  const { report } = useScanReport();
  const [copied, setCopied] = useState(false);

  if (!report) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center text-gray-500 space-y-2">
          <FileText className="w-12 h-12 mx-auto opacity-30" />
          <p className="text-sm">No report data. Run a scan to generate reports.</p>
        </div>
      </div>
    );
  }

  const kpi = report.kpiScore;
  const comparison = report.comparisonWithPrevious;

  // Download JSON
  const handleDownloadJSON = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vzy-scan-${report.scanId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Generate PDF (client-side via print)
  const handleDownloadPDF = () => {
    window.print();
  };

  // Copy share link
  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/reports/${report.scanId}`;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-100">Reporting</h1>
          <p className="text-sm text-gray-500">Download, compare, and share scan reports</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleDownloadJSON} className="btn-secondary text-xs">
            <FileJson className="w-4 h-4" /> Download JSON
          </button>
          <button onClick={handleDownloadPDF} className="btn-secondary text-xs">
            <FileText className="w-4 h-4" /> Download PDF
          </button>
          <button onClick={handleShare} className="btn-primary text-xs">
            {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
            {copied ? "Copied!" : "Share Link"}
          </button>
        </div>
      </div>

      {/* ── Report Summary Card ── */}
      <div className="card p-6 print:shadow-none" id="report-content">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-gray-100">Scan Report</h2>
            <div className="text-xs text-gray-500 mt-1 space-y-0.5">
              <div>Scan ID: {report.scanId}</div>
              <div>Generated: {new Date(report.generatedAt).toLocaleString()}</div>
              <div>Target: {report.target.url || report.target.repoPath}</div>
              <div>Platform: {report.platform}</div>
            </div>
          </div>
          <div className="text-right">
            <div className={cn("text-4xl font-bold tabular-nums", getScoreColor(kpi.overallScore))}>
              {kpi.overallScore}
            </div>
            <div className="text-xs text-gray-500">/ 100 Overall KPI</div>
            <div className={cn(
              "badge mt-2",
              kpi.passesThreshold ? "bg-green-500/15 text-green-400 border-green-500/30" : "bg-red-500/15 text-red-400 border-red-500/30",
            )}>
              {kpi.passesThreshold ? "PASS" : "FAIL"}
            </div>
          </div>
        </div>

        {/* Score Grid */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Security", score: kpi.grades.security.rawScore, weight: "40%" },
            { label: "Performance", score: kpi.grades.performance.rawScore, weight: "35%" },
            { label: "Code Quality", score: kpi.grades.codeQuality.rawScore, weight: "25%" },
          ].map((g) => (
            <div key={g.label} className="p-4 rounded-lg bg-surface-1 text-center">
              <div className="text-xs text-gray-500">{g.label} ({g.weight})</div>
              <div className={cn("text-2xl font-bold mt-1", getScoreColor(g.score))}>{g.score}</div>
            </div>
          ))}
        </div>

        {/* Executive Summary */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-200 mb-2">Executive Summary</h3>
          <p className="text-sm text-gray-400 leading-relaxed">{report.executiveSummary}</p>
        </div>

        {/* Critical Findings Summary */}
        {report.criticalFindings.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-200 mb-3">
              Critical & High Findings ({report.criticalFindings.length})
            </h3>
            <table className="data-table">
              <thead>
                <tr><th>Severity</th><th>Finding</th><th>Category</th><th>Agent</th></tr>
              </thead>
              <tbody>
                {report.criticalFindings.slice(0, 20).map((f) => (
                  <tr key={f.id}>
                    <td><span className={cn("badge text-[10px]", getSeverityBg(f.severity))}>{f.severity.toUpperCase()}</span></td>
                    <td className="text-xs text-gray-200 max-w-[300px] truncate">{f.title}</td>
                    <td className="text-xs text-gray-400">{f.category}</td>
                    <td className="text-xs text-gray-500 capitalize">{f.agent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Recommendations */}
        {report.recommendations.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-200 mb-3">Recommendations</h3>
            <div className="space-y-2">
              {report.recommendations.map((r) => (
                <div key={r.priority} className="flex items-start gap-3 p-3 rounded-lg bg-surface-1">
                  <span className="text-xs font-bold text-brand-400 mt-0.5">#{r.priority}</span>
                  <div>
                    <div className="text-sm text-gray-200">{r.title}</div>
                    <div className="text-xs text-gray-400">{r.description}</div>
                  </div>
                  <span className={cn(
                    "badge text-[10px] ml-auto flex-shrink-0",
                    r.effort === "low" ? "bg-green-500/15 text-green-400 border-green-500/30"
                    : r.effort === "medium" ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                    : "bg-red-500/15 text-red-400 border-red-500/30",
                  )}>
                    {r.effort} effort
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Regression Comparison ── */}
      {comparison && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-gray-200 mb-4">Regression Comparison</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="p-4 rounded-lg bg-surface-1 text-center">
              <div className="text-xs text-gray-500">Score Delta</div>
              <div className={cn(
                "text-2xl font-bold mt-1",
                comparison.scoreDelta > 0 ? "text-green-400" : comparison.scoreDelta < 0 ? "text-red-400" : "text-gray-400",
              )}>
                {comparison.scoreDelta > 0 ? "+" : ""}{comparison.scoreDelta.toFixed(1)}
              </div>
            </div>
            <div className="p-4 rounded-lg bg-surface-1 text-center">
              <div className="text-xs text-gray-500">New Findings</div>
              <div className="text-2xl font-bold text-amber-400 mt-1">{comparison.newFindings.length}</div>
            </div>
            <div className="p-4 rounded-lg bg-surface-1 text-center">
              <div className="text-xs text-gray-500">Resolved</div>
              <div className="text-2xl font-bold text-green-400 mt-1">{comparison.resolvedFindings.length}</div>
            </div>
          </div>

          {comparison.regressions.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-400 mb-2">Regressions</h4>
              <div className="space-y-2">
                {comparison.regressions.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded bg-red-500/[0.04]">
                    <TrendingDown className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span className="text-sm text-gray-300 flex-1">{r.metric}</span>
                    <span className="text-xs text-gray-500 tabular-nums">{r.previousValue} <ArrowRight className="w-3 h-3 inline" /> {r.currentValue}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Weekly Summary Trend ── */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-gray-200 mb-4">Weekly Summary</h3>
        <TrendChart data={kpi.trend.history} height={240} showBreakdown />
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body { background: white !important; color: black !important; }
          .card { border: 1px solid #ddd !important; background: white !important; }
          nav, header, aside, button { display: none !important; }
          main { margin: 0 !important; padding: 20px !important; }
        }
      `}</style>
    </div>
  );
}
