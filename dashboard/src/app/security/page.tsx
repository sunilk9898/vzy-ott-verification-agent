"use client";

import { useState } from "react";
import {
  Shield, Lock, Globe, Key, FileWarning, Package, Fingerprint,
  AlertTriangle, CheckCircle2, XCircle, ChevronDown,
} from "lucide-react";
import { KPIGauge } from "@/components/charts/kpi-gauge";
import { SeverityPie } from "@/components/charts/severity-pie";
import { MetricCard } from "@/components/cards/metric-card";
import { FindingRow } from "@/components/cards/finding-row";
import { JsonViewer } from "@/components/shared/json-viewer";
import { useScanReport } from "@/hooks/use-scan-report";
import { createJiraTicket } from "@/lib/api";
import { cn, getSeverityBg } from "@/lib/utils";
import type { SecurityMetadata, Finding } from "@/types/api";

const OWASP_CATEGORIES = [
  { id: "A01", name: "Broken Access Control", icon: Lock },
  { id: "A02", name: "Cryptographic Failures", icon: Key },
  { id: "A03", name: "Injection", icon: AlertTriangle },
  { id: "A04", name: "Insecure Design", icon: FileWarning },
  { id: "A05", name: "Security Misconfiguration", icon: Shield },
  { id: "A06", name: "Vulnerable Components", icon: Package },
  { id: "A07", name: "Auth Failures", icon: Fingerprint },
  { id: "A08", name: "Data Integrity", icon: CheckCircle2 },
  { id: "A09", name: "Logging Failures", icon: FileWarning },
  { id: "A10", name: "SSRF", icon: Globe },
];

