// ============================================================================
// VZY OTT Verification Agent - Core Type Definitions
// ============================================================================

export type AgentType = 'security' | 'performance' | 'code-quality' | 'report-generator';
export type ScanMode = 'url' | 'repo';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type ScanStatus = 'queued' | 'running' | 'completed' | 'failed' | 'partial';
export type Platform = 'desktop' | 'mweb' | 'both';

// ---------------------------------------------------------------------------
// Scan Configuration
// ---------------------------------------------------------------------------
export interface ScanConfig {
  id: string;
  target: ScanTarget;
  agents: AgentType[];
  platform: Platform;
  schedule?: CronSchedule;
  thresholds: ScoreThresholds;
  notifications: NotificationConfig;
  createdAt: Date;
}

export interface ScanTarget {
  mode: ScanMode;
  url?: string;                    // Website URL for URL mode
  repoPath?: string;               // Local repo path for code mode
  repoUrl?: string;                // Git clone URL
  branch?: string;                 // Branch to scan
  authConfig?: AuthConfig;         // For authenticated scanning
}

export interface AuthConfig {
  type: 'cookie' | 'bearer' | 'oauth' | 'basic';
  credentials: Record<string, string>;
  loginUrl?: string;
  loginSteps?: LoginStep[];        // Puppeteer login automation
}

export interface LoginStep {
  action: 'navigate' | 'click' | 'type' | 'wait' | 'screenshot';
  selector?: string;
  value?: string;
  timeout?: number;
}

// ---------------------------------------------------------------------------
// Score Models
// ---------------------------------------------------------------------------
export interface ScoreThresholds {
  overall: number;                  // Minimum overall KPI score (target: 95)
  security: number;                 // Minimum security score
  performance: number;              // Minimum performance score
  codeQuality: number;              // Minimum code quality score
}

export interface WeightedScore {
  category: AgentType;
  rawScore: number;                 // 0-100
  weight: number;                   // 0-1 (sum = 1.0)
  weightedScore: number;            // rawScore * weight
  breakdown: ScoreBreakdown[];
}

export interface ScoreBreakdown {
  metric: string;
  value: number;
  maxScore: number;
  actualScore: number;
  penalty: number;
  details: string;
}

export interface KPIScore {
  scanId: string;
  timestamp: Date;
  platform: Platform;
  overallScore: number;             // Weighted composite 0-100
  grades: {
    security: WeightedScore;
    performance: WeightedScore;
    codeQuality: WeightedScore;
  };
  trend: TrendData;
  regressions: Regression[];
  passesThreshold: boolean;
}

export interface TrendData {
  direction: 'improving' | 'declining' | 'stable';
  delta: number;                    // Change from last scan
  history: { date: Date; score: number }[];
}

export interface Regression {
  metric: string;
  previousValue: number;
  currentValue: number;
  delta: number;
  severity: Severity;
  agent: AgentType;
}

// ---------------------------------------------------------------------------
// Agent Results
// ---------------------------------------------------------------------------
export interface AgentResult {
  agentType: AgentType;
  scanId: string;
  status: ScanStatus;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  findings: Finding[];
  score: WeightedScore;
  metadata: Record<string, unknown>;
  errors: AgentError[];
}

export interface Finding {
  id: string;
  agent: AgentType;
  severity: Severity;
  category: string;
  title: string;
  description: string;
  location?: FindingLocation;
  evidence?: string;
  remediation: string;
  references: string[];
  cweId?: string;                  // CWE ID for security findings
  cvssScore?: number;              // CVSS for security findings
  autoFixable: boolean;
  jiraTicketId?: string;
}

export interface FindingLocation {
  file?: string;
  line?: number;
  column?: number;
  url?: string;
  endpoint?: string;
  selector?: string;
}

