// ============================================================================
// Demo Data - Sample scan results for GitHub Pages standalone mode
// Uses 'as any' liberally since this is demo data, not production code.
// ============================================================================

import type { ScanReport } from "@/types/api";

const now = new Date().toISOString();

function mkFinding(id: string, title: string, severity: string, category: string, agent: string, desc: string) {
  return {
    id, title, description: desc, severity, category, agent,
    location: { url: "https://www.watcho.com" },
    remediation: `Fix: ${title}`,
    autoFixable: false,
    references: [],
  } as any;
}

function mkBreakdown(metric: string, value: number, maxScore: number, details: string) {
  return { metric, value, maxScore, actualScore: value, penalty: maxScore - value, details } as any;
}

const secFindings = [
  mkFinding("s1", "Missing Content-Security-Policy header", "high", "headers", "security", "CSP header not set — XSS risk."),
  mkFinding("s2", "Missing X-Frame-Options header", "medium", "headers", "security", "Page can be embedded in iframes."),
  mkFinding("s3", "HSTS max-age below 1 year", "medium", "headers", "security", "Strict-Transport-Security too short."),
  mkFinding("s4", "Outdated lodash@4.17.15", "high", "dependencies", "security", "Prototype pollution CVE-2020-8203."),
  mkFinding("s5", "CORS wildcard origin", "medium", "cors", "security", "Access-Control-Allow-Origin: *."),
  mkFinding("s6", "SSL cert expires in 45 days", "low", "ssl", "security", "Renew certificate proactively."),
];

const perfFindings = [
  mkFinding("p1", "LCP is 3.8s (target <2.5s)", "high", "core-web-vitals", "performance", "Largest Contentful Paint too slow."),
  mkFinding("p2", "CLS is 0.18 (target <0.1)", "medium", "core-web-vitals", "performance", "Layout shift too high."),
  mkFinding("p3", "TBT is 450ms (target <200ms)", "medium", "core-web-vitals", "performance", "Total Blocking Time too high."),
  mkFinding("p4", "Render-blocking CSS", "medium", "resources", "performance", "3 CSS files block render."),
  mkFinding("p5", "Images not lazy loaded", "low", "images", "performance", "Below-fold images load eagerly."),
];

const cqFindings = [
  mkFinding("c1", "Console.log in production", "medium", "code-smell", "code-quality", "12 debug logs found in bundles."),
  mkFinding("c2", "35% unused CSS rules", "low", "code-smell", "code-quality", "Dead CSS inflates page weight."),
  mkFinding("c3", "Missing error boundaries", "medium", "best-practices", "code-quality", "No React error boundaries."),
  mkFinding("c4", "Bundle size 780KB", "low", "bundle", "code-quality", "JS bundle exceeds 500KB."),
];

const secScore = {
  category: "security", rawScore: 72, weight: 0.4, weightedScore: 28.8,
  breakdown: [
    mkBreakdown("SSL/TLS Configuration", 85, 100, "Grade B+ — HSTS needs improvement"),
    mkBreakdown("Security Headers", 55, 100, "Missing CSP, Permissions-Policy"),
    mkBreakdown("CORS Policy", 60, 100, "Wildcard origin detected"),
    mkBreakdown("Dependency Vulnerabilities", 65, 100, "2 known CVEs"),
    mkBreakdown("DRM/Content Protection", 90, 100, "Widevine + FairPlay active"),
    mkBreakdown("Token/Key Exposure", 95, 100, "No leaks detected"),
    mkBreakdown("OWASP Compliance", 70, 100, "A06 flagged"),
  ],
} as any;

const perfScore = {
  category: "performance", rawScore: 78, weight: 0.35, weightedScore: 27.3,
  breakdown: [
    mkBreakdown("Lighthouse Score", 74, 100, "Overall perf score"),
    mkBreakdown("Largest Contentful Paint", 65, 100, "LCP: 3.8s"),
    mkBreakdown("Cumulative Layout Shift", 72, 100, "CLS: 0.18"),
    mkBreakdown("Total Blocking Time", 70, 100, "TBT: 450ms"),
    mkBreakdown("First Contentful Paint", 88, 100, "FCP: 1.2s"),
    mkBreakdown("Speed Index", 82, 100, "SI: 2.8s"),
  ],
} as any;

const cqScore = {
  category: "code-quality", rawScore: 82, weight: 0.25, weightedScore: 20.5,
  breakdown: [
    mkBreakdown("Code Smells", 75, 100, "12 console.log stmts"),
    mkBreakdown("Best Practices", 80, 100, "Missing error boundaries"),
    mkBreakdown("Bundle Analysis", 85, 100, "780KB gzipped"),
    mkBreakdown("Accessibility", 90, 100, "Good ARIA usage"),
    mkBreakdown("SEO", 88, 100, "Meta tags present"),
  ],
} as any;

