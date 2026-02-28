// ============================================================================
// Performance Agent - Lighthouse, Core Web Vitals, Player Metrics, CDN
// ============================================================================

import puppeteer, { Browser, Page } from 'puppeteer';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { BaseAgent } from '../../core/base-agent';
import {
  ScanConfig, WeightedScore, Severity, Platform,
  CoreWebVitals, PlayerMetrics, CDNMetrics, ResourceMetrics,
} from '../../types';

// Thresholds for OTT KPI targets
const THRESHOLDS = {
  lighthouseScore: 95,
  lcp: 2500,       // ms - must be <2.5s
  fcp: 1800,       // ms - must be <1.8s
  cls: 0.1,        // must be <0.1
  ttfb: 800,       // ms - must be <800ms
  fid: 100,        // ms
  inp: 200,        // ms
  playerStartup: 3000,  // ms - OTT specific
  bufferRatio: 0.02,    // 2% max
  drmLicense: 2000,     // ms
  timeToFirstFrame: 4000, // ms
};

export class PerformanceAgent extends BaseAgent {
  private browser?: Browser;
  private chrome?: chromeLauncher.LaunchedChrome;

  constructor() {
    super('performance');
  }

  protected async setup(config: ScanConfig): Promise<void> {
    this.chrome = await chromeLauncher.launch({
      chromeFlags: [
        '--headless',
        '--no-sandbox',
        '--disable-gpu',
        ...(config.platform === 'mweb' ? ['--window-size=375,812'] : ['--window-size=1440,900']),
      ],
    });
  }

  protected async scan(config: ScanConfig): Promise<void> {
    const url = config.target.url!;
    const platforms: Platform[] = config.platform === 'both' ? ['desktop', 'mweb'] : [config.platform];

    for (const platform of platforms) {
      this.logger.info(`Running performance scan for ${platform}`);

      // Phase 1: Lighthouse audit
      await this.runLighthouse(url, platform);

      // Phase 2: Core Web Vitals (real measurement)
      await this.measureCoreWebVitals(url, platform);

      // Phase 3: OTT Player Metrics
      await this.measurePlayerMetrics(url, platform);

      // Phase 4: CDN & Resource Analysis
      await this.analyzeCDN(url);
      await this.analyzeResources(url);
    }
  }

  protected async teardown(): Promise<void> {
    if (this.chrome) {
      await this.chrome.kill();
    }
  }

  // ---------------------------------------------------------------------------
  // Lighthouse Audit
  // ---------------------------------------------------------------------------
  private async runLighthouse(url: string, platform: Platform): Promise<void> {
    this.logger.info(`Running Lighthouse for ${platform}`);

    if (!this.chrome) return;

    const config = {
      extends: 'lighthouse:default',
      settings: {
        formFactor: platform === 'mweb' ? 'mobile' as const : 'desktop' as const,
        throttling: platform === 'mweb'
          ? { rttMs: 150, throughputKbps: 1638.4, cpuSlowdownMultiplier: 4 }     // 4G sim
          : { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 },       // Desktop
        screenEmulation: platform === 'mweb'
          ? { mobile: true, width: 375, height: 812, deviceScaleFactor: 3 }
          : { mobile: false, width: 1440, height: 900, deviceScaleFactor: 1 },
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      },
    };

    try {
      const result = await lighthouse(url, {
        port: this.chrome.port,
        output: 'json',
        logLevel: 'error',
      }, config);

      if (!result?.lhr) return;

      const lhr = result.lhr;
      const perfScore = (lhr.categories.performance?.score || 0) * 100;

      // Check against target
      if (perfScore < THRESHOLDS.lighthouseScore) {
        this.addFinding({
          severity: perfScore < 50 ? 'critical' : perfScore < 80 ? 'high' : 'medium',
          category: 'Lighthouse',
          title: `Lighthouse performance score: ${perfScore} (target: ${THRESHOLDS.lighthouseScore})`,
          description: `${platform} Lighthouse performance score is ${perfScore}/100, below the target of ${THRESHOLDS.lighthouseScore}.`,
          location: { url },
          evidence: JSON.stringify({
            performance: perfScore,
            accessibility: (lhr.categories.accessibility?.score || 0) * 100,
            bestPractices: (lhr.categories['best-practices']?.score || 0) * 100,
            seo: (lhr.categories.seo?.score || 0) * 100,
          }),
          remediation: this.generateLighthouseRemediation(lhr),
          references: [],
          autoFixable: false,
        });
      }

      // Extract individual audit failures
      const failedAudits = Object.values(lhr.audits)
        .filter((audit: any) => audit.score !== null && audit.score < 0.9 && audit.scoreDisplayMode === 'numeric')
        .sort((a: any, b: any) => (a.score || 0) - (b.score || 0))
        .slice(0, 10);

      for (const audit of failedAudits as any[]) {
        this.addFinding({
          severity: audit.score < 0.5 ? 'high' : 'medium',
          category: 'Lighthouse Audit',
          title: `[${platform}] ${audit.title}: ${audit.displayValue || 'Failed'}`,
          description: audit.description?.substring(0, 200) || '',
          location: { url },
          evidence: `Score: ${Math.round((audit.score || 0) * 100)}/100`,
          remediation: audit.description || 'Review Lighthouse audit details for specific recommendations.',
          references: [],
          autoFixable: false,
        });
      }
    } catch (error) {
      this.logger.error('Lighthouse scan failed', { error: String(error) });
    }
  }

