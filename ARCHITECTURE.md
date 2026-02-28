# VZY OTT Verification Agent - System Architecture

## 1. System Overview

Fully autonomous, multi-agent AI system for continuous security, performance,
and code quality analysis of DishTV/Watcho OTT platform (desktop + mWeb).

```
INPUT                    ORCHESTRATOR              AGENTS                    OUTPUT
─────                    ────────────              ──────                    ──────
                    ┌─────────────────────┐
 Website URL ──────►│                     │───► Security Agent ─────┐
                    │   Scan Orchestrator  │                         │
 Source Code ──────►│                     │───► Performance Agent ──┤
                    │  • Config loading    │                         ├──► Report
 Deploy Hook ──────►│  • Agent dispatch   │───► Code Quality Agent ─┤     Generator
                    │  • Timeout guards    │                         │       │
 Cron Schedule ────►│  • Result collection │───► (extensible...)  ──┘       │
                    │                     │                                  │
                    └─────────────────────┘                                  ▼
                                                                    ┌──────────────┐
                                                                    │  KPI Score   │
                                                                    │  95+ Target  │
                                                                    ├──────────────┤
                                                                    │  Jira Tickets│
                                                                    │  Slack Alert │
                                                                    │  Email Report│
                                                                    │  Dashboard   │
                                                                    └──────────────┘
```

## 2. Multi-Agent Architecture

### Agent Responsibilities

| Agent | Weight | Focus Areas |
|-------|--------|-------------|
| **Security Agent** | 40% | OWASP Top 10, headers, SSL, CORS, DRM, API exposure, token leaks, dependency CVEs |
| **Performance Agent** | 35% | Lighthouse ≥95, LCP <2.5s, FCP <1.8s, CLS <0.1, TTFB <800ms, player startup, CDN, ABR |
| **Code Quality Agent** | 25% | Dead code, memory leaks, async issues, anti-patterns, exceptions, lint, complexity |
| **Report Generator** | - | AI reasoning, scoring, regression detection, trend analysis, executive summary |

### Agent Execution Flow

```
                    ┌──────────────────────────────────────────────┐
                    │              ORCHESTRATOR                     │
                    │                                              │
                    │  1. Load config (URL/repo + options)         │
                    │  2. Initialize agents in parallel            │
                    │  3. Execute with Promise.allSettled()        │
                    │  4. Collect AgentResult[] (JSON)             │
                    │  5. Feed to Report Generator                 │
                    │  6. Store + Notify                           │
                    └────────┬───────────┬───────────┬────────────┘
                             │           │           │
                    ┌────────▼──┐  ┌─────▼─────┐  ┌─▼───────────┐
                    │ Security  │  │Performance│  │ Code Quality│
                    │  Agent    │  │  Agent    │  │   Agent     │
                    │           │  │           │  │             │
                    │ Puppeteer │  │Lighthouse │  │ ESLint      │
                    │ Axios     │  │Puppeteer  │  │ Semgrep     │
                    │ npm audit │  │CWV measure│  │ AST analysis│
                    │           │  │Player prof│  │ Pattern scan│
                    └─────┬─────┘  └─────┬─────┘  └──────┬──────┘
                          │              │               │
                          ▼              ▼               ▼
                    ┌──────────────────────────────────────────┐
                    │         Unified AgentResult (JSON)        │
                    │  { findings[], score, metadata, errors } │
                    └────────────────────┬─────────────────────┘
                                         │
                                         ▼
                    ┌──────────────────────────────────────────┐
                    │          REPORT GENERATOR                 │
                    │                                          │
                    │  • KPI Scoring (weighted formula)        │
                    │  • AI Executive Summary (GPT-4o)         │
                    │  • Regression detection vs previous      │
                    │  • Prioritized recommendations           │
                    │  • Trend analysis (30-day window)        │
                    └──────────────────────────────────────────┘
```

## 3. KPI Scoring Formula

```
┌─────────────────────────────────────────────────────────────────────┐
│                    OVERALL KPI SCORE                                 │
│                                                                     │
│  Score = (Security × 0.40) + (Performance × 0.35) + (Code × 0.25) │
│                                                                     │
│  Target: ≥ 95/100                                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Per-Agent Score = 100 - Σ(severity_penalties)                     │
│                                                                     │
│    CRITICAL finding  = -25 points                                   │
│    HIGH finding      = -15 points                                   │
│    MEDIUM finding    = -8  points                                   │
│    LOW finding       = -3  points                                   │
│    INFO finding      = -0  points                                   │
│                                                                     │
│  Score clamped to [0, 100]                                         │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  PERFORMANCE THRESHOLDS (auto-fail if exceeded)                     │
│                                                                     │
│    Lighthouse Score  ≥ 95                                           │
│    LCP              < 2.5s                                          │
│    FCP              < 1.8s                                          │
│    CLS              < 0.1                                           │
│    TTFB             < 800ms                                         │
│    INP              < 200ms                                         │
│    Player Startup   < 3s                                            │
│    Buffer Ratio     < 2%                                            │
│    DRM License Time < 2s                                            │
└─────────────────────────────────────────────────────────────────────┘
```

