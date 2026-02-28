# VZY Dashboard - Architecture & Design Document

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        VZY DASHBOARD (Next.js 14)                       │
│                                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Overview  │  │ Security │  │  Perf    │  │  Code    │  │ Control  │ │
│  │ Page     │  │ Drilldown│  │ Drilldown│  │ Quality  │  │  Center  │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘ │
│       │              │              │              │              │       │
│  ┌────┴──────────────┴──────────────┴──────────────┴──────────────┴───┐ │
│  │                        Zustand State Store                         │ │
│  │  AuthStore  │  ReportStore  │  ScanStore  │  UIStore              │ │
│  └────────────────────────┬───────────────────────────────────────────┘ │
│                           │                                             │
│  ┌────────────────────────┴───────────────────────────────────────────┐ │
│  │                    API Client + WebSocket Client                    │ │
│  └────────────────────────┬──────────────────┬────────────────────────┘ │
│                           │                  │                          │
└───────────────────────────┼──────────────────┼──────────────────────────┘
                            │ REST             │ WebSocket
                            ▼                  ▼
                    ┌───────────────────────────────────┐
                    │     EXISTING BACKEND (Express)     │
                    │                                   │
                    │  GET /api/reports/latest           │
                    │  GET /api/trends                   │
                    │  POST /api/scans                   │
                    │  GET /api/health                   │
                    │  WS: scan:progress/complete/error  │
                    └───────────────────────────────────┘
                            │
                    ┌───────┴───────┐
                    │  PostgreSQL   │
                    │  Redis        │
                    └───────────────┘