export default function SecurityPage() {
  const { report, securityResult } = useScanReport();
  const [activeTab, setActiveTab] = useState<"overview" | "owasp" | "cve" | "api" | "raw">("overview");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");

  if (!report || !securityResult) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center text-gray-500 space-y-2">
          <Shield className="w-12 h-12 mx-auto opacity-30" />
          <p className="text-sm">No security scan data available. Run a scan from the Overview page.</p>
        </div>
      </div>
    );
  }

  const meta = securityResult.metadata as unknown as SecurityMetadata;
  const findings = securityResult.findings;
  const findingsBySeverity = findings.reduce(
    (acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; },
    {} as Record<string, number>,
  );

  const filteredFindings = filterSeverity === "all"
    ? findings
    : findings.filter((f) => f.severity === filterSeverity);

  const handleCreateJira = async (findingId: string) => {
    try {
      const result = await createJiraTicket(findingId);
      alert(`Jira ticket created: ${result.ticketId}`);
    } catch {
      alert("Failed to create Jira ticket");
    }
  };

  const tabs = [
    { id: "overview" as const, label: "Overview" },
    { id: "owasp" as const, label: "OWASP Grid" },
    { id: "cve" as const, label: "CVE / Dependencies" },
    { id: "api" as const, label: "API Exposure" },
    { id: "raw" as const, label: "Raw JSON" },
  ];

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-100">Security Analysis</h1>
          <p className="text-sm text-gray-500">OWASP Top 10, API exposure, DRM, tokens, dependencies</p>
        </div>
        <KPIGauge score={securityResult.score.rawScore} label="Security" size="sm" showStatus={false} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.06] pb-px">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab.id
                ? "text-brand-400 border-brand-500"
                : "text-gray-400 border-transparent hover:text-gray-200",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Metric Cards Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <MetricCard
              label="SSL Grade"
              value={meta?.sslAnalysis?.grade || "N/A"}
              icon={Lock}
              status={meta?.sslAnalysis?.grade === "A+" ? "good" : "warn"}
            />
            <MetricCard
              label="Headers Score"
              value={`${meta?.headerAnalysis?.score || 0}%`}
              icon={Shield}
              status={(meta?.headerAnalysis?.score || 0) >= 80 ? "good" : "warn"}
            />
            <MetricCard
              label="Missing Headers"
              value={meta?.headerAnalysis?.missing?.length || 0}
              icon={AlertTriangle}
              status={(meta?.headerAnalysis?.missing?.length || 0) === 0 ? "good" : "bad"}
            />
            <MetricCard
              label="CORS Issues"
              value={meta?.corsAnalysis?.issues?.length || 0}
              icon={Globe}
              status={(meta?.corsAnalysis?.issues?.length || 0) === 0 ? "good" : "warn"}
            />
            <MetricCard
              label="Token Leaks"
              value={meta?.tokenLeaks?.length || 0}
              icon={Key}
              status={(meta?.tokenLeaks?.length || 0) === 0 ? "good" : "bad"}
            />
            <MetricCard
              label="Dep. Vulns"
              value={meta?.dependencyVulns?.length || 0}
              icon={Package}
              status={(meta?.dependencyVulns?.length || 0) === 0 ? "good" : "bad"}
            />
          </div>

          {/* DRM Status (OTT-specific) */}
          {meta?.drmAnalysis && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-gray-200 mb-3">DRM Protection Status</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <DrmIndicator label="Widevine" active={meta.drmAnalysis.widevineDetected} />
                <DrmIndicator label="FairPlay" active={meta.drmAnalysis.fairplayDetected} />
                <DrmIndicator label="Key Rotation" active={meta.drmAnalysis.keyRotation} />
                <DrmIndicator label="License URL Safe" active={!meta.drmAnalysis.licenseUrlExposed} isInverse />
              </div>
              {meta.drmAnalysis.issues.length > 0 && (
                <div className="mt-3 space-y-1">
                  {meta.drmAnalysis.issues.map((issue, i) => (
                    <div key={i} className="text-xs text-red-400 flex items-center gap-2">
                      <XCircle className="w-3 h-3" /> {issue}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Findings with severity filter + Severity Pie */}
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 lg:col-span-8">
              <div className="card">
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                  <h3 className="text-sm font-semibold text-gray-200">
                    Findings ({filteredFindings.length})
                  </h3>
                  <select
                    value={filterSeverity}
                    onChange={(e) => setFilterSeverity(e.target.value)}
                    className="input w-32 text-xs py-1.5"
                  >
                    <option value="all">All Severities</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div className="max-h-[500px] overflow-y-auto">
                  {filteredFindings.map((f) => (
                    <FindingRow key={f.id} finding={f} onCreateJira={handleCreateJira} />
                  ))}
                </div>
              </div>
            </div>
            <div className="col-span-12 lg:col-span-4">
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-gray-200 mb-2">Severity Distribution</h3>
                <SeverityPie data={findingsBySeverity} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── OWASP GRID TAB ── */}
      {activeTab === "owasp" && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {OWASP_CATEGORIES.map((cat) => {
            const owaspFindings = findings.filter((f) => f.category.includes(cat.id));
            const hasIssues = owaspFindings.length > 0;
            const worstSeverity = owaspFindings.length > 0
              ? owaspFindings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity))[0].severity
              : null;
            const Icon = cat.icon;

            return (
              <div
                key={cat.id}
                className={cn(
                  "card p-4 space-y-2",
                  hasIssues ? "border-red-500/20" : "border-green-500/10",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-400">{cat.id}</span>
                  {hasIssues ? (
                    <span className={cn("badge text-[10px]", getSeverityBg(worstSeverity!))}>
                      {owaspFindings.length}
                    </span>
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-green-500/60" />
                  )}
                </div>
                <Icon className={cn("w-6 h-6", hasIssues ? "text-red-400/60" : "text-green-400/40")} />
                <div className="text-xs font-medium text-gray-300">{cat.name}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── CVE TAB ── */}
      {activeTab === "cve" && (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Package</th>
                <th>Version</th>
                <th>Severity</th>
                <th>CVE</th>
                <th>Vulnerability</th>
                <th>Fix Version</th>
              </tr>
            </thead>
            <tbody>
              {(meta?.dependencyVulns || []).length === 0 ? (
                <tr><td colSpan={6} className="text-center text-gray-500 py-8">No dependency vulnerabilities found</td></tr>
              ) : (
                meta.dependencyVulns.map((v, i) => (
                  <tr key={i}>
                    <td className="font-mono text-xs text-gray-200">{v.package}</td>
                    <td className="font-mono text-xs text-gray-400">{v.version}</td>
                    <td><span className={cn("badge text-[10px]", getSeverityBg(v.severity))}>{v.severity.toUpperCase()}</span></td>
                    <td className="text-xs text-brand-400">{v.cveId}</td>
                    <td className="text-xs text-gray-300 max-w-[200px] truncate">{v.vulnerability}</td>
                    <td className="text-xs text-green-400">{v.fixVersion || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── API EXPOSURE TAB ── */}
      {activeTab === "api" && (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Method</th>
                <th>Endpoint</th>
                <th>Auth</th>
                <th>Sensitive Data</th>
                <th>Rate Limit</th>
                <th>Issues</th>
              </tr>
            </thead>
            <tbody>
              {(meta?.apiExposure || []).length === 0 ? (
                <tr><td colSpan={6} className="text-center text-gray-500 py-8">No API exposures detected</td></tr>
              ) : (
                meta.apiExposure.map((api, i) => (
                  <tr key={i}>
                    <td><span className="badge bg-blue-500/15 text-blue-400 border-blue-500/30 text-[10px]">{api.method}</span></td>
                    <td className="font-mono text-xs text-gray-200 max-w-[250px] truncate">{api.endpoint}</td>
                    <td>{api.authenticated ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}</td>
                    <td>{api.sensitiveData ? <AlertTriangle className="w-4 h-4 text-amber-400" /> : <span className="text-gray-500 text-xs">No</span>}</td>
                    <td>{api.rateLimit ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}</td>
                    <td className="text-xs text-gray-400">{api.issues.length > 0 ? api.issues.join(", ") : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── RAW JSON TAB ── */}
      {activeTab === "raw" && (
        <JsonViewer data={securityResult} defaultExpanded maxHeight={600} />
      )}
    </div>
  );
}

// ── Helper Components ──
function DrmIndicator({ label, active, isInverse }: { label: string; active: boolean; isInverse?: boolean }) {
  const ok = isInverse ? active : active;
  return (
    <div className={cn("flex items-center gap-2 p-3 rounded-lg", ok ? "bg-green-500/[0.06]" : "bg-red-500/[0.06]")}>
      {ok ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
      <span className={cn("text-sm", ok ? "text-green-400" : "text-red-400")}>{label}</span>
    </div>
  );
}

function severityRank(s: string): number {
  return { critical: 1, high: 2, medium: 3, low: 4, info: 5 }[s] || 5;
}
