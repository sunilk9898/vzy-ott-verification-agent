"use client";

import { useState } from "react";
import {
  Shield, Lock, Globe, Key, FileWarning, Package, Fingerprint,
  AlertTriangle, CheckCircle2, XCircle, ChevronDown, X, ExternalLink,
  ChevronRight, Info,
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
  { id: "A01", name: "Broken Access Control", icon: Lock, description: "Failures in access control enforcement that allow users to act outside their intended permissions." },
  { id: "A02", name: "Cryptographic Failures", icon: Key, description: "Failures related to cryptography that often lead to sensitive data exposure." },
  { id: "A03", name: "Injection", icon: AlertTriangle, description: "User-supplied data sent to an interpreter as part of a command or query (SQL, NoSQL, OS, LDAP)." },
  { id: "A04", name: "Insecure Design", icon: FileWarning, description: "Risks related to design and architectural flaws, calling for more use of threat modeling and secure design patterns." },
  { id: "A05", name: "Security Misconfiguration", icon: Shield, description: "Missing or incorrect security hardening across any part of the application stack." },
  { id: "A06", name: "Vulnerable Components", icon: Package, description: "Using components with known vulnerabilities that may undermine application defenses." },
  { id: "A07", name: "Auth Failures", icon: Fingerprint, description: "Confirmation of user identity, authentication, and session management weaknesses." },
  { id: "A08", name: "Data Integrity", icon: CheckCircle2, description: "Software and data integrity failures related to code and infrastructure that does not protect against integrity violations." },
  { id: "A09", name: "Logging Failures", icon: FileWarning, description: "Insufficient logging, detection, monitoring, and active response." },
  { id: "A10", name: "SSRF", icon: Globe, description: "Server-Side Request Forgery flaws occur when a web application fetches a remote resource without validating the user-supplied URL." },
];

// Detail drawer panel types
type DetailType = "ssl" | "headers" | "missing-headers" | "cors" | "tokens" | "deps" | "drm" | null;
type OwaspDetailId = string | null; // e.g., "A01", "A02", etc.