// ---------------------------------------------------------------------------
// Full Demo Report (cast to ScanReport via any to bypass strict checks)
// ---------------------------------------------------------------------------
export const DEMO_REPORT = {
  id: "report_demo_001",
  scanId: "demo_scan_001",
  target: { mode: "url", url: "https://www.watcho.com" },
  platform: "both",
  generatedAt: now,
  agentResults: [
    {
      agentType: "security", scanId: "demo_scan_001", status: "completed",
      startedAt: now, completedAt: now, durationMs: 1800000,
      findings: secFindings, score: secScore, errors: [],
      metadata: {
        sslGrade: "B+", headersScore: 55,
        missingHeaders: ["Content-Security-Policy", "Permissions-Policy", "X-Content-Type-Options"],
        corsIssues: 1, depVulnerabilities: 2,
        drmStatus: { widevine: true, fairplay: true, keyRotation: true },
        owaspResults: {
          "A01:2021": { status: "pass", findings: 0 }, "A02:2021": { status: "pass", findings: 0 },
          "A03:2021": { status: "warn", findings: 1 }, "A05:2021": { status: "warn", findings: 1 },
          "A06:2021": { status: "fail", findings: 2 }, "A09:2021": { status: "warn", findings: 1 },
        },
        sslAnalysis: { grade: "B+", protocol: "TLSv1.3", certExpiry: "2026-04-15", issues: ["HSTS too short"], hsts: true },
        headerAnalysis: { score: 55, missing: ["Content-Security-Policy", "Permissions-Policy"], misconfigured: [{ header: "X-Frame-Options", issue: "SAMEORIGIN set" }], present: ["X-XSS-Protection", "HSTS"] },
        corsAnalysis: { allowOrigin: "*", allowCredentials: false, issues: ["Wildcard origin"], wildcardDetected: true },
        dependencyVulns: [
          { package: "lodash", version: "4.17.15", vulnerability: "Prototype Pollution", severity: "high", cveId: "CVE-2020-8203", fixVersion: "4.17.21" },
        ],
        tokenLeaks: [],
        drmAnalysis: { widevineDetected: true, fairplayDetected: true, licenseUrlExposed: false, keyRotation: true, issues: [] },
      },
    },
    {
      agentType: "performance", scanId: "demo_scan_001", status: "completed",
      startedAt: now, completedAt: now, durationMs: 1200000,
      findings: perfFindings, score: perfScore, errors: [],
      metadata: {
        lighthouseScore: 74, lcp: 3.8, cls: 0.18, tbt: 450, fcp: 1.2, si: 2.8, tti: 4.5,
        lighthouse: { performanceScore: 74, accessibilityScore: 88, bestPracticesScore: 82, seoScore: 90, pwaScore: 30 },
        coreWebVitals: {
          LCP: { value: 3.8, rating: "poor" }, CLS: { value: 0.18, rating: "needs-improvement" },
          FID: { value: 85, rating: "good" }, INP: { value: 210, rating: "needs-improvement" },
        },
      },
    },
    {
      agentType: "code-quality", scanId: "demo_scan_001", status: "completed",
      startedAt: now, completedAt: now, durationMs: 900000,
      findings: cqFindings, score: cqScore, errors: [],
      metadata: { linesAnalyzed: 15420, codeSmells: 12, duplicateBlocks: 3, complexFunctions: 5, bundleSizeKB: 780 },
    },
  ],
  kpiScore: {
    scanId: "demo_scan_001", timestamp: now, platform: "both",
    overallScore: 76.6, passesThreshold: false,
    grades: { security: secScore, performance: perfScore, codeQuality: cqScore },
    trend: { direction: "improving", delta: 2.3, history: [] },
    regressions: [],
  },
  criticalFindings: [...secFindings, ...perfFindings].filter((ff: any) => ff.severity === "critical" || ff.severity === "high"),
  recommendations: [
    { priority: 1, title: "Add Content-Security-Policy header", description: "Implement strict CSP.", impact: "Prevents XSS attacks", effort: "medium", category: "security" },
    { priority: 2, title: "Optimize LCP", description: "Reduce LCP below 2.5s.", impact: "Better Core Web Vitals", effort: "high", category: "performance" },
    { priority: 3, title: "Update lodash", description: "Upgrade to 4.17.21+.", impact: "Fix prototype pollution", effort: "low", category: "security" },
    { priority: 4, title: "Remove console.log", description: "Strip debug logs.", impact: "Smaller bundle, no data leak", effort: "low", category: "code-quality" },
  ],
  executiveSummary: "The Watcho OTT platform scores 76.6/100. Key areas: missing CSP header, LCP above threshold, and vulnerable lodash dependency. DRM is well-implemented with Widevine + FairPlay.",
} as any as ScanReport;

// ---------------------------------------------------------------------------
// Demo trend data
// ---------------------------------------------------------------------------
export const DEMO_TRENDS = Array.from({ length: 14 }, (_, i) => ({
  date: new Date(Date.now() - (13 - i) * 86400000).toISOString(),
  score: 70 + Math.random() * 10,
  security: 65 + Math.random() * 15,
  performance: 72 + Math.random() * 12,
  codeQuality: 78 + Math.random() * 10,
}));

// Demo user
export const DEMO_USER = { id: "demo-user-001", email: "demo@dishtv.in", name: "Demo User", role: "admin" as const };
export const DEMO_TOKEN = "demo-mode-token";

export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("vzy_token") === DEMO_TOKEN;
}