```

## 2. Page / Component Breakdown

### Pages (6 routes)

| Page | Route | Description | RBAC |
|------|-------|-------------|------|
| **Overview** | `/` | Central KPI gauge, agent scores, trend chart, findings, recommendations | All |
| **Security** | `/security` | OWASP grid, CVE table, API exposure, DRM, headers, findings | All |
| **Performance** | `/performance` | Lighthouse gauges, CWV bars, player metrics, CDN, resources | All |
| **Code Quality** | `/code-quality` | Lint, dead code, memory leaks, async, heatmap, complexity | All |
| **Control Center** | `/control-center` | Run scan, schedule, thresholds, notifications, webhooks | Admin, DevOps |
| **Reporting** | `/reporting` | PDF/JSON download, regression comparison, share link | All |

### Shared Components (15)

| Component | File | Purpose |
|-----------|------|---------|
| `KPIGauge` | `charts/kpi-gauge.tsx` | Animated SVG ring gauge with score counting animation |
| `TrendChart` | `charts/trend-chart.tsx` | Recharts area chart with target reference line, breakdown toggle |
| `ScoreRing` | `charts/score-ring.tsx` | Small agent score ring with delta indicator |
| `SeverityPie` | `charts/severity-pie.tsx` | Donut chart of findings by severity |
| `CWVBars` | `charts/cwv-bars.tsx` | Horizontal bar chart for Core Web Vitals vs targets |
| `MetricCard` | `cards/metric-card.tsx` | Stat card with icon, trend, and status coloring |
| `FindingRow` | `cards/finding-row.tsx` | Expandable finding with evidence, remediation, Jira action |
| `RegressionBanner` | `cards/regression-banner.tsx` | Alert banner for score regressions |
| `ScanInput` | `shared/scan-input.tsx` | URL/repo input with platform + agent selector |
| `JsonViewer` | `shared/json-viewer.tsx` | Collapsible raw JSON with copy button |
| `Sidebar` | `layout/sidebar.tsx` | Collapsible navigation with RBAC-filtered items |
| `Header` | `layout/header.tsx` | Target info, scan status, notifications, user menu |
| `Shell` | `layout/shell.tsx` | App wrapper: sidebar + header + auto-fetch logic |

## 3. Folder Structure

```
dashboard/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout (fonts, Shell wrapper)
│   │   ├── globals.css               # Tailwind layers + custom components
│   │   ├── page.tsx                  # Overview page
│   │   ├── security/page.tsx         # Security drilldown
│   │   ├── performance/page.tsx      # Performance drilldown
│   │   ├── code-quality/page.tsx     # Code quality drilldown
│   │   ├── control-center/page.tsx   # Scan management + config
│   │   ├── reporting/page.tsx        # Reports + export
│   │   └── login/page.tsx            # Authentication
│   ├── components/
│   │   ├── layout/
│   │   │   ├── sidebar.tsx           # Collapsible nav sidebar
│   │   │   ├── header.tsx            # Top header bar
│   │   │   └── shell.tsx             # App shell with data fetching
│   │   ├── charts/
│   │   │   ├── kpi-gauge.tsx         # Central SVG gauge
│   │   │   ├── trend-chart.tsx       # Area chart (Recharts)
│   │   │   ├── score-ring.tsx        # Agent score ring
│   │   │   ├── severity-pie.tsx      # Severity donut chart
│   │   │   └── cwv-bars.tsx          # Core Web Vitals bars
│   │   ├── cards/
│   │   │   ├── metric-card.tsx       # Stat card
│   │   │   ├── finding-row.tsx       # Expandable finding
│   │   │   └── regression-banner.tsx # Regression alert
│   │   └── shared/
│   │       ├── scan-input.tsx        # URL/repo input form
│   │       └── json-viewer.tsx       # JSON expander
│   ├── hooks/
│   │   └── use-scan-report.ts        # Central report data hook
│   ├── lib/
│   │   ├── api.ts                    # REST API client
│   │   ├── websocket.ts             # Socket.IO client
│   │   ├── store.ts                  # Zustand stores (auth, report, scan, UI)
│   │   └── utils.ts                  # cn(), formatters, color helpers
│   ├── types/
│   │   └── api.ts                    # Frontend type definitions
│   └── middleware.ts                 # JWT auth guard
├── public/
├── Dockerfile                        # Multi-stage standalone build
├── next.config.js                    # API proxy rewrites
├── tailwind.config.ts                # Custom theme (dark, OTT colors)
├── tsconfig.json
└── package.json
```

## 4. State Management

```
┌──────────────────────────────────────────────────────────────┐
│                     ZUSTAND STORES                            │
├──────────────┬──────────────┬──────────────┬─────────────────┤
│  AuthStore   │ ReportStore  │  ScanStore   │   UIStore       │
├──────────────┼──────────────┼──────────────┼─────────────────┤
│ user         │ report       │ activeScan   │ sidebarCollapsed│
│ token        │ target       │ scanHistory  │ trendRange      │
│ setAuth()    │ loading      │ setActive()  │ toggleSidebar() │
│ logout()     │ error        │ updateAgent()│ setTrendRange() │
│ hasRole()    │ setReport()  │ completeScan │                 │
│              │ setTarget()  │              │                 │
├──────────────┴──────────────┴──────────────┴─────────────────┤
│  Persisted: AuthStore (JWT), UIStore (preferences)           │
│  Ephemeral: ReportStore, ScanStore (cleared on refresh)      │
└──────────────────────────────────────────────────────────────┘
```

## 5. API Integration Pattern

```typescript
// All API calls go through lib/api.ts with:
// 1. Auto-injected JWT Bearer token from localStorage
// 2. Typed responses matching backend types
// 3. Error wrapping via ApiError class
// 4. Proxy through Next.js rewrites (same-origin)