## 4. Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Node.js 20+ / TypeScript 5.6 | Agent execution environment |
| **Browser Automation** | Puppeteer 23+ | Page navigation, DOM analysis, interception |
| **Performance** | Lighthouse 12, Chrome Launcher | Performance auditing, Core Web Vitals |
| **Security Scanning** | Axios, npm audit, Retire.js, Semgrep | OWASP, CVE, SAST |
| **AI/LLM** | OpenAI GPT-4o | Executive summaries, recommendations |
| **Database** | PostgreSQL 16 | Scan history, trend persistence |
| **Cache** | Redis 7 | Latest results, fast trend lookup |
| **Notifications** | Slack Webhooks, Nodemailer, Jira REST API | Alert routing |
| **Dashboard** | Express + Socket.IO | REST API + real-time WebSocket |
| **Visualization** | Grafana | Trend dashboards, alerting |
| **Scheduling** | node-cron | Daily automated scans |
| **Containerization** | Docker, Docker Compose | Consistent deployment |
| **Orchestration** | Kubernetes | Production scaling |
| **CI/CD** | GitHub Actions / Jenkins | Build, test, deploy pipeline |

## 5. Folder Structure

```
vzy-ott-verification-agent/
├── src/
│   ├── types/
│   │   └── index.ts                 # All TypeScript type definitions
│   ├── core/
│   │   └── base-agent.ts            # Abstract base class for agents
│   ├── agents/
│   │   ├── security/
│   │   │   └── security-agent.ts    # OWASP, headers, SSL, CORS, DRM, tokens
│   │   ├── performance/
│   │   │   └── performance-agent.ts # Lighthouse, CWV, player, CDN, resources
│   │   ├── code-quality/
│   │   │   └── code-quality-agent.ts# Dead code, leaks, async, anti-patterns
│   │   └── report/
│   │       └── report-generator.ts  # AI scoring, comparison, recommendations
│   ├── orchestrator/
│   │   └── index.ts                 # Multi-agent coordinator
│   ├── scheduler/
│   │   └── cron.ts                  # Cron scheduler + deploy webhook
│   ├── integrations/
│   │   └── notification-service.ts  # Slack, Email, Jira
│   ├── store/
│   │   └── result-store.ts          # PostgreSQL + Redis persistence
│   ├── dashboard/
│   │   └── server.ts                # REST API + WebSocket server
│   ├── utils/
│   │   └── logger.ts                # Winston structured logging
│   └── cli.ts                       # CLI entry point
├── infra/
│   ├── k8s/
│   │   └── deployment.yaml          # K8s manifests
│   └── grafana/
│       ├── dashboards/              # Grafana dashboard JSON
│       └── datasources/             # Grafana datasource config
├── scan-results/                    # JSON report output (gitignored)
├── logs/                            # Log files (gitignored)
├── Dockerfile                       # Multi-stage production image
├── docker-compose.yml               # Full stack compose
├── package.json
├── tsconfig.json
├── .env.example
└── ARCHITECTURE.md                  # This file
```

## 6. Workflow Diagram

### Daily Automated Scan
```
    ┌──────────┐     ┌──────────────┐     ┌─────────────────┐
    │  2 AM    │     │  Orchestrator │     │  All 3 Agents   │
    │  Cron    │────►│  Initializes  │────►│  Run in Parallel│
    │  Trigger │     │  Scan Config  │     │  (5 min timeout)│
    └──────────┘     └──────────────┘     └────────┬────────┘
                                                    │
                     ┌──────────────┐               │
                     │   Report     │◄──────────────┘
                     │  Generator   │  AgentResult[] (JSON)
                     └──────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              ▼             ▼             ▼
        ┌──────────┐ ┌──────────┐ ┌──────────────┐
        │  Store   │ │  Notify  │ │  Dashboard   │
        │  Results │ │  Alerts  │ │  WebSocket   │
        │  (PG+RD) │ │(Slack/   │ │  Update      │
        │          │ │Email/Jira)│ │              │
        └──────────┘ └──────────┘ └──────────────┘
```

### Deployment-Triggered Scan
```
    ┌──────────┐     ┌──────────────┐     ┌──────────────┐
    │  CI/CD   │     │  Webhook     │     │  Verify      │
    │  Deploy  │────►│  POST /      │────►│  HMAC        │
    │  Pipeline│     │  webhook/    │     │  Signature   │
    └──────────┘     │  deploy      │     └──────┬───────┘
                     └──────────────┘            │ Valid
                                                  ▼
                                          ┌──────────────┐
                                          │  Queue Scan  │
                                          │  (same flow  │
                                          │   as daily)  │
                                          └──────────────┘
```