  // ---------------------------------------------------------------------------
  // Core Web Vitals Measurement
  // ---------------------------------------------------------------------------
  private async measureCoreWebVitals(url: string, platform: Platform): Promise<void> {
    this.logger.info('Measuring Core Web Vitals');

    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        ...(platform === 'mweb' ? ['--window-size=375,812'] : ['--window-size=1440,900']),
      ],
    });

    try {
      const page = await browser.newPage();

      if (platform === 'mweb') {
        await page.setViewport({ width: 375, height: 812, isMobile: true, deviceScaleFactor: 3 });
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
      } else {
        await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
      }

      // Inject web-vitals measurement
      await page.evaluateOnNewDocument(() => {
        (window as any).__webVitals = {};
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'largest-contentful-paint') {
              (window as any).__webVitals.lcp = entry.startTime;
            }
            if (entry.entryType === 'first-input') {
              (window as any).__webVitals.fid = (entry as any).processingStart - entry.startTime;
            }
            if (entry.entryType === 'layout-shift' && !(entry as any).hadRecentInput) {
              (window as any).__webVitals.cls = ((window as any).__webVitals.cls || 0) + (entry as any).value;
            }
          }
        });
        observer.observe({ type: 'largest-contentful-paint', buffered: true });
        observer.observe({ type: 'first-input', buffered: true });
        observer.observe({ type: 'layout-shift', buffered: true });
      });

      const startTime = Date.now();
      const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      const ttfb = Date.now() - startTime;

      // Wait for metrics to stabilize
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Collect paint timing
      const paintTimings = await page.evaluate(() => {
        const entries = performance.getEntriesByType('paint');
        return {
          fcp: entries.find((e) => e.name === 'first-contentful-paint')?.startTime || 0,
        };
      });

      // Collect web vitals
      const webVitals = await page.evaluate(() => (window as any).__webVitals || {});

      // Assess each metric
      const metrics: { name: string; value: number; threshold: number; unit: string }[] = [
        { name: 'LCP', value: webVitals.lcp || 0, threshold: THRESHOLDS.lcp, unit: 'ms' },
        { name: 'FCP', value: paintTimings.fcp, threshold: THRESHOLDS.fcp, unit: 'ms' },
        { name: 'CLS', value: webVitals.cls || 0, threshold: THRESHOLDS.cls, unit: '' },
        { name: 'FID', value: webVitals.fid || 0, threshold: THRESHOLDS.fid, unit: 'ms' },
        { name: 'TTFB', value: ttfb, threshold: THRESHOLDS.ttfb, unit: 'ms' },
      ];

      for (const metric of metrics) {
        const isOverThreshold = metric.name === 'CLS'
          ? metric.value > metric.threshold
          : metric.value > metric.threshold;

        if (isOverThreshold && metric.value > 0) {
          const severity: Severity = metric.value > metric.threshold * 2 ? 'critical'
            : metric.value > metric.threshold * 1.5 ? 'high' : 'medium';

          this.addFinding({
            severity,
            category: 'Core Web Vitals',
            title: `[${platform}] ${metric.name}: ${metric.value.toFixed(metric.name === 'CLS' ? 3 : 0)}${metric.unit} (target: <${metric.threshold}${metric.unit})`,
            description: `${metric.name} exceeds the target threshold on ${platform}. Current: ${metric.value.toFixed(2)}${metric.unit}, Target: <${metric.threshold}${metric.unit}`,
            location: { url },
            evidence: `Measured ${metric.name}: ${metric.value}${metric.unit}`,
            remediation: this.getWebVitalRemediation(metric.name),
            references: ['https://web.dev/vitals/'],
            autoFixable: false,
          });
        }
      }
    } finally {
      await browser.close();
    }
  }

  // ---------------------------------------------------------------------------
  // OTT Player Metrics
  // ---------------------------------------------------------------------------
  private async measurePlayerMetrics(url: string, platform: Platform): Promise<void> {
    this.logger.info('Measuring OTT player metrics');

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Try to find and interact with a video player
      const playerMetrics = await page.evaluate(() => {
        const video = document.querySelector('video');
        if (!video) return null;

        return {
          hasVideo: true,
          readyState: video.readyState,
          networkState: video.networkState,
          currentSrc: video.currentSrc ? 'present' : 'none',
          duration: video.duration,
          buffered: video.buffered.length > 0 ? video.buffered.end(0) : 0,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          // Check for common player SDKs
          hasShakaPlayer: !!(window as any).shaka,
          hasHlsJs: !!(window as any).Hls,
          hasDashJs: !!(window as any).dashjs,
          hasBitmovin: !!(window as any).bitmovin,
        };
      });

      if (!playerMetrics?.hasVideo) {
        this.logger.info('No video player found on landing page - skipping player metrics');
        return;
      }

      // Monitor player startup time
      const startupTime = await page.evaluate(() => {
        return new Promise<number>((resolve) => {
          const video = document.querySelector('video');
          if (!video) return resolve(0);

          const start = performance.now();
          if (video.readyState >= 3) {
            resolve(0); // Already ready
            return;
          }

          const timeout = setTimeout(() => resolve(10000), 10000);
          video.addEventListener('canplay', () => {
            clearTimeout(timeout);
            resolve(performance.now() - start);
          }, { once: true });

          // Try to play
          video.play().catch(() => {});
        });
      });

      if (startupTime > THRESHOLDS.playerStartup) {
        this.addFinding({
          severity: startupTime > 6000 ? 'critical' : 'high',
          category: 'Player Performance',
          title: `[${platform}] Player startup delay: ${startupTime.toFixed(0)}ms (target: <${THRESHOLDS.playerStartup}ms)`,
          description: `Video player takes ${startupTime.toFixed(0)}ms to reach playable state, exceeding the ${THRESHOLDS.playerStartup}ms target.`,
          location: { url },
          evidence: `Startup time: ${startupTime}ms`,
          remediation: 'Optimize player initialization: preload manifest, use server-side ad insertion, preconnect to CDN, lazy-load non-critical player plugins.',
          references: [],
          autoFixable: false,
        });
      }

      // Check for ABR (Adaptive Bitrate) configuration
      const abrConfig = await page.evaluate(() => {
        // Check Shaka Player ABR
        if ((window as any).shaka) {
          const player = (document.querySelector('video') as any)?.player;
          if (player) {
            return { engine: 'shaka', config: 'detected' };
          }
        }
        // Check hls.js ABR
        if ((window as any).Hls) {
          return { engine: 'hls.js', config: 'detected' };
        }
        return null;
      });

      if (!abrConfig) {
        this.addFinding({
          severity: 'medium',
          category: 'Player Performance',
          title: 'No ABR streaming engine detected',
          description: 'Could not detect an adaptive bitrate streaming engine (Shaka, hls.js, dash.js).',
          location: { url },
          remediation: 'Implement ABR streaming for optimal video delivery. Use Shaka Player or hls.js for HLS/DASH content.',
          references: [],
          autoFixable: false,
        });
      }
    } finally {
      await browser.close();
    }
  }

  // ---------------------------------------------------------------------------
  // CDN Analysis
  // ---------------------------------------------------------------------------
  private async analyzeCDN(url: string): Promise<void> {
    this.logger.info('Analyzing CDN configuration');

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

    try {
      const page = await browser.newPage();

      const resourceTimings: { url: string; duration: number; transferSize: number; cached: boolean }[] = [];

      page.on('response', async (response) => {
        const headers = response.headers();
        const url = response.url();

        // Check cache headers
        const cacheControl = headers['cache-control'] || '';
        const cdnHeaders = headers['x-cache'] || headers['x-cdn'] || headers['cf-cache-status'] || '';

        if (url.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff2?|ttf|mp4|m3u8|ts)$/i)) {
          if (!cacheControl || cacheControl.includes('no-cache') || cacheControl.includes('no-store')) {
            this.addFinding({
              severity: 'medium',
              category: 'CDN Performance',
              title: `Missing/weak cache headers: ${new URL(url).pathname.split('/').pop()}`,
              description: `Static resource lacks proper cache-control headers: "${cacheControl || 'missing'}"`,
              location: { url },
              evidence: `Cache-Control: ${cacheControl || 'not set'}`,
              remediation: 'Set aggressive cache headers for static assets: Cache-Control: public, max-age=31536000, immutable',
              references: [],
              autoFixable: true,
            });
          }

          // Check compression
          const encoding = headers['content-encoding'];
          const contentType = headers['content-type'] || '';
          if (!encoding && (contentType.includes('javascript') || contentType.includes('css') || contentType.includes('html'))) {
            this.addFinding({
              severity: 'medium',
              category: 'CDN Performance',
              title: `Uncompressed resource: ${new URL(url).pathname.split('/').pop()}`,
              description: 'Text-based resource is served without compression (gzip/brotli).',
              location: { url },
              evidence: `Content-Type: ${contentType}, Content-Encoding: ${encoding || 'none'}`,
              remediation: 'Enable Brotli (preferred) or gzip compression for all text-based assets at the CDN level.',
              references: [],
              autoFixable: true,
            });
          }
        }
      });

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    } finally {
      await browser.close();
    }
  }

  // ---------------------------------------------------------------------------
  // Resource Analysis
  // ---------------------------------------------------------------------------
  private async analyzeResources(url: string): Promise<void> {
    this.logger.info('Analyzing resource loading');

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

    try {
      const page = await browser.newPage();

      const resources: { url: string; type: string; size: number }[] = [];

      page.on('response', async (response) => {
        try {
          const buffer = await response.buffer();
          resources.push({
            url: response.url(),
            type: response.headers()['content-type'] || 'unknown',
            size: buffer.length,
          });
        } catch {
          // Some responses can't be buffered
        }
      });

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      const totalSize = resources.reduce((sum, r) => sum + r.size, 0);
      const jsSize = resources.filter((r) => r.type.includes('javascript')).reduce((sum, r) => sum + r.size, 0);
      const cssSize = resources.filter((r) => r.type.includes('css')).reduce((sum, r) => sum + r.size, 0);
      const imgSize = resources.filter((r) => r.type.includes('image')).reduce((sum, r) => sum + r.size, 0);

      // Total page weight check
      if (totalSize > 5_000_000) { // 5MB
        this.addFinding({
          severity: totalSize > 10_000_000 ? 'critical' : 'high',
          category: 'Resource Size',
          title: `Total page weight: ${(totalSize / 1_000_000).toFixed(1)}MB`,
          description: `Total page weight of ${(totalSize / 1_000_000).toFixed(1)}MB exceeds recommended 5MB limit. JS: ${(jsSize / 1_000_000).toFixed(1)}MB, CSS: ${(cssSize / 1_000).toFixed(0)}KB, Images: ${(imgSize / 1_000_000).toFixed(1)}MB`,
          location: { url },
          evidence: `Total: ${totalSize}, JS: ${jsSize}, CSS: ${cssSize}, Images: ${imgSize}`,
          remediation: 'Implement code splitting, tree-shaking, lazy loading for images, and optimize asset delivery.',
          references: [],
          autoFixable: false,
        });
      }

      // Check for render-blocking resources
      const renderBlocking = await page.evaluate(() => {
        const blocking: string[] = [];
        document.querySelectorAll('link[rel="stylesheet"]').forEach((el) => {
          if (!el.hasAttribute('media') || el.getAttribute('media') === 'all') {
            blocking.push(el.getAttribute('href') || 'inline');
          }
        });
        document.querySelectorAll('script:not([async]):not([defer]):not([type="module"])').forEach((el) => {
          if (el.getAttribute('src')) {
            blocking.push(el.getAttribute('src')!);
          }
        });
        return blocking;
      });

      if (renderBlocking.length > 3) {
        this.addFinding({
          severity: 'high',
          category: 'Render Blocking',
          title: `${renderBlocking.length} render-blocking resources detected`,
          description: `Found ${renderBlocking.length} render-blocking CSS/JS resources that delay first paint.`,
          location: { url },
          evidence: renderBlocking.slice(0, 5).join(', '),
          remediation: 'Use async/defer for scripts, inline critical CSS, and load non-critical CSS asynchronously.',
          references: ['https://web.dev/render-blocking-resources/'],
          autoFixable: false,
        });
      }
    } finally {
      await browser.close();
    }
  }

  // ---------------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------------
  protected calculateScore(): WeightedScore {
    // Category-based scoring with capped penalties per category
    const breakdown = [
      { metric: 'Lighthouse Score', value: 0, maxScore: 25, actualScore: 0, penalty: 0, details: '' },
      { metric: 'Core Web Vitals', value: 0, maxScore: 25, actualScore: 0, penalty: 0, details: '' },
      { metric: 'Player Metrics', value: 0, maxScore: 20, actualScore: 0, penalty: 0, details: '' },
      { metric: 'CDN Efficiency', value: 0, maxScore: 15, actualScore: 0, penalty: 0, details: '' },
      { metric: 'Resource Optimization', value: 0, maxScore: 15, actualScore: 0, penalty: 0, details: '' },
    ].map((b) => {
      const matchingFindings = this.findings.filter((f) => f.category.includes(b.metric.split(' ')[0]));
      const catPenalty = matchingFindings.reduce((sum, f) => sum + this.getSeverityWeight(f.severity), 0);
      return {
        ...b,
        penalty: Math.min(catPenalty, b.maxScore), // cap penalty at category max
        actualScore: Math.max(0, b.maxScore - catPenalty),
        details: `${matchingFindings.length} finding(s)`,
      };
    });

    // Sum remaining category scores (each individually capped)
    const rawScore = this.clampScore(breakdown.reduce((sum, b) => sum + b.actualScore, 0));

    return {
      category: 'performance',
      rawScore,
      weight: 0.35,    // Performance gets 35% weight
      weightedScore: rawScore * 0.35,
      breakdown,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  private getWebVitalRemediation(metric: string): string {
    const remediations: Record<string, string> = {
      LCP: 'Optimize largest content element: preload hero images, use CDN, inline critical CSS, optimize server response time. For OTT: preload poster images, optimize carousel hero banners.',
      FCP: 'Reduce server response time, eliminate render-blocking resources, inline critical CSS, preconnect to required origins.',
      CLS: 'Set explicit dimensions on images/videos, avoid dynamically injected content above the fold, use CSS contain. For OTT: set fixed dimensions on content thumbnails and carousels.',
      FID: 'Break up long tasks, use web workers for heavy computation, defer non-critical JS. For OTT: defer player SDK initialization.',
      TTFB: 'Optimize server response: use CDN edge caching, optimize database queries, implement HTTP/2 server push, use stale-while-revalidate.',
    };
    return remediations[metric] || 'Review and optimize this metric.';
  }

  private generateLighthouseRemediation(lhr: any): string {
    const opportunities = Object.values(lhr.audits)
      .filter((a: any) => a.details?.type === 'opportunity' && a.details?.overallSavingsMs > 100)
      .sort((a: any, b: any) => (b.details?.overallSavingsMs || 0) - (a.details?.overallSavingsMs || 0))
      .slice(0, 3)
      .map((a: any) => `${a.title} (potential savings: ${(a.details.overallSavingsMs / 1000).toFixed(1)}s)`);

    return opportunities.length > 0
      ? `Top opportunities: ${opportunities.join('; ')}`
      : 'Review Lighthouse report for specific optimization opportunities.';
  }
}