// Example flow:
//   Component → useScanReport() hook → api.getLatestReport() → GET /api/reports/latest
//   Component → useScanReport() hook → api.triggerScan()     → POST /api/scans
```

## 6. WebSocket Integration

```typescript
// Socket.IO events consumed by dashboard:
//
// scan:progress  → Updates agent progress bars in Control Center
// scan:complete  → Triggers report refresh, clears active scan
// scan:error     → Shows error notification, clears loading state
//
// Connection lifecycle:
//   Shell mount → connect() → register listeners
//   Shell unmount → disconnect()
//
// Reconnection: auto-reconnect with 2s delay, 10 max attempts
```

## 7. Sample KPI Response

```json
{
  "scanId": "scan_a1b2c3d4",
  "timestamp": "2026-02-28T02:00:00.000Z",
  "platform": "both",
  "overallScore": 87.5,
  "grades": {
    "security": {
      "rawScore": 82,
      "weight": 0.40,
      "weightedScore": 32.8,
      "breakdown": [
        { "metric": "Headers",    "maxScore": 20, "actualScore": 14, "penalty": 6 },
        { "metric": "SSL/TLS",    "maxScore": 15, "actualScore": 15, "penalty": 0 },
        { "metric": "CORS",       "maxScore": 15, "actualScore": 7,  "penalty": 8 },
        { "metric": "DRM (OTT)",  "maxScore": 10, "actualScore": 10, "penalty": 0 }
      ]
    },
    "performance": {
      "rawScore": 91,
      "weight": 0.35,
      "weightedScore": 31.85
    },
    "codeQuality": {
      "rawScore": 92,
      "weight": 0.25,
      "weightedScore": 23.0
    }
  },
  "trend": {
    "direction": "improving",
    "delta": 3.2,
    "history": [
      { "date": "2026-02-21", "score": 84.3 },
      { "date": "2026-02-28", "score": 87.5 }
    ]
  },
  "regressions": [],
  "passesThreshold": false
}
```

## 8. RBAC Model

| Role | Overview | Security | Performance | Code Quality | Control Center | Reporting |
|------|----------|----------|-------------|-------------|----------------|-----------|
| **Admin** | Full | Full | Full | Full | Full | Full |
| **DevOps** | Full | Full | Full | Full | Full | Full |
| **Developer** | View | View | View | View | - | View |
| **Executive** | View | View | View | View | - | View |

- Auth: JWT tokens stored in localStorage
- Middleware: Next.js middleware guards all routes except `/login`
- RBAC: Sidebar filters items, Control Center checks `hasRole()`

## 9. Dashboard Security Checklist

- [x] JWT authentication with middleware guard
- [x] RBAC role-based access control on sensitive pages
- [x] API proxy via Next.js rewrites (no direct backend exposure)
- [x] Helmet.js on backend API server
- [x] No secrets in frontend code (env vars via Next.js)
- [x] CORS restricted on WebSocket connections
- [x] Input sanitization on scan URL field
- [x] No sensitive data in localStorage (only JWT token)
- [x] CSP headers via Helmet on API
- [x] Rate limiting on scan trigger endpoint
- [x] Ingress TLS termination (K8s)

## 10. Performance Optimization Plan

| Optimization | Implementation |
|-------------|----------------|
| **Code Splitting** | Next.js App Router auto-splits per page |
| **Lazy Charts** | Recharts loaded only on pages that use them |
| **Static Generation** | Login page statically generated |
| **Image Optimization** | Next.js Image component for any logos |
| **Bundle Size** | Lucide icons tree-shaken (only used icons imported) |
| **Cache** | API responses cached in Zustand (avoid re-fetch) |
| **WebSocket** | Single connection shared across app |
| **Virtualization** | Finding lists capped + overflow scroll |
| **Font Optimization** | Google Fonts with `display: swap` |
| **Standalone Build** | Docker uses `output: standalone` for minimal image |
| **CDN** | Static assets served via CDN in production |
| **Compression** | Brotli/gzip via Nginx ingress |

## 11. Deployment

### Docker Compose (Full Stack)
```bash
# From project root:
docker-compose up -d

# Dashboard:     http://localhost:4000
# Agent API:     http://localhost:3000
# Webhook:       http://localhost:9090
# Grafana:       http://localhost:3001
```

### Kubernetes
```bash
kubectl apply -f infra/k8s/deployment.yaml            # Agent + DB
kubectl apply -f infra/k8s/dashboard-deployment.yaml   # Dashboard + Ingress

# Access: https://ott-monitor.dishtv.in
```