### Scan-to-Ticket Pipeline
```
    Finding Detected    Severity Check      Jira Ticket       Slack Alert
    ────────────────    ──────────────      ───────────       ───────────
    [CRITICAL] XSS ──► severity >= HIGH ──► OTT-1234 ──────► @cto @security
                        auto-create=true    Priority: Highest  🔴 CRITICAL
                                            Labels: [auto-scan,
                                                     security,
                                                     critical]
```

## 7. Deployment Model

### Option A: Docker Compose (Staging / Small Scale)
```bash
# Clone and configure
cp .env.example .env
# Edit .env with actual credentials

# Start full stack
docker-compose up -d

# Verify
curl http://localhost:3000/api/health
```

### Option B: Kubernetes (Production)
```bash
# Create namespace
kubectl create namespace ott-monitoring

# Create secrets
kubectl create secret generic vzy-agent-secrets \
  --from-env-file=.env \
  -n ott-monitoring

# Deploy
kubectl apply -f infra/k8s/deployment.yaml

# Verify
kubectl get pods -n ott-monitoring
```

### Option C: CI/CD Integration (GitHub Actions)
```yaml
# .github/workflows/ott-scan.yml
name: OTT Scan
on:
  push:
    branches: [main]
  schedule:
    - cron: '0 2 * * *'

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run scan -- --url ${{ vars.OTT_URL }} --platform both
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      - uses: actions/upload-artifact@v4
        with:
          name: scan-report
          path: scan-results/
```

## 8. Security Agent Deep Dive

### OWASP Top 10 Coverage

| OWASP Category | Check Method |
|----------------|-------------|
| A01 - Broken Access Control | API auth check, CORS, cookie flags |
| A02 - Cryptographic Failures | SSL/TLS, HSTS, token storage |
| A03 - Injection | XSS reflected payload testing |
| A04 - Insecure Design | API documentation exposure |
| A05 - Security Misconfiguration | Headers, .env/.git exposure, directory listing |
| A06 - Vulnerable Components | npm audit, Retire.js, Semgrep |
| A07 - Auth Failures | User enumeration, session cookie config |
| A08 - Data Integrity | CSP, SRI checks |
| A09 - Logging Failures | Error response analysis |
| A10 - SSRF | Redirect chain analysis |

### OTT-Specific Security Checks
- DRM license URL exposure in client-side code
- Widevine/FairPlay/PlayReady integration verification
- EME (Encrypted Media Extensions) support
- Content key rotation patterns
- Token storage (localStorage vs httpOnly cookies)
- Player SDK hardcoded credentials

## 9. Performance Agent Deep Dive

### Measurement Strategy

| Metric | Tool | Target | OTT Context |
|--------|------|--------|-------------|
| Lighthouse Score | Lighthouse 12 | ≥95 | Full audit with desktop + mobile throttling |
| LCP | PerformanceObserver | <2.5s | Hero banner / carousel images |
| FCP | Paint Timing API | <1.8s | Above-fold content render |
| CLS | PerformanceObserver | <0.1 | Thumbnail grid layout shifts |
| TTFB | Navigation Timing | <800ms | CDN edge response time |
| Player Startup | Custom measurement | <3s | Time to canplay event |
| ABR Switch | Player SDK API | Smooth | Adaptive bitrate quality changes |
| Buffer Ratio | Player SDK API | <2% | Rebuffering frequency |
| CDN Hit Ratio | Cache headers | >95% | Edge cache efficiency |

## 10. Extending the System

### Adding a New Agent

```typescript
// src/agents/accessibility/accessibility-agent.ts
import { BaseAgent } from '../../core/base-agent';
import { ScanConfig, WeightedScore } from '../../types';

export class AccessibilityAgent extends BaseAgent {
  constructor() {
    super('accessibility');   // Register agent type
  }

  protected async setup(config: ScanConfig): Promise<void> {
    // Initialize axe-core, pa11y, etc.
  }

  protected async scan(config: ScanConfig): Promise<void> {
    // Run WCAG 2.1 AA checks
    // this.addFinding({ ... });
  }

  protected async teardown(): Promise<void> {
    // Cleanup
  }

  protected calculateScore(): WeightedScore {
    // Implement scoring
  }
}
```

Then register in `orchestrator/index.ts`:
```typescript
const agentMap = {
  // ... existing agents
  'accessibility': () => new AccessibilityAgent(),
};
```

### Integration Points
- **CI/CD**: POST to `/webhook/deploy` after deployment
- **Monitoring**: Grafana dashboards connect to PostgreSQL
- **Custom Alerts**: Extend `NotificationService` for PagerDuty, Teams, etc.
- **Infrastructure**: Add Prometheus metrics export for K8s monitoring
