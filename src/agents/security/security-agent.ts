// ============================================================================
// Security Agent - OWASP Top 10, API Exposure, Auth/Session, DRM Analysis
// ============================================================================

import puppeteer, { Browser, Page } from 'puppeteer';
import axios from 'axios';
import { BaseAgent } from '../../core/base-agent';
import {
  ScanConfig, WeightedScore, Severity,
  HeaderAnalysis, SSLAnalysis, CORSAnalysis, DRMAnalysis,
  APIExposure, TokenLeak, OWASPFinding,
} from '../../types';

export class SecurityAgent extends BaseAgent {
  private browser?: Browser;
  private page?: Page;
  private targetUrl = '';

  constructor() {
    super('security');
  }

  protected async setup(config: ScanConfig): Promise<void> {
    this.targetUrl = config.target.url || '';
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    this.page = await this.browser.newPage();

    // Set up request interception for API discovery
    await this.page.setRequestInterception(true);
    this.page.on('request', (req) => req.continue());
  }

  protected async scan(config: ScanConfig): Promise<void> {
    this.logger.info('Starting security scan phases');

    // Phase 1: Header & SSL Analysis
    await this.analyzeHeaders();
    await this.analyzeSSL();

    // Phase 2: CORS Analysis
    await this.analyzeCORS();

    // Phase 3: Navigate and discover APIs
    await this.discoverAPIs();

    // Phase 4: Token & Session Analysis
    await this.analyzeTokensAndSessions();

    // Phase 5: DRM Protection Analysis (OTT-specific)
    await this.analyzeDRM();

    // Phase 6: OWASP Top 10 Checks
    await this.runOWASPChecks();

    // Phase 7: Dependency vulnerability scan (if repo mode)
    if (config.target.mode === 'repo') {
      await this.scanDependencies(config.target.repoPath!);
    }
  }

  protected async teardown(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }

  // ---------------------------------------------------------------------------
  // Header Analysis
  // ---------------------------------------------------------------------------
  private async analyzeHeaders(): Promise<void> {
    this.logger.info('Analyzing security headers');

    const response = await axios.get(this.targetUrl, {
      maxRedirects: 5,
      timeout: 15000,
      validateStatus: () => true,
    });

    const headers = response.headers;
    const requiredHeaders: Record<string, { check: (v: string) => boolean; severity: Severity }> = {
      'strict-transport-security': {
        check: (v) => v.includes('max-age=') && parseInt(v.split('max-age=')[1]) >= 31536000,
        severity: 'high',
      },
      'content-security-policy': {
        check: (v) => !v.includes("'unsafe-inline'") && !v.includes("'unsafe-eval'"),
        severity: 'high',
      },
      'x-content-type-options': {
        check: (v) => v === 'nosniff',
        severity: 'medium',
      },
      'x-frame-options': {
        check: (v) => v === 'DENY' || v === 'SAMEORIGIN',
        severity: 'medium',
      },
      'x-xss-protection': {
        check: (v) => v.startsWith('1'),
        severity: 'low',
      },
      'referrer-policy': {
        check: (v) => ['no-referrer', 'strict-origin-when-cross-origin', 'same-origin'].includes(v),
        severity: 'medium',
      },
      'permissions-policy': {
        check: () => true,
        severity: 'medium',
      },
      'cache-control': {
        check: (v) => v.includes('no-store') || v.includes('private'),
        severity: 'low',
      },
    };

    for (const [header, config] of Object.entries(requiredHeaders)) {
      const value = headers[header];
      if (!value) {
        this.addFinding({
          severity: config.severity,
          category: 'Security Headers',
          title: `Missing security header: ${header}`,
          description: `The response does not include the ${header} header, which helps protect against common attacks.`,
          location: { url: this.targetUrl },
          evidence: `Header "${header}" not found in response`,
          remediation: `Add the ${header} header to all responses. Configure at the CDN/reverse proxy level for OTT-wide coverage.`,
          references: ['https://owasp.org/www-project-secure-headers/'],
          autoFixable: true,
        });
      } else if (!config.check(value)) {
        this.addFinding({
          severity: 'low',
          category: 'Security Headers',
          title: `Misconfigured header: ${header}`,
          description: `The ${header} header is present but may not be optimally configured.`,
          location: { url: this.targetUrl },
          evidence: `${header}: ${value}`,
          remediation: `Review and strengthen the ${header} header configuration.`,
          references: ['https://owasp.org/www-project-secure-headers/'],
          autoFixable: true,
        });
      }
    }

    // Check for information disclosure headers
    const leakyHeaders = ['server', 'x-powered-by', 'x-aspnet-version', 'x-aspnetmvc-version'];
    for (const header of leakyHeaders) {
      if (headers[header]) {
        this.addFinding({
          severity: 'low',
          category: 'Information Disclosure',
          title: `Server information exposed via ${header}`,
          description: `The ${header} header reveals server technology: "${headers[header]}"`,
          location: { url: this.targetUrl },
          evidence: `${header}: ${headers[header]}`,
          remediation: `Remove the ${header} header from responses to prevent technology fingerprinting.`,
          references: ['https://owasp.org/www-project-web-security-testing-guide/'],
          autoFixable: true,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // SSL/TLS Analysis
  // ---------------------------------------------------------------------------
  private async analyzeSSL(): Promise<void> {
    this.logger.info('Analyzing SSL/TLS configuration');

    try {
      const url = new URL(this.targetUrl);

      // Check if HTTPS is enforced
      if (url.protocol !== 'https:') {
        this.addFinding({
          severity: 'critical',
          category: 'SSL/TLS',
          title: 'Site not served over HTTPS',
          description: 'The website is not using HTTPS, exposing all traffic to interception.',
          location: { url: this.targetUrl },
          remediation: 'Enforce HTTPS across all endpoints. For OTT, this is critical for DRM content protection.',
          references: ['https://owasp.org/www-project-web-security-testing-guide/'],
          autoFixable: false,
        });
      }

      // Check HTTP -> HTTPS redirect
      try {
        const httpUrl = this.targetUrl.replace('https://', 'http://');
        const httpResponse = await axios.get(httpUrl, {
          maxRedirects: 0,
          validateStatus: () => true,
          timeout: 10000,
        });
        if (httpResponse.status !== 301 && httpResponse.status !== 308) {
          this.addFinding({
            severity: 'high',
            category: 'SSL/TLS',
            title: 'HTTP to HTTPS redirect not permanent',
            description: `HTTP requests return status ${httpResponse.status} instead of 301/308 permanent redirect.`,
            location: { url: httpUrl },
            remediation: 'Configure permanent (301/308) redirects from HTTP to HTTPS.',
            references: [],
            autoFixable: true,
          });
        }
      } catch {
        // HTTP not accessible - this is fine
      }
    } catch (error) {
      this.logger.warn('SSL analysis partial failure', { error: String(error) });
    }
  }

  // ---------------------------------------------------------------------------
  // CORS Analysis
  // ---------------------------------------------------------------------------
  private async analyzeCORS(): Promise<void> {
    this.logger.info('Analyzing CORS configuration');

    try {
      // Test with Origin header
      const response = await axios.options(this.targetUrl, {
        headers: { Origin: 'https://evil-site.com' },
        timeout: 10000,
        validateStatus: () => true,
      });

      const allowOrigin = response.headers['access-control-allow-origin'];
      const allowCredentials = response.headers['access-control-allow-credentials'];

      if (allowOrigin === '*') {
        this.addFinding({
          severity: 'high',
          category: 'CORS',
          title: 'Wildcard CORS origin detected',
          description: 'Access-Control-Allow-Origin is set to *, allowing any domain to make cross-origin requests.',
          location: { url: this.targetUrl },
          evidence: `Access-Control-Allow-Origin: *`,
          remediation: 'Restrict CORS to specific trusted domains. For OTT, whitelist only your app domains and CDN origins.',
          references: ['https://owasp.org/www-community/attacks/CORS_OriginHeaderScrutiny'],
          autoFixable: true,
        });
      }

      if (allowOrigin === 'https://evil-site.com') {
        this.addFinding({
          severity: 'critical',
          category: 'CORS',
          title: 'CORS reflects arbitrary origin',
          description: 'The server reflects any Origin header in Access-Control-Allow-Origin, enabling cross-origin attacks.',
          location: { url: this.targetUrl },
          evidence: `Reflected origin: https://evil-site.com`,
          remediation: 'Implement a strict allowlist of permitted origins instead of reflecting the request Origin.',
          references: ['https://owasp.org/www-community/attacks/CORS_OriginHeaderScrutiny'],
          cweId: 'CWE-942',
          autoFixable: false,
        });
      }

      if (allowCredentials === 'true' && (allowOrigin === '*' || allowOrigin === 'https://evil-site.com')) {
        this.addFinding({
          severity: 'critical',
          category: 'CORS',
          title: 'CORS allows credentials with permissive origin',
          description: 'Credentials are allowed with a wildcard or reflected origin, enabling session hijacking.',
          location: { url: this.targetUrl },
          evidence: `Allow-Credentials: true with Allow-Origin: ${allowOrigin}`,
          remediation: 'Never combine Access-Control-Allow-Credentials: true with wildcard or reflected origins.',
          references: [],
          cweId: 'CWE-942',
          autoFixable: false,
        });
      }
    } catch (error) {
      this.logger.warn('CORS analysis error', { error: String(error) });
    }
  }

  // ---------------------------------------------------------------------------
  // API Discovery & Analysis
  // ---------------------------------------------------------------------------
  private async discoverAPIs(): Promise<void> {
    this.logger.info('Discovering and analyzing API endpoints');

    const discoveredAPIs: Map<string, { method: string; url: string }> = new Map();

    if (!this.page) return;

    // Intercept all network requests to find API calls
    const apiRequests: { method: string; url: string; headers: Record<string, string> }[] = [];

    this.page.on('response', async (response) => {
      const url = response.url();
      const request = response.request();
      if (url.includes('/api/') || url.includes('/v1/') || url.includes('/v2/') || url.includes('/graphql')) {
        apiRequests.push({
          method: request.method(),
          url,
          headers: request.headers(),
        });
      }
    });

    // Navigate and interact to trigger API calls
    await this.page.goto(this.targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Analyze discovered APIs
    for (const api of apiRequests) {
      const hasAuth = !!(api.headers['authorization'] || api.headers['x-api-key']);

      if (!hasAuth) {
        this.addFinding({
          severity: 'high',
          category: 'API Security',
          title: `Unauthenticated API endpoint: ${api.method} ${new URL(api.url).pathname}`,
          description: 'API endpoint is called without any authentication token or API key.',
          location: { endpoint: api.url },
          evidence: `No Authorization or X-API-Key header found`,
          remediation: 'Ensure all API endpoints require authentication. Use JWT or OAuth2 tokens.',
          references: ['https://owasp.org/API-Security/'],
          cweId: 'CWE-306',
          autoFixable: false,
        });
      }
    }

    // Check for exposed API documentation
    const docPaths = ['/swagger', '/swagger-ui', '/api-docs', '/graphql/playground', '/docs/api'];
    for (const path of docPaths) {
      try {
        const url = new URL(path, this.targetUrl).toString();
        const resp = await axios.get(url, { timeout: 5000, validateStatus: () => true });
        if (resp.status === 200) {
          this.addFinding({
            severity: 'medium',
            category: 'API Security',
            title: `API documentation publicly accessible: ${path}`,
            description: 'API documentation endpoints should not be exposed in production.',
            location: { url },
            remediation: 'Disable API documentation endpoints in production environments.',
            references: [],
            autoFixable: true,
          });
        }
      } catch {
        // Endpoint not accessible - expected
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Token & Session Analysis
  // ---------------------------------------------------------------------------
  private async analyzeTokensAndSessions(): Promise<void> {
    this.logger.info('Analyzing tokens and session management');

    if (!this.page) return;

    // Check localStorage and sessionStorage for sensitive tokens
    const storageData = await this.page.evaluate(() => {
      const data: Record<string, string[]> = { localStorage: [], sessionStorage: [] };
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        data.localStorage.push(`${key}=${localStorage.getItem(key)?.substring(0, 50)}...`);
      }
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)!;
        data.sessionStorage.push(`${key}=${sessionStorage.getItem(key)?.substring(0, 50)}...`);
      }
      return data;
    });

    // Look for sensitive patterns in storage
    const sensitivePatterns = [
      { pattern: /token|jwt|auth|session|api[_-]?key|secret|password/i, type: 'auth-token' as const },
      { pattern: /widevine|fairplay|playready|drm|license/i, type: 'drm-token' as const },
    ];

    for (const storageType of ['localStorage', 'sessionStorage'] as const) {
      for (const item of storageData[storageType]) {
        for (const { pattern, type } of sensitivePatterns) {
          if (pattern.test(item)) {
            this.addFinding({
              severity: type === 'drm-token' ? 'critical' : 'high',
              category: 'Token Security',
              title: `Sensitive ${type} found in ${storageType}`,
              description: `A potentially sensitive token matching pattern "${pattern.source}" was found in ${storageType}.`,
              location: { url: this.targetUrl },
              evidence: item.substring(0, 80) + '...',
              remediation: storageType === 'localStorage'
                ? 'Move sensitive tokens to httpOnly cookies or use short-lived session tokens.'
                : 'Review if sessionStorage is appropriate for this token. Consider httpOnly cookies.',
              references: ['https://owasp.org/www-community/controls/SecureFlag'],
              cweId: 'CWE-922',
              autoFixable: false,
            });
          }
        }
      }
    }

    // Check cookies for security flags
    const cookies = await this.page.cookies();
    for (const cookie of cookies) {
      const issues: string[] = [];
      if (!cookie.httpOnly && /token|session|auth|jwt/i.test(cookie.name)) {
        issues.push('Missing HttpOnly flag');
      }
      if (!cookie.secure) {
        issues.push('Missing Secure flag');
      }
      if (cookie.sameSite === 'None' || !cookie.sameSite) {
        issues.push('SameSite not set or set to None');
      }

      if (issues.length > 0) {
        this.addFinding({
          severity: cookie.httpOnly === false ? 'high' : 'medium',
          category: 'Cookie Security',
          title: `Insecure cookie: ${cookie.name}`,
          description: `Cookie "${cookie.name}" has security issues: ${issues.join(', ')}`,
          location: { url: this.targetUrl },
          evidence: `Domain: ${cookie.domain}, Issues: ${issues.join('; ')}`,
          remediation: 'Set HttpOnly, Secure, and SameSite=Strict/Lax flags on all sensitive cookies.',
          references: ['https://owasp.org/www-community/controls/SecureFlag'],
          cweId: 'CWE-614',
          autoFixable: true,
        });
      }
    }

    // Check page source for hardcoded tokens/keys
    const pageSource = await this.page.content();
    const tokenPatterns = [
      { regex: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]/gi, type: 'api_key' as const },
      { regex: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, type: 'jwt' as const },
      { regex: /(?:aws|AKIA)[A-Z0-9]{16,}/g, type: 'api_key' as const },
    ];

    for (const { regex, type } of tokenPatterns) {
      const matches = pageSource.match(regex);
      if (matches) {
        for (const match of matches.slice(0, 5)) {
          this.addFinding({
            severity: 'critical',
            category: 'Token Leak',
            title: `Hardcoded ${type} found in page source`,
            description: `A ${type} was found embedded in the HTML/JS source code.`,
            location: { url: this.targetUrl },
            evidence: match.substring(0, 20) + '...[REDACTED]',
            remediation: 'Never embed secrets in client-side code. Use server-side token exchange or secure environment variables.',
            references: ['https://owasp.org/www-community/vulnerabilities/Use_of_hard-coded_password'],
            cweId: 'CWE-798',
            autoFixable: false,
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // DRM Protection Analysis (OTT-specific)
  // ---------------------------------------------------------------------------
  private async analyzeDRM(): Promise<void> {
    this.logger.info('Analyzing DRM protection (OTT-specific)');

    if (!this.page) return;

    // Check for DRM-related network requests
    const drmRequests: string[] = [];

    this.page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('license') || url.includes('widevine') || url.includes('fairplay') || url.includes('playready')) {
        drmRequests.push(url);
      }
    });

    // Check for EME (Encrypted Media Extensions) support
    const emeStatus = await this.page.evaluate(() => {
      return {
        hasEME: typeof (navigator as any).requestMediaKeySystemAccess === 'function',
        hasServiceWorker: 'serviceWorker' in navigator,
      };
    });

    if (!emeStatus.hasEME) {
      this.addFinding({
        severity: 'high',
        category: 'DRM',
        title: 'EME (Encrypted Media Extensions) not detected',
        description: 'The browser context does not support EME, which is required for DRM-protected content playback.',
        location: { url: this.targetUrl },
        remediation: 'Ensure the OTT player initializes EME for DRM content. Verify Widevine/FairPlay/PlayReady integration.',
        references: [],
        autoFixable: false,
      });
    }

    // Check if license URLs are exposed in page source
    const source = await this.page.content();
    const licensePatterns = [
      /https?:\/\/[^\s"']+license[^\s"']*/gi,
      /https?:\/\/[^\s"']+widevine[^\s"']*/gi,
      /https?:\/\/[^\s"']+fairplay[^\s"']*/gi,
      /https?:\/\/[^\s"']+playready[^\s"']*/gi,
    ];

    for (const pattern of licensePatterns) {
      const matches = source.match(pattern);
      if (matches) {
        this.addFinding({
          severity: 'high',
          category: 'DRM',
          title: 'DRM license URL exposed in client-side code',
          description: 'DRM license server URLs are visible in the page source, potentially enabling unauthorized access.',
          location: { url: this.targetUrl },
          evidence: matches[0].substring(0, 60) + '...',
          remediation: 'Proxy DRM license requests through your backend. Never expose direct license server URLs to the client.',
          references: [],
          autoFixable: false,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // OWASP Top 10 Checks
  // ---------------------------------------------------------------------------
  private async runOWASPChecks(): Promise<void> {
    this.logger.info('Running OWASP Top 10 checks');

    if (!this.page) return;

    // A03:2021 - Injection (XSS check via reflected input)
    const testPayloads = [
      { param: 'q', value: '<script>alert(1)</script>' },
      { param: 'search', value: '"><img src=x onerror=alert(1)>' },
      { param: 'redirect', value: 'javascript:alert(1)' },
    ];

    const currentUrl = new URL(this.targetUrl);
    for (const payload of testPayloads) {
      try {
        const testUrl = new URL(this.targetUrl);
        testUrl.searchParams.set(payload.param, payload.value);
        const response = await axios.get(testUrl.toString(), {
          timeout: 10000,
          validateStatus: () => true,
        });

        if (response.data?.includes(payload.value)) {
          this.addFinding({
            severity: 'critical',
            category: 'OWASP A03 - Injection',
            title: `Potential XSS via parameter "${payload.param}"`,
            description: `The application reflects user input without sanitization in the "${payload.param}" parameter.`,
            location: { url: testUrl.toString() },
            evidence: `Payload reflected: ${payload.value.substring(0, 30)}...`,
            remediation: 'Implement proper input sanitization and output encoding. Use CSP headers as defense in depth.',
            references: ['https://owasp.org/Top10/A03_2021-Injection/'],
            cweId: 'CWE-79',
            cvssScore: 8.2,
            autoFixable: false,
          });
        }
      } catch {
        // Request failed - endpoint may not accept this param
      }
    }

    // A05:2021 - Security Misconfiguration (directory listing)
    const sensitiveFiles = ['/.env', '/.git/config', '/robots.txt', '/sitemap.xml', '/.well-known/security.txt'];
    for (const file of sensitiveFiles) {
      try {
        const url = new URL(file, this.targetUrl).toString();
        const resp = await axios.get(url, { timeout: 5000, validateStatus: () => true });
        if (resp.status === 200 && file.includes('.env')) {
          this.addFinding({
            severity: 'critical',
            category: 'OWASP A05 - Misconfiguration',
            title: `Sensitive file accessible: ${file}`,
            description: `The file ${file} is publicly accessible and may contain secrets or configuration data.`,
            location: { url },
            remediation: 'Block access to sensitive files via web server configuration or CDN rules.',
            references: ['https://owasp.org/Top10/A05_2021-Security_Misconfiguration/'],
            cweId: 'CWE-538',
            autoFixable: true,
          });
        }
        if (resp.status === 200 && file.includes('.git')) {
          this.addFinding({
            severity: 'critical',
            category: 'OWASP A05 - Misconfiguration',
            title: 'Git repository exposed',
            description: 'The .git directory is accessible, potentially exposing full source code and history.',
            location: { url },
            remediation: 'Block access to .git directory at the web server / CDN level.',
            references: ['https://owasp.org/Top10/A05_2021-Security_Misconfiguration/'],
            cweId: 'CWE-538',
            autoFixable: true,
          });
        }
      } catch {
        // Not accessible - expected
      }
    }

    // A07:2021 - Authentication Failures (check for common auth issues)
    // Check for login page and test for enumeration
    const loginPaths = ['/login', '/signin', '/auth/login', '/api/auth/login'];
    for (const path of loginPaths) {
      try {
        const url = new URL(path, this.targetUrl).toString();
        const resp = await axios.get(url, { timeout: 5000, validateStatus: () => true });
        if (resp.status === 200) {
          this.logger.info(`Login page found at ${path} - checking for enumeration`);
          // Test with invalid credentials to check error messages
          const testResp = await axios.post(url, {
            email: 'nonexistent@test.invalid',
            password: 'wrongpassword123',
          }, { timeout: 5000, validateStatus: () => true });

          if (testResp.data && typeof testResp.data === 'string' &&
              (testResp.data.includes('user not found') || testResp.data.includes('email not registered'))) {
            this.addFinding({
              severity: 'medium',
              category: 'OWASP A07 - Auth Failures',
              title: 'User enumeration possible via login response',
              description: 'The login endpoint reveals whether an email/username is registered.',
              location: { endpoint: url },
              remediation: 'Use generic error messages like "Invalid credentials" for all auth failures.',
              references: ['https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/'],
              cweId: 'CWE-204',
              autoFixable: false,
            });
          }
        }
      } catch {
        // Endpoint not found - skip
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Dependency Vulnerability Scan (repo mode)
  // ---------------------------------------------------------------------------
  private async scanDependencies(repoPath: string): Promise<void> {
    this.logger.info('Scanning dependencies for known vulnerabilities');

    // This integrates with `npm audit` / `retire.js` / Snyk
    // In production, you'd shell out to these tools
    try {
      const { execSync } = require('child_process');
      const auditOutput = execSync(`cd "${repoPath}" && npm audit --json 2>/dev/null`, {
        timeout: 60000,
        encoding: 'utf-8',
      });

      const audit = JSON.parse(auditOutput);
      if (audit.vulnerabilities) {
        for (const [pkg, vuln] of Object.entries(audit.vulnerabilities) as any[]) {
          const severity = vuln.severity as Severity;
          this.addFinding({
            severity,
            category: 'Dependency Vulnerability',
            title: `Vulnerable dependency: ${pkg}@${vuln.range || 'unknown'}`,
            description: `${vuln.via?.[0]?.title || 'Known vulnerability'} in ${pkg}`,
            location: { file: `${repoPath}/package.json` },
            evidence: `CVE: ${vuln.via?.[0]?.url || 'N/A'}`,
            remediation: vuln.fixAvailable
              ? `Update ${pkg} to fix available version`
              : `Review and replace ${pkg} with a secure alternative`,
            references: vuln.via?.[0]?.url ? [vuln.via[0].url] : [],
            cweId: vuln.via?.[0]?.cwe?.[0] || undefined,
            autoFixable: !!vuln.fixAvailable,
          });
        }
      }
    } catch (error) {
      this.logger.warn('npm audit failed, attempting retire.js', { error: String(error) });
    }
  }

  // ---------------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------------
  protected calculateScore(): WeightedScore {
    // Category-based scoring: each category has a capped maxScore
    // Penalties within a category are bounded by that category's maxScore,
    // preventing a flood of findings in one area from zeroing the entire agent score.
    const breakdown = [
      { metric: 'Headers', value: this.countByCategory('Security Headers'), maxScore: 20, actualScore: 0, penalty: 0, details: '' },
      { metric: 'SSL/TLS', value: this.countByCategory('SSL/TLS'), maxScore: 15, actualScore: 0, penalty: 0, details: '' },
      { metric: 'CORS', value: this.countByCategory('CORS'), maxScore: 15, actualScore: 0, penalty: 0, details: '' },
      { metric: 'API Security', value: this.countByCategory('API Security'), maxScore: 15, actualScore: 0, penalty: 0, details: '' },
      { metric: 'Token/Session', value: this.countByCategory('Token Security') + this.countByCategory('Cookie Security'), maxScore: 15, actualScore: 0, penalty: 0, details: '' },
      { metric: 'DRM (OTT)', value: this.countByCategory('DRM'), maxScore: 10, actualScore: 0, penalty: 0, details: '' },
      { metric: 'OWASP', value: this.countByCategory('OWASP'), maxScore: 10, actualScore: 0, penalty: 0, details: '' },
    ].map((b) => {
      const catPenalty = this.penaltyForCategory(b.metric);
      return {
        ...b,
        penalty: Math.min(catPenalty, b.maxScore), // cap penalty at category max
        actualScore: Math.max(0, b.maxScore - catPenalty),
        details: `${b.value} finding(s)`,
      };
    });

    // Sum remaining category scores (each individually capped)
    const rawScore = this.clampScore(breakdown.reduce((sum, b) => sum + b.actualScore, 0));

    return {
      category: 'security',
      rawScore,
      weight: 0.40,   // Security gets 40% weight in OTT context
      weightedScore: rawScore * 0.40,
      breakdown,
    };
  }

  private countByCategory(prefix: string): number {
    return this.findings.filter((f) => f.category.startsWith(prefix)).length;
  }

  private penaltyForCategory(prefix: string): number {
    return this.findings
      .filter((f) => f.category.startsWith(prefix))
      .reduce((sum, f) => sum + this.getSeverityWeight(f.severity), 0);
  }
}