export default function SecurityPage() {
  const { report, securityResult } = useScanReport();
  const [activeTab, setActiveTab] = useState<"overview" | "owasp" | "cve" | "api" | "raw">("overview");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [activeDetail, setActiveDetail] = useState<DetailType>(null);
  const [activeOwasp, setActiveOwasp] = useState<OwaspDetailId>(null);

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

  const closeDrawer = () => { setActiveDetail(null); setActiveOwasp(null); };

  const tabs = [
    { id: "overview" as const, label: "Overview" },
    { id: "owasp" as const, label: "OWASP Grid" },
    { id: "cve" as const, label: "CVE / Dependencies" },
    { id: "api" as const, label: "API Exposure" },
    { id: "raw" as const, label: "Raw JSON" },
  ];

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto relative">
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
          {/* Metric Cards Row — ALL CLICKABLE */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <MetricCard
              label="SSL Grade"
              value={meta?.sslAnalysis?.grade || "N/A"}
              icon={Lock}
              status={meta?.sslAnalysis?.grade === "A+" ? "good" : "warn"}
              onClick={() => setActiveDetail("ssl")}
            />
            <MetricCard
              label="Headers Score"
              value={`${meta?.headerAnalysis?.score || 0}%`}
              icon={Shield}
              status={(meta?.headerAnalysis?.score || 0) >= 80 ? "good" : "warn"}
              onClick={() => setActiveDetail("headers")}
            />
            <MetricCard
              label="Missing Headers"
              value={meta?.headerAnalysis?.missing?.length || 0}
              icon={AlertTriangle}
              status={(meta?.headerAnalysis?.missing?.length || 0) === 0 ? "good" : "bad"}
              onClick={() => setActiveDetail("missing-headers")}
            />
            <MetricCard
              label="CORS Issues"
              value={meta?.corsAnalysis?.issues?.length || 0}
              icon={Globe}
              status={(meta?.corsAnalysis?.issues?.length || 0) === 0 ? "good" : "warn"}
              onClick={() => setActiveDetail("cors")}
            />
            <MetricCard
              label="Token Leaks"
              value={meta?.tokenLeaks?.length || 0}
              icon={Key}
              status={(meta?.tokenLeaks?.length || 0) === 0 ? "good" : "bad"}
              onClick={() => setActiveDetail("tokens")}
            />
            <MetricCard
              label="Dep. Vulns"
              value={meta?.dependencyVulns?.length || 0}
              icon={Package}
              status={(meta?.dependencyVulns?.length || 0) === 0 ? "good" : "bad"}
              onClick={() => setActiveDetail("deps")}
            />
          </div>

          {/* DRM Status (OTT-specific) — Clickable */}
          {meta?.drmAnalysis && (
            <button
              onClick={() => setActiveDetail("drm")}
              className="card p-5 w-full text-left cursor-pointer hover:bg-white/[0.04] hover:border-brand-500/30 transition-all group"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-200">DRM Protection Status</h3>
                <div className="flex items-center gap-1 text-[10px] text-gray-600 group-hover:text-brand-400 transition-colors">
                  View details <ChevronRight className="w-3 h-3" />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <DrmIndicator label="Widevine" active={meta.drmAnalysis.widevineDetected} />
                <DrmIndicator label="FairPlay" active={meta.drmAnalysis.fairplayDetected} />
                <DrmIndicator label="Key Rotation" active={meta.drmAnalysis.keyRotation} />
                <DrmIndicator label="License URL Safe" active={!meta.drmAnalysis.licenseUrlExposed} isInverse />
              </div>
              {meta.drmAnalysis.issues.length > 0 && (
                <div className="mt-3 space-y-1">
                  {meta.drmAnalysis.issues.slice(0, 2).map((issue, i) => (
                    <div key={i} className="text-xs text-red-400 flex items-center gap-2">
                      <XCircle className="w-3 h-3" /> {issue}
                    </div>
                  ))}
                  {meta.drmAnalysis.issues.length > 2 && (
                    <div className="text-[10px] text-gray-500">+{meta.drmAnalysis.issues.length - 2} more issues</div>
                  )}
                </div>
              )}
            </button>
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

      {/* ── OWASP GRID TAB — ALL CLICKABLE ── */}
      {activeTab === "owasp" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {OWASP_CATEGORIES.map((cat) => {
              const owaspFindings = findings.filter((f) => f.category.includes(cat.id));
              const hasIssues = owaspFindings.length > 0;
              const worstSeverity = owaspFindings.length > 0
                ? owaspFindings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity))[0].severity
                : null;
              const Icon = cat.icon;
              const isActive = activeOwasp === cat.id;

              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveOwasp(isActive ? null : cat.id)}
                  className={cn(
                    "card p-4 space-y-2 text-left w-full cursor-pointer transition-all group",
                    hasIssues ? "border-red-500/20 hover:border-red-500/40" : "border-green-500/10 hover:border-green-500/30",
                    isActive && "ring-2 ring-brand-500/50 border-brand-500/30",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-400">{cat.id}</span>
                    <div className="flex items-center gap-1">
                      {hasIssues ? (
                        <span className={cn("badge text-[10px]", getSeverityBg(worstSeverity!))}>
                          {owaspFindings.length}
                        </span>
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-green-500/60" />
                      )}
                      <ChevronRight className={cn(
                        "w-3 h-3 text-gray-600 group-hover:text-brand-400 transition-all",
                        isActive && "rotate-90 text-brand-400",
                      )} />
                    </div>
                  </div>
                  <Icon className={cn("w-6 h-6", hasIssues ? "text-red-400/60" : "text-green-400/40")} />
                  <div className="text-xs font-medium text-gray-300">{cat.name}</div>
                  <div className="text-[10px] text-gray-600 group-hover:text-gray-400 transition-colors">Click for details</div>
                </button>
              );
            })}
          </div>

          {/* OWASP Detail Panel — inline expand below grid */}
          {activeOwasp && (
            <OwaspDetailPanel
              category={OWASP_CATEGORIES.find((c) => c.id === activeOwasp)!}
              findings={findings.filter((f) => f.category.includes(activeOwasp))}
              owaspMeta={meta?.owaspFindings?.filter((o) => o.category.includes(activeOwasp)) || []}
              onClose={() => setActiveOwasp(null)}
              onCreateJira={handleCreateJira}
            />
          )}
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
                    <td className="text-xs text-green-400">{v.fixVersion || "\u2014"}</td>
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
                    <td className="text-xs text-gray-400">{api.issues.length > 0 ? api.issues.join(", ") : "\u2014"}</td>
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

      {/* ── DETAIL DRAWER (slide-over from right) ── */}
      {activeDetail && (
        <DetailDrawer meta={meta} detailType={activeDetail} onClose={closeDrawer} findings={findings} />
      )}
    </div>
  );
}

// ============================================================================
// Detail Drawer — Slide-over panel with full detail info
// ============================================================================
function DetailDrawer({
  meta,
  detailType,
  onClose,
  findings,
}: {
  meta: SecurityMetadata;
  detailType: DetailType;
  onClose: () => void;
  findings: Finding[];
}) {
  if (!detailType) return null;

  const titles: Record<string, string> = {
    ssl: "SSL / TLS Analysis",
    headers: "Security Headers Analysis",
    "missing-headers": "Missing Security Headers",
    cors: "CORS Configuration",
    tokens: "Token Leak Detection",
    deps: "Dependency Vulnerabilities",
    drm: "DRM Protection Details",
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-surface-0 border-l border-white/[0.06] z-50 flex flex-col animate-slide-in-right overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
          <h2 className="text-sm font-bold text-gray-100">{titles[detailType]}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-400 hover:text-gray-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {detailType === "ssl" && <SSLDetail data={meta?.sslAnalysis} />}
          {detailType === "headers" && <HeadersDetail data={meta?.headerAnalysis} />}
          {detailType === "missing-headers" && <MissingHeadersDetail data={meta?.headerAnalysis} />}
          {detailType === "cors" && <CORSDetail data={meta?.corsAnalysis} />}
          {detailType === "tokens" && <TokenLeaksDetail data={meta?.tokenLeaks} />}
          {detailType === "deps" && <DepsDetail data={meta?.dependencyVulns} />}
          {detailType === "drm" && <DRMDetail data={meta?.drmAnalysis} findings={findings} />}
        </div>
      </div>
    </>
  );
}

// ── SSL Detail ──
function SSLDetail({ data }: { data: SecurityMetadata["sslAnalysis"] }) {
  if (!data) return <EmptyState label="No SSL analysis data" />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <InfoBox label="SSL Grade" value={data.grade} highlight={data.grade === "A+" || data.grade === "A"} />
        <InfoBox label="Protocol" value={data.protocol} />
        <InfoBox label="Certificate Expiry" value={data.certExpiry || "Unknown"} />
        <InfoBox label="HSTS Enabled" value={data.hsts ? "Yes" : "No"} highlight={data.hsts} bad={!data.hsts} />
      </div>
      {data.issues.length > 0 && (
        <div>
          <SectionLabel label="Issues Found" count={data.issues.length} />
          <div className="space-y-2 mt-2">
            {data.issues.map((issue, i) => (
              <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-red-500/[0.06] border border-red-500/10">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                <span className="text-xs text-red-300">{issue}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.issues.length === 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/[0.06] border border-green-500/10">
          <CheckCircle2 className="w-4 h-4 text-green-400" />
          <span className="text-xs text-green-300">No SSL issues detected</span>
        </div>
      )}
    </div>
  );
}

// ── Headers Detail ──
function HeadersDetail({ data }: { data: SecurityMetadata["headerAnalysis"] }) {
  if (!data) return <EmptyState label="No headers analysis data" />;
  return (
    <div className="space-y-4">
      <InfoBox label="Overall Headers Score" value={`${data.score}%`} highlight={data.score >= 80} bad={data.score < 50} />

      {data.present.length > 0 && (
        <div>
          <SectionLabel label="Present Headers" count={data.present.length} />
          <div className="mt-2 flex flex-wrap gap-2">
            {data.present.map((h, i) => (
              <span key={i} className="px-2.5 py-1 rounded-md bg-green-500/[0.08] border border-green-500/15 text-[11px] text-green-400 font-mono">{h}</span>
            ))}
          </div>
        </div>
      )}

      {data.missing.length > 0 && (
        <div>
          <SectionLabel label="Missing Headers" count={data.missing.length} />
          <div className="mt-2 flex flex-wrap gap-2">
            {data.missing.map((h, i) => (
              <span key={i} className="px-2.5 py-1 rounded-md bg-red-500/[0.08] border border-red-500/15 text-[11px] text-red-400 font-mono">{h}</span>
            ))}
          </div>
        </div>
      )}

      {data.misconfigured.length > 0 && (
        <div>
          <SectionLabel label="Misconfigured Headers" count={data.misconfigured.length} />
          <div className="space-y-2 mt-2">
            {data.misconfigured.map((h, i) => (
              <div key={i} className="p-3 rounded-lg bg-amber-500/[0.06] border border-amber-500/10">
                <div className="text-xs font-mono text-amber-300 font-semibold">{h.header}</div>
                <div className="text-[11px] text-amber-200/70 mt-1">{h.issue}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Missing Headers Detail ──
function MissingHeadersDetail({ data }: { data: SecurityMetadata["headerAnalysis"] }) {
  if (!data) return <EmptyState label="No headers analysis data" />;
  const missing = data.missing || [];

  const headerDescriptions: Record<string, string> = {
    "Strict-Transport-Security": "Enforces HTTPS connections, prevents protocol downgrade attacks and cookie hijacking.",
    "Content-Security-Policy": "Prevents XSS, clickjacking, and other code injection attacks by specifying allowed content sources.",
    "X-Content-Type-Options": "Prevents browsers from MIME-sniffing a response away from the declared content-type.",
    "X-Frame-Options": "Prevents clickjacking by controlling whether the page can be embedded in iframes.",
    "X-XSS-Protection": "Enables browser's built-in XSS filter to stop reflected XSS attacks.",
    "Referrer-Policy": "Controls how much referrer information is included with requests.",
    "Permissions-Policy": "Controls which browser features and APIs can be used in the page.",
    "X-Download-Options": "Prevents IE from executing downloads in the site's context.",
    "X-Permitted-Cross-Domain-Policies": "Controls Adobe Flash and PDF cross-domain data loading.",
    "Cross-Origin-Opener-Policy": "Isolates the browsing context to prevent cross-origin attacks.",
    "Cross-Origin-Resource-Policy": "Prevents other origins from reading the response.",
    "Cross-Origin-Embedder-Policy": "Controls embedding of cross-origin resources.",
  };

  if (missing.length === 0) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-lg bg-green-500/[0.06] border border-green-500/10">
        <CheckCircle2 className="w-5 h-5 text-green-400" />
        <span className="text-sm text-green-300">All critical security headers are present</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">
        The following security headers are missing and should be configured to improve your security posture.
      </p>
      {missing.map((h, i) => (
        <div key={i} className="p-4 rounded-lg bg-red-500/[0.04] border border-red-500/10">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="text-sm font-mono text-red-300 font-semibold">{h}</span>
          </div>
          {headerDescriptions[h] && (
            <p className="text-[11px] text-gray-400 mt-2 ml-6">{headerDescriptions[h]}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── CORS Detail ──
function CORSDetail({ data }: { data: SecurityMetadata["corsAnalysis"] }) {
  if (!data) return <EmptyState label="No CORS analysis data" />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <InfoBox label="Allow-Origin" value={data.allowOrigin || "Not Set"} bad={data.wildcardDetected} />
        <InfoBox label="Allow-Credentials" value={data.allowCredentials ? "Yes" : "No"} bad={data.allowCredentials && data.wildcardDetected} />
        <InfoBox label="Wildcard (*)" value={data.wildcardDetected ? "Detected" : "No"} highlight={!data.wildcardDetected} bad={data.wildcardDetected} />
      </div>

      {data.wildcardDetected && (
        <div className="p-3 rounded-lg bg-red-500/[0.06] border border-red-500/10 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <div className="text-xs text-red-300">
            Wildcard CORS origin (*) allows any website to make cross-origin requests to this domain.
            {data.allowCredentials && " Combined with Allow-Credentials, this is a critical security risk."}
          </div>
        </div>
      )}

      {data.issues.length > 0 && (
        <div>
          <SectionLabel label="CORS Issues" count={data.issues.length} />
          <div className="space-y-2 mt-2">
            {data.issues.map((issue, i) => (
              <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/[0.06] border border-amber-500/10">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                <span className="text-xs text-amber-300">{issue}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.issues.length === 0 && !data.wildcardDetected && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/[0.06] border border-green-500/10">
          <CheckCircle2 className="w-4 h-4 text-green-400" />
          <span className="text-xs text-green-300">CORS configuration looks secure</span>
        </div>
      )}
    </div>
  );
}

// ── Token Leaks Detail ──
function TokenLeaksDetail({ data }: { data: SecurityMetadata["tokenLeaks"] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-lg bg-green-500/[0.06] border border-green-500/10">
        <CheckCircle2 className="w-5 h-5 text-green-400" />
        <span className="text-sm text-green-300">No token leaks detected</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">
        Exposed tokens or secrets found in the application. These should be rotated immediately.
      </p>
      {data.map((leak, i) => (
        <div key={i} className="p-4 rounded-lg bg-red-500/[0.04] border border-red-500/10 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-red-400" />
              <span className="text-xs font-semibold text-gray-200 uppercase">{leak.type.replace(/_/g, " ")}</span>
            </div>
            <span className={cn("badge text-[10px]", getSeverityBg(leak.severity))}>{leak.severity.toUpperCase()}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div><span className="text-gray-500">Location:</span> <span className="text-gray-300 font-mono">{leak.location}</span></div>
            <div><span className="text-gray-500">Partial:</span> <span className="text-red-300 font-mono">{leak.partial}</span></div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Dependencies Detail ──
function DepsDetail({ data }: { data: SecurityMetadata["dependencyVulns"] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-lg bg-green-500/[0.06] border border-green-500/10">
        <CheckCircle2 className="w-5 h-5 text-green-400" />
        <span className="text-sm text-green-300">No dependency vulnerabilities found</span>
      </div>
    );
  }

  const bySeverity = data.reduce((acc, v) => { acc[v.severity] = (acc[v.severity] || 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(bySeverity).sort((a, b) => severityRank(a[0]) - severityRank(b[0])).map(([sev, count]) => (
          <span key={sev} className={cn("badge text-[10px] px-3 py-1", getSeverityBg(sev as any))}>
            {count} {sev}
          </span>
        ))}
      </div>

      {/* Vulnerability list */}
      {data.map((v, i) => (
        <div key={i} className="p-4 rounded-lg bg-surface-1 border border-white/[0.04] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-mono text-gray-200 font-semibold">{v.package}@{v.version}</span>
            </div>
            <span className={cn("badge text-[10px]", getSeverityBg(v.severity))}>{v.severity.toUpperCase()}</span>
          </div>
          <div className="text-[11px] text-gray-300">{v.vulnerability}</div>
          <div className="flex items-center gap-4 text-[11px]">
            <span className="text-brand-400 font-mono">{v.cveId}</span>
            {v.fixVersion && (
              <span className="text-green-400">Fix: <span className="font-mono">{v.fixVersion}</span></span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── DRM Detail ──
function DRMDetail({ data, findings }: { data: SecurityMetadata["drmAnalysis"]; findings: Finding[] }) {
  if (!data) return <EmptyState label="No DRM analysis data" />;

  const drmFindings = findings.filter((f) =>
    f.title.toLowerCase().includes("drm") ||
    f.category.toLowerCase().includes("drm") ||
    f.description.toLowerCase().includes("drm") ||
    f.description.toLowerCase().includes("widevine") ||
    f.description.toLowerCase().includes("fairplay")
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <InfoBox label="Widevine" value={data.widevineDetected ? "Detected" : "Not Found"} highlight={data.widevineDetected} bad={!data.widevineDetected} />
        <InfoBox label="FairPlay" value={data.fairplayDetected ? "Detected" : "Not Found"} highlight={data.fairplayDetected} />
        <InfoBox label="Key Rotation" value={data.keyRotation ? "Enabled" : "Disabled"} highlight={data.keyRotation} bad={!data.keyRotation} />
        <InfoBox label="License URL" value={data.licenseUrlExposed ? "Exposed" : "Protected"} highlight={!data.licenseUrlExposed} bad={data.licenseUrlExposed} />
      </div>

      {data.issues.length > 0 && (
        <div>
          <SectionLabel label="DRM Issues" count={data.issues.length} />
          <div className="space-y-2 mt-2">
            {data.issues.map((issue, i) => (
              <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-red-500/[0.06] border border-red-500/10">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                <span className="text-xs text-red-300">{issue}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {drmFindings.length > 0 && (
        <div>
          <SectionLabel label="Related Findings" count={drmFindings.length} />
          <div className="space-y-2 mt-2">
            {drmFindings.map((f) => (
              <div key={f.id} className="p-3 rounded-lg bg-surface-1 border border-white/[0.04]">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn("badge text-[10px]", getSeverityBg(f.severity))}>{f.severity.toUpperCase()}</span>
                  <span className="text-xs text-gray-200 font-medium">{f.title}</span>
                </div>
                <div className="text-[11px] text-gray-400">{f.description}</div>
                {f.remediation && (
                  <div className="text-[11px] text-green-400/70 mt-2">
                    <span className="text-gray-500">Fix: </span>{f.remediation}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {data.issues.length === 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/[0.06] border border-green-500/10">
          <CheckCircle2 className="w-4 h-4 text-green-400" />
          <span className="text-xs text-green-300">DRM configuration looks secure</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// OWASP Detail Panel — Expanded inline panel for OWASP categories
// ============================================================================
function OwaspDetailPanel({
  category,
  findings,
  owaspMeta,
  onClose,
  onCreateJira,
}: {
  category: typeof OWASP_CATEGORIES[number];
  findings: Finding[];
  owaspMeta: SecurityMetadata["owaspFindings"];
  onClose: () => void;
  onCreateJira: (id: string) => void;
}) {
  const Icon = category.icon;
  const hasIssues = findings.length > 0;

  return (
    <div className={cn(
      "card overflow-hidden animate-fade-up",
      hasIssues ? "border-red-500/20" : "border-green-500/15",
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-surface-1">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg", hasIssues ? "bg-red-500/10" : "bg-green-500/10")}>
            <Icon className={cn("w-5 h-5", hasIssues ? "text-red-400" : "text-green-400")} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-100">
              {category.id}: {category.name}
            </h3>
            <p className="text-[11px] text-gray-500 mt-0.5 max-w-lg">{category.description}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-400 hover:text-gray-200 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="px-6 py-5">
        {!hasIssues && owaspMeta.length === 0 ? (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/[0.06] border border-green-500/10">
            <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
            <div>
              <div className="text-sm text-green-300 font-medium">No issues found</div>
              <div className="text-[11px] text-green-400/60 mt-0.5">This OWASP category passed all checks</div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* OWASP metadata entries (from agent populateMetadata) */}
            {owaspMeta.length > 0 && (
              <div className="space-y-2">
                {owaspMeta.map((entry, i) => (
                  <div key={i} className="p-4 rounded-lg bg-surface-1 border border-white/[0.04]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-200">{entry.name}</span>
                      <span className={cn("badge text-[10px]", getSeverityBg(entry.risk))}>{entry.risk.toUpperCase()}</span>
                    </div>
                    <p className="text-[11px] text-gray-400">{entry.details}</p>
                    {entry.affected.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {entry.affected.map((a, j) => (
                          <span key={j} className="px-2 py-0.5 rounded bg-white/[0.04] text-[10px] text-gray-500 font-mono">{a}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Matching findings */}
            {findings.length > 0 && (
              <div>
                <SectionLabel label="Scan Findings" count={findings.length} />
                <div className="mt-2 max-h-[400px] overflow-y-auto rounded-lg border border-white/[0.04]">
                  {findings.map((f) => (
                    <FindingRow key={f.id} finding={f} onCreateJira={onCreateJira} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Shared Helper Components
// ============================================================================
function DrmIndicator({ label, active, isInverse }: { label: string; active: boolean; isInverse?: boolean }) {
  const ok = isInverse ? active : active;
  return (
    <div className={cn("flex items-center gap-2 p-3 rounded-lg", ok ? "bg-green-500/[0.06]" : "bg-red-500/[0.06]")}>
      {ok ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
      <span className={cn("text-sm", ok ? "text-green-400" : "text-red-400")}>{label}</span>
    </div>
  );
}

function InfoBox({ label, value, highlight, bad }: { label: string; value: string; highlight?: boolean; bad?: boolean }) {
  return (
    <div className="p-3 rounded-lg bg-surface-1 border border-white/[0.04]">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
      <div className={cn(
        "text-sm font-bold mt-1",
        bad ? "text-red-400" : highlight ? "text-green-400" : "text-gray-200",
      )}>
        {value}
      </div>
    </div>
  );
}

function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-gray-300">{label}</span>
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-gray-500">{count}</span>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-lg bg-white/[0.02] border border-white/[0.04]">
      <Info className="w-4 h-4 text-gray-500" />
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}

function severityRank(s: string): number {
  return { critical: 1, high: 2, medium: 3, low: 4, info: 5 }[s] || 5;
}