export interface AgentError {
  code: string;
  message: string;
  recoverable: boolean;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Security Agent Types
// ---------------------------------------------------------------------------
export interface SecurityScanResult extends AgentResult {
  agentType: 'security';
  metadata: {
    owaspFindings: OWASPFinding[];
    headerAnalysis: HeaderAnalysis;
    sslAnalysis: SSLAnalysis;
    corsAnalysis: CORSAnalysis;
    drmAnalysis: DRMAnalysis;
    apiExposure: APIExposure[];
    dependencyVulns: DependencyVuln[];
    tokenLeaks: TokenLeak[];
  };
}

export interface OWASPFinding {
  category: string;                // A01-A10
  name: string;
  risk: Severity;
  details: string;
  affected: string[];
}

export interface HeaderAnalysis {
  score: number;
  missing: string[];
  misconfigured: { header: string; issue: string }[];
  present: string[];
}

export interface SSLAnalysis {
  grade: string;
  protocol: string;
  certExpiry: Date;
  issues: string[];
  hsts: boolean;
}

export interface CORSAnalysis {
  allowOrigin: string;
  allowCredentials: boolean;
  issues: string[];
  wildcardDetected: boolean;
}

export interface DRMAnalysis {
  widevineDetected: boolean;
  fairplayDetected: boolean;
  licenseUrlExposed: boolean;
  keyRotation: boolean;
  issues: string[];
}

export interface APIExposure {
  endpoint: string;
  method: string;
  authenticated: boolean;
  sensitiveData: boolean;
  rateLimit: boolean;
  issues: string[];
}

export interface DependencyVuln {
  package: string;
  version: string;
  vulnerability: string;
  severity: Severity;
  cveId: string;
  fixVersion?: string;
}

export interface TokenLeak {
  type: 'api_key' | 'jwt' | 'session' | 'oauth' | 'other';
  location: string;
  partial: string;               // Masked token
  severity: Severity;
}

// ---------------------------------------------------------------------------
// Performance Agent Types
// ---------------------------------------------------------------------------
export interface PerformanceScanResult extends AgentResult {
  agentType: 'performance';
  metadata: {
    lighthouse: LighthouseMetrics;
    coreWebVitals: CoreWebVitals;
    playerMetrics: PlayerMetrics;
    cdnMetrics: CDNMetrics;
    resourceMetrics: ResourceMetrics;
  };
}

export interface LighthouseMetrics {
  performanceScore: number;
  accessibilityScore: number;
  bestPracticesScore: number;
  seoScore: number;
  pwaScore: number;
}

export interface CoreWebVitals {
  lcp: { value: number; rating: 'good' | 'needs-improvement' | 'poor' };
  fcp: { value: number; rating: 'good' | 'needs-improvement' | 'poor' };
  cls: { value: number; rating: 'good' | 'needs-improvement' | 'poor' };
  fid: { value: number; rating: 'good' | 'needs-improvement' | 'poor' };
  ttfb: { value: number; rating: 'good' | 'needs-improvement' | 'poor' };
  inp: { value: number; rating: 'good' | 'needs-improvement' | 'poor' };
}

export interface PlayerMetrics {
  startupDelay: number;            // ms
  bufferRatio: number;             // 0-1
  abrSwitchCount: number;
  abrSwitchLatency: number;        // ms
  rebufferEvents: number;
  playbackFailures: number;
  drmLicenseTime: number;          // ms
  timeToFirstFrame: number;        // ms
}

export interface CDNMetrics {
  hitRatio: number;                // 0-1
  avgLatency: number;              // ms
  p95Latency: number;              // ms
  edgeLocations: string[];
  cacheHeaders: boolean;
  compressionEnabled: boolean;
}

export interface ResourceMetrics {
  totalSize: number;               // bytes
  jsSize: number;
  cssSize: number;
  imageSize: number;
  fontSize: number;
  thirdPartySize: number;
  requestCount: number;
  uncompressedAssets: string[];
  renderBlockingResources: string[];
}

// ---------------------------------------------------------------------------
// Code Quality Agent Types
// ---------------------------------------------------------------------------
export interface CodeQualityScanResult extends AgentResult {
  agentType: 'code-quality';
  metadata: {
    deadCode: DeadCodeFinding[];
    memoryLeaks: MemoryLeakFinding[];
    asyncIssues: AsyncIssueFinding[];
    antiPatterns: AntiPatternFinding[];
    unhandledExceptions: ExceptionFinding[];
    lintResults: LintResult;
    complexity: ComplexityMetrics;
  };
}

export interface DeadCodeFinding {
  type: 'unused-export' | 'unreachable' | 'unused-variable' | 'unused-import' | 'dead-branch';
  file: string;
  line: number;
  code: string;
  confidence: number;
}

export interface MemoryLeakFinding {
  type: 'event-listener' | 'timer' | 'closure' | 'dom-reference' | 'subscription';
  file: string;
  line: number;
  description: string;
  severity: Severity;
}

export interface AsyncIssueFinding {
  type: 'unhandled-promise' | 'race-condition' | 'missing-await' | 'callback-hell' | 'deadlock';
  file: string;
  line: number;
  description: string;
  severity: Severity;
}

export interface AntiPatternFinding {
  pattern: string;
  file: string;
  line: number;
  description: string;
  suggestion: string;
  severity: Severity;
}

export interface ExceptionFinding {
  type: 'uncaught' | 'empty-catch' | 'swallowed' | 'generic-catch';
  file: string;
  line: number;
  description: string;
}

export interface LintResult {
  errors: number;
  warnings: number;
  fixable: number;
  rules: { rule: string; count: number; severity: 'error' | 'warning' }[];
}

export interface ComplexityMetrics {
  avgCyclomaticComplexity: number;
  maxCyclomaticComplexity: number;
  avgCognitiveComplexity: number;
  maxCognitiveComplexity: number;
  duplicateBlocks: number;
  technicalDebt: string;           // e.g., "4d 2h"
}

// ---------------------------------------------------------------------------
// Notification & Integration Types
// ---------------------------------------------------------------------------
export interface NotificationConfig {
  slack?: { webhookUrl: string; channel: string; mentionOnCritical: string[] };
  email?: { recipients: string[]; smtpConfig: SMTPConfig };
  jira?: JiraConfig;
}

export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
}

export interface JiraConfig {
  host: string;
  email: string;
  apiToken: string;
  projectKey: string;
  issueType: string;
  severityMapping: Record<Severity, string>;     // severity -> priority
  autoCreate: boolean;
  autoCreateThreshold: Severity;                  // minimum severity for auto-creation
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------
export interface CronSchedule {
  expression: string;              // Cron expression
  timezone: string;
  enabled: boolean;
  onDeploy: boolean;               // Also trigger on deployment
  deployWebhookSecret?: string;
}

// ---------------------------------------------------------------------------
// Report Types
// ---------------------------------------------------------------------------
export interface ScanReport {
  id: string;
  scanId: string;
  generatedAt: Date;
  target: ScanTarget;
  platform: Platform;
  kpiScore: KPIScore;
  agentResults: AgentResult[];
  executiveSummary: string;        // AI-generated summary
  criticalFindings: Finding[];
  recommendations: Recommendation[];
  comparisonWithPrevious?: ScanComparison;
}

export interface Recommendation {
  priority: number;
  title: string;
  description: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
  category: AgentType;
}

export interface ScanComparison {
  previousScanId: string;
  scoreDelta: number;
  newFindings: Finding[];
  resolvedFindings: Finding[];
  regressions: Regression[];
}
