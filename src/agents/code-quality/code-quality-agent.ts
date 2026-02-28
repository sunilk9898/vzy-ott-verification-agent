// ============================================================================
// Code Quality Agent - Dead Code, Memory Leaks, Async Issues, Anti-patterns
// ============================================================================

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { BaseAgent } from '../../core/base-agent';
import { ScanConfig, WeightedScore, Severity } from '../../types';

// Patterns for OTT-specific anti-patterns
const ANTI_PATTERNS = [
  {
    name: 'Direct DOM manipulation in React/Vue',
    pattern: /document\.(getElementById|querySelector|getElementsBy)/g,
    severity: 'medium' as Severity,
    suggestion: 'Use framework refs instead of direct DOM access for player element binding.',
  },
  {
    name: 'Synchronous XHR',
    pattern: /XMLHttpRequest\(\)[\s\S]*?\.open\([^)]*false/g,
    severity: 'high' as Severity,
    suggestion: 'Use async fetch() or axios for all network requests, especially content manifests.',
  },
  {
    name: 'Console.log in production',
    pattern: /console\.(log|debug|info)\(/g,
    severity: 'low' as Severity,
    suggestion: 'Remove console statements or use a logger with environment-aware log levels.',
  },
  {
    name: 'Hardcoded URLs/endpoints',
    pattern: /['"]https?:\/\/(?!localhost)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^'"]*['"]/g,
    severity: 'medium' as Severity,
    suggestion: 'Use environment variables for all service URLs (API, CDN, DRM license servers).',
  },
  {
    name: 'Missing error boundary',
    pattern: /componentDidCatch|ErrorBoundary/g,
    severity: 'medium' as Severity,
    suggestion: 'Ensure error boundaries wrap player components and content sections.',
    inverse: true,  // Finding is when pattern is NOT found
  },
  {
    name: 'Unbounded array growth',
    pattern: /\.push\([^)]+\)(?![\s\S]{0,100}\.splice|\.shift|\.pop|= \[\]|\.length\s*[<>=])/g,
    severity: 'medium' as Severity,
    suggestion: 'Arrays that grow without bounds can cause memory issues. Add size limits for event logs, analytics buffers.',
  },
  {
    name: 'eval() usage',
    pattern: /\beval\s*\(/g,
    severity: 'critical' as Severity,
    suggestion: 'Never use eval(). It creates XSS vulnerabilities and prevents CSP enforcement.',
  },
  {
    name: 'innerHTML assignment',
    pattern: /\.innerHTML\s*=/g,
    severity: 'high' as Severity,
    suggestion: 'Use textContent or framework rendering. innerHTML enables XSS attacks.',
  },
];

// Memory leak patterns
const MEMORY_LEAK_PATTERNS = [
  {
    name: 'addEventListener without removeEventListener',
    addPattern: /addEventListener\s*\(\s*['"](\w+)['"]/g,
    removePattern: /removeEventListener\s*\(\s*['"](\w+)['"]/g,
    type: 'event-listener' as const,
  },
  {
    name: 'setInterval without clearInterval',
    addPattern: /setInterval\s*\(/g,
    removePattern: /clearInterval\s*\(/g,
    type: 'timer' as const,
  },
  {
    name: 'setTimeout without clearTimeout',
    addPattern: /setTimeout\s*\(/g,
    removePattern: /clearTimeout\s*\(/g,
    type: 'timer' as const,
  },
  {
    name: 'Observable subscription without unsubscribe',
    addPattern: /\.subscribe\s*\(/g,
    removePattern: /\.unsubscribe\s*\(|\.complete\s*\(/g,
    type: 'subscription' as const,
  },
];

export class CodeQualityAgent extends BaseAgent {
  private repoPath = '';
  private sourceFiles: string[] = [];

  constructor() {
    super('code-quality');
  }

  protected async setup(config: ScanConfig): Promise<void> {
    this.repoPath = config.target.repoPath || '';

    if (!this.repoPath) {
      // URL mode: attempt to extract JS/TS from the page
      this.logger.warn('Code quality agent works best in repo mode. URL mode provides limited analysis.');
      return;
    }

    // Discover source files
    this.sourceFiles = this.discoverSourceFiles(this.repoPath);
    this.logger.info(`Discovered ${this.sourceFiles.length} source files for analysis`);
  }

  protected async scan(config: ScanConfig): Promise<void> {
    if (!this.repoPath) {
      await this.scanFromURL(config);
      this.populateMetadata();
      return;
    }

    // Phase 1: Static Analysis (ESLint/Semgrep)
    await this.runStaticAnalysis();

    // Phase 2: Dead Code Detection
    await this.detectDeadCode();

    // Phase 3: Memory Leak Detection
    await this.detectMemoryLeaks();

    // Phase 4: Async Issue Detection
    await this.detectAsyncIssues();

    // Phase 5: Anti-pattern Detection
    await this.detectAntiPatterns();

    // Phase 6: Unhandled Exception Detection
    await this.detectUnhandledExceptions();

    // Phase 7: Complexity Analysis
    await this.analyzeComplexity();

    // Phase 8: Populate structured metadata for dashboard
    this.populateMetadata();
  }

  protected async teardown(): Promise<void> {
    // Cleanup temp files if any
  }

  // ---------------------------------------------------------------------------
  // Static Analysis (ESLint / Semgrep)
  // ---------------------------------------------------------------------------
  private async runStaticAnalysis(): Promise<void> {
    this.logger.info('Running static analysis');

    // ESLint
    try {
      const eslintOutput = execSync(
        `cd "${this.repoPath}" && npx eslint . --ext .js,.jsx,.ts,.tsx --format json --no-error-on-unmatched-pattern 2>/dev/null || true`,
        { timeout: 120000, encoding: 'utf-8', maxBuffer: 50_000_000 },
      );

      const results = JSON.parse(eslintOutput || '[]');
      let totalErrors = 0;
      let totalWarnings = 0;

      for (const file of results) {
        for (const msg of file.messages || []) {
          if (msg.severity === 2) totalErrors++;
          else totalWarnings++;

          // Only report errors and impactful warnings
          if (msg.severity === 2 || (msg.severity === 1 && msg.ruleId?.includes('security'))) {
            this.addFinding({
              severity: msg.severity === 2 ? 'medium' : 'low',
              category: 'Static Analysis',
              title: `ESLint: ${msg.ruleId || 'unknown'} in ${path.basename(file.filePath)}`,
              description: msg.message,
              location: { file: file.filePath, line: msg.line, column: msg.column },
              remediation: `Fix ESLint rule ${msg.ruleId}. ${msg.fix ? 'Auto-fixable with --fix.' : ''}`,
              references: msg.ruleId ? [`https://eslint.org/docs/rules/${msg.ruleId}`] : [],
              autoFixable: !!msg.fix,
            });
          }
        }
      }

      if (totalErrors > 50) {
        this.addFinding({
          severity: 'high',
          category: 'Static Analysis',
          title: `${totalErrors} ESLint errors across codebase`,
          description: `The codebase has ${totalErrors} ESLint errors and ${totalWarnings} warnings, indicating systemic code quality issues.`,
          remediation: 'Run `npx eslint . --fix` for auto-fixable issues. Review and address remaining errors systematically.',
          references: [],
          autoFixable: true,
        });
      }
    } catch (error) {
      this.logger.warn('ESLint analysis failed', { error: String(error) });
    }

    // Semgrep (if available)
    try {
      const semgrepOutput = execSync(
        `cd "${this.repoPath}" && semgrep --config auto --json --quiet 2>/dev/null || true`,
        { timeout: 180000, encoding: 'utf-8', maxBuffer: 50_000_000 },
      );

      if (semgrepOutput) {
        const results = JSON.parse(semgrepOutput);
        for (const result of (results.results || []).slice(0, 50)) {
          this.addFinding({
            severity: result.extra?.severity === 'ERROR' ? 'high' : 'medium',
            category: 'Semgrep',
            title: `${result.check_id}: ${path.basename(result.path)}:${result.start?.line}`,
            description: result.extra?.message || result.check_id,
            location: { file: result.path, line: result.start?.line },
            remediation: result.extra?.fix || 'Review Semgrep finding and apply recommended fix.',
            references: result.extra?.metadata?.references || [],
            cweId: result.extra?.metadata?.cwe?.[0],
            autoFixable: !!result.extra?.fix,
          });
        }
      }
    } catch {
      this.logger.info('Semgrep not available, skipping');
    }
  }

  // ---------------------------------------------------------------------------
  // Dead Code Detection
  // ---------------------------------------------------------------------------
  private async detectDeadCode(): Promise<void> {
    this.logger.info('Detecting dead code');

    for (const file of this.sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      // Detect unused imports (basic heuristic)
      const importRegex = /import\s+(?:{([^}]+)}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
      let match: RegExpExecArray | null;

      while ((match = importRegex.exec(content)) !== null) {
        const imports = (match[1] || match[2]).split(',').map((s) => s.trim().split(' as ').pop()!.trim());
        for (const imported of imports) {
          if (!imported) continue;
          // Count occurrences after the import line
          const importLine = content.substring(0, match.index).split('\n').length;
          const afterImport = lines.slice(importLine).join('\n');
          const usageCount = (afterImport.match(new RegExp(`\\b${imported}\\b`, 'g')) || []).length;

          if (usageCount === 0) {
            this.addFinding({
              severity: 'low',
              category: 'Dead Code',
              title: `Unused import: "${imported}" in ${path.basename(file)}`,
              description: `Import "${imported}" from "${match[3]}" is never used in ${path.basename(file)}.`,
              location: { file, line: importLine },
              remediation: `Remove unused import "${imported}".`,
              references: [],
              autoFixable: true,
            });
          }
        }
      }

      // Detect unreachable code after return/throw
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if ((line.startsWith('return ') || line.startsWith('throw ')) && line.endsWith(';')) {
          // Check if next non-empty line is still in the same block
          for (let j = i + 1; j < lines.length; j++) {
            const nextLine = lines[j].trim();
            if (nextLine === '' || nextLine === '}' || nextLine.startsWith('//') || nextLine.startsWith('case ')) break;
            if (nextLine.length > 0) {
              this.addFinding({
                severity: 'low',
                category: 'Dead Code',
                title: `Unreachable code after return/throw in ${path.basename(file)}:${i + 1}`,
                description: `Code at line ${j + 1} is unreachable due to return/throw at line ${i + 1}.`,
                location: { file, line: j + 1 },
                remediation: 'Remove unreachable code.',
                references: [],
                autoFixable: true,
              });
              break;
            }
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Memory Leak Detection
  // ---------------------------------------------------------------------------
  private async detectMemoryLeaks(): Promise<void> {
    this.logger.info('Detecting potential memory leaks');

    for (const file of this.sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');

      for (const pattern of MEMORY_LEAK_PATTERNS) {
        const adds = [...content.matchAll(pattern.addPattern)];
        const removes = [...content.matchAll(pattern.removePattern)];

        // Heuristic: if adds > removes significantly, likely a leak
        if (adds.length > 0 && removes.length === 0) {
          this.addFinding({
            severity: 'high',
            category: 'Memory Leak',
            title: `${pattern.name}: ${path.basename(file)}`,
            description: `Found ${adds.length} ${pattern.type} creation(s) without corresponding cleanup in ${path.basename(file)}.`,
            location: {
              file,
              line: content.substring(0, adds[0].index).split('\n').length,
            },
            remediation: `Add cleanup logic (removeEventListener/clearInterval/unsubscribe) in component unmount/cleanup lifecycle.`,
            references: [],
            autoFixable: false,
          });
        }
      }

      // OTT-specific: Check for player instance cleanup
      if (content.includes('new Hls(') || content.includes('shaka.Player(') || content.includes('new dashjs')) {
        if (!content.includes('destroy()') && !content.includes('dispose()')) {
          this.addFinding({
            severity: 'high',
            category: 'Memory Leak',
            title: `Player instance not destroyed: ${path.basename(file)}`,
            description: 'Video player SDK instance is created but never destroyed, causing memory leaks on navigation.',
            location: { file },
            remediation: 'Call player.destroy()/dispose() in component cleanup. For React: useEffect cleanup. For Vue: beforeUnmount.',
            references: [],
            autoFixable: false,
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Async Issue Detection
  // ---------------------------------------------------------------------------
  private async detectAsyncIssues(): Promise<void> {
    this.logger.info('Detecting async issues');

    for (const file of this.sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      // Missing await on async calls
      const asyncCallRegex = /(?<!await\s)(?:fetch|axios\.\w+|\.json\(\)|\.text\(\)|\.arrayBuffer\(\))\s*\(/g;
      let match: RegExpExecArray | null;
      while ((match = asyncCallRegex.exec(content)) !== null) {
        // Check if inside an async function
        const beforeMatch = content.substring(0, match.index);
        const lastAsync = beforeMatch.lastIndexOf('async ');
        if (lastAsync > -1) {
          const lineNum = content.substring(0, match.index).split('\n').length;
          this.addFinding({
            severity: 'high',
            category: 'Async Issue',
            title: `Potentially missing await: ${path.basename(file)}:${lineNum}`,
            description: `Async function call without await may cause unhandled promise rejections.`,
            location: { file, line: lineNum },
            remediation: 'Add await keyword before async function calls, or handle the returned promise with .catch().',
            references: [],
            autoFixable: false,
          });
        }
      }

      // Empty catch blocks
      const emptyCatchRegex = /catch\s*\([^)]*\)\s*\{\s*\}/g;
      while ((match = emptyCatchRegex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        this.addFinding({
          severity: 'medium',
          category: 'Async Issue',
          title: `Empty catch block: ${path.basename(file)}:${lineNum}`,
          description: 'Empty catch block silently swallows errors, making debugging difficult.',
          location: { file, line: lineNum },
          remediation: 'Log the error or handle it appropriately. For OTT: report player errors to analytics.',
          references: [],
          autoFixable: false,
        });
      }

      // Promise.all without error handling
      if (content.includes('Promise.all') && !content.includes('Promise.allSettled')) {
        const promiseAllRegex = /Promise\.all\s*\(/g;
        while ((match = promiseAllRegex.exec(content)) !== null) {
          const after = content.substring(match.index, match.index + 200);
          if (!after.includes('.catch') && !after.includes('try')) {
            const lineNum = content.substring(0, match.index).split('\n').length;
            this.addFinding({
              severity: 'medium',
              category: 'Async Issue',
              title: `Promise.all without error handling: ${path.basename(file)}:${lineNum}`,
              description: 'Promise.all fails fast on first rejection. Consider Promise.allSettled for independent operations.',
              location: { file, line: lineNum },
              remediation: 'Use Promise.allSettled() or wrap Promise.all in try/catch. Critical for parallel content fetches.',
              references: [],
              autoFixable: false,
            });
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Anti-pattern Detection
  // ---------------------------------------------------------------------------
  private async detectAntiPatterns(): Promise<void> {
    this.logger.info('Detecting anti-patterns');

    for (const file of this.sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');

      for (const pattern of ANTI_PATTERNS) {
        if (pattern.inverse) {
          // Check if pattern is NOT found (e.g., missing error boundaries)
          if (!pattern.pattern.test(content) && file.match(/\.(jsx|tsx)$/)) {
            // Only flag once per project, not per file
          }
          continue;
        }

        const matches = [...content.matchAll(pattern.pattern)];
        if (matches.length > 0) {
          // Group multiple occurrences in same file
          this.addFinding({
            severity: pattern.severity,
            category: 'Anti-pattern',
            title: `${pattern.name}: ${path.basename(file)} (${matches.length}x)`,
            description: `Found ${matches.length} occurrence(s) of "${pattern.name}" in ${path.basename(file)}.`,
            location: {
              file,
              line: content.substring(0, matches[0].index).split('\n').length,
            },
            remediation: pattern.suggestion,
            references: [],
            autoFixable: false,
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Unhandled Exception Detection
  // ---------------------------------------------------------------------------
  private async detectUnhandledExceptions(): Promise<void> {
    this.logger.info('Detecting unhandled exceptions');

    for (const file of this.sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');

      // JSON.parse without try-catch
      const jsonParseRegex = /JSON\.parse\s*\(/g;
      let match: RegExpExecArray | null;
      while ((match = jsonParseRegex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        const surroundingCode = content.substring(Math.max(0, match.index - 200), match.index + 200);
        if (!surroundingCode.includes('try') && !surroundingCode.includes('catch')) {
          this.addFinding({
            severity: 'medium',
            category: 'Unhandled Exception',
            title: `JSON.parse without try-catch: ${path.basename(file)}:${lineNum}`,
            description: 'JSON.parse can throw SyntaxError on malformed input. API responses and stored data should be parsed safely.',
            location: { file, line: lineNum },
            remediation: 'Wrap JSON.parse in try-catch with fallback. Critical for parsing API responses and user preferences.',
            references: [],
            autoFixable: true,
          });
        }
      }

      // Accessing potentially undefined nested properties
      const deepAccessRegex = /\w+(?:\.\w+){3,}(?!\?)/g;
      while ((match = deepAccessRegex.exec(content)) !== null) {
        // Skip if using optional chaining nearby
        const context = content.substring(match.index - 10, match.index + match[0].length + 10);
        if (!context.includes('?.') && !context.includes('&&')) {
          const lineNum = content.substring(0, match.index).split('\n').length;
          // Only report first few per file
          if (this.findings.filter((f) => f.location?.file === file && f.category === 'Unhandled Exception').length < 3) {
            this.addFinding({
              severity: 'low',
              category: 'Unhandled Exception',
              title: `Deep property access without null check: ${path.basename(file)}:${lineNum}`,
              description: `Deep property chain "${match[0].substring(0, 40)}..." may throw if any intermediate value is null/undefined.`,
              location: { file, line: lineNum },
              remediation: 'Use optional chaining (?.) for deep property access, especially with API response data.',
              references: [],
              autoFixable: true,
            });
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Complexity Analysis
  // ---------------------------------------------------------------------------
  private async analyzeComplexity(): Promise<void> {
    this.logger.info('Analyzing code complexity');

    for (const file of this.sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');

      // Estimate cyclomatic complexity per function
      const functionRegex = /(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>))/g;
      let match: RegExpExecArray | null;

      while ((match = functionRegex.exec(content)) !== null) {
        // Count decision points in the function body (rough estimate)
        const startIdx = match.index;
        let braceCount = 0;
        let endIdx = startIdx;
        let foundStart = false;

        for (let i = startIdx; i < content.length; i++) {
          if (content[i] === '{') {
            braceCount++;
            foundStart = true;
          }
          if (content[i] === '}') {
            braceCount--;
          }
          if (foundStart && braceCount === 0) {
            endIdx = i;
            break;
          }
        }

        const funcBody = content.substring(startIdx, endIdx);
        const complexity =
          (funcBody.match(/\bif\b/g) || []).length +
          (funcBody.match(/\belse\b/g) || []).length +
          (funcBody.match(/\bfor\b/g) || []).length +
          (funcBody.match(/\bwhile\b/g) || []).length +
          (funcBody.match(/\bcase\b/g) || []).length +
          (funcBody.match(/\bcatch\b/g) || []).length +
          (funcBody.match(/&&|\|\||\?\?/g) || []).length +
          1; // Base complexity

        if (complexity > 15) {
          const lineNum = content.substring(0, match.index).split('\n').length;
          this.addFinding({
            severity: complexity > 25 ? 'high' : 'medium',
            category: 'Complexity',
            title: `High complexity (${complexity}): ${path.basename(file)}:${lineNum}`,
            description: `Function at line ${lineNum} has cyclomatic complexity of ${complexity} (threshold: 15). High complexity makes code harder to test and maintain.`,
            location: { file, line: lineNum },
            remediation: 'Refactor into smaller functions. Extract conditional logic. Use strategy pattern for complex branching.',
            references: [],
            autoFixable: false,
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // URL-mode scanning (limited)
  // ---------------------------------------------------------------------------
  private async scanFromURL(config: ScanConfig): Promise<void> {
    this.logger.info('Running limited code analysis from URL (client-side JS)');

    this.addFinding({
      severity: 'info',
      category: 'Scan Limitation',
      title: 'Limited analysis in URL mode',
      description: 'Code quality analysis is limited when scanning by URL. For full analysis, provide the repository path.',
      remediation: 'Re-run scan with --repo-path pointing to the project source code.',
      references: [],
      autoFixable: false,
    });

    // Analyze client-side JS via Puppeteer
    const puppeteer = require('puppeteer');
    let browser;
    try {
      browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      const page = await browser.newPage();
      const url = config.target.url!;

      // Collect console errors and warnings
      const consoleMessages: { type: string; text: string }[] = [];
      page.on('console', (msg: any) => {
        if (msg.type() === 'error' || msg.type() === 'warning') {
          consoleMessages.push({ type: msg.type(), text: msg.text() });
        }
      });

      // Collect JS errors
      const jsErrors: string[] = [];
      page.on('pageerror', (err: Error) => jsErrors.push(err.message));

      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

      // Report runtime JS errors
      if (jsErrors.length > 0) {
        this.addFinding({
          severity: jsErrors.length > 3 ? 'high' : 'medium',
          category: 'Static Analysis',
          title: `${jsErrors.length} runtime JavaScript error(s) detected`,
          description: `The page throws ${jsErrors.length} uncaught JS error(s): ${jsErrors.slice(0, 3).join('; ')}`,
          location: { url },
          evidence: jsErrors.slice(0, 5).join('\n'),
          remediation: 'Fix uncaught exceptions. Add error boundaries and proper try/catch blocks.',
          references: [],
          autoFixable: false,
        });
      }

      // Report console warnings
      const warnings = consoleMessages.filter((m) => m.type === 'warning');
      if (warnings.length > 5) {
        this.addFinding({
          severity: 'low',
          category: 'Anti-patterns',
          title: `${warnings.length} console warnings in production`,
          description: 'Excessive console warnings detected. These may indicate deprecated API usage or configuration issues.',
          location: { url },
          remediation: 'Review and resolve console warnings. Suppress dev-only warnings in production builds.',
          references: [],
          autoFixable: false,
        });
      }

      // Analyze inline script sizes and count
      const scriptAnalysis = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll('script'));
        const inlineScripts = scripts.filter((s) => !s.src && s.textContent && s.textContent.length > 100);
        const externalScripts = scripts.filter((s) => s.src);
        const totalInlineSize = inlineScripts.reduce((sum, s) => sum + (s.textContent?.length || 0), 0);
        return {
          inlineCount: inlineScripts.length,
          externalCount: externalScripts.length,
          totalInlineSize,
          hasSourceMaps: externalScripts.some((s) => s.src.includes('.map')),
        };
      });

      if (scriptAnalysis.totalInlineSize > 50000) {
        this.addFinding({
          severity: 'medium',
          category: 'Static Analysis',
          title: `Large inline scripts detected (${Math.round(scriptAnalysis.totalInlineSize / 1024)}KB)`,
          description: `Found ${scriptAnalysis.inlineCount} inline script(s) totalling ${Math.round(scriptAnalysis.totalInlineSize / 1024)}KB. Large inline scripts block parsing and cannot be cached.`,
          location: { url },
          remediation: 'Move large inline scripts to external files for better caching and code splitting.',
          references: ['https://web.dev/script-evaluation-and-long-tasks/'],
          autoFixable: false,
        });
      }

      // Check for global variable pollution
      const globalVars = await page.evaluate(() => {
        const defaults = new Set(['chrome', 'ozone', 'cdc_adoQpoasnfa76pfcZLmcfl_Array', 'cdc_adoQpoasnfa76pfcZLmcfl_Promise', 'cdc_adoQpoasnfa76pfcZLmcfl_Symbol']);
        const iframe = document.createElement('iframe');
        document.body.appendChild(iframe);
        const clean = new Set(Object.keys(iframe.contentWindow || {}));
        document.body.removeChild(iframe);
        return Object.keys(window).filter((k) => !clean.has(k) && !defaults.has(k)).length;
      });

      if (globalVars > 20) {
        this.addFinding({
          severity: 'low',
          category: 'Anti-patterns',
          title: `Excessive global variables (${globalVars})`,
          description: `Found ${globalVars} non-standard global variables. This may indicate poor module encapsulation.`,
          location: { url },
          remediation: 'Use modules and closures to avoid polluting the global namespace.',
          references: [],
          autoFixable: false,
        });
      }

      this.logger.info(`URL code analysis complete: ${jsErrors.length} errors, ${warnings.length} warnings, ${scriptAnalysis.externalCount} scripts`);
    } catch (error) {
      this.logger.warn('URL code analysis partially failed', { error: String(error) });
    } finally {
      if (browser) await browser.close();
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  private discoverSourceFiles(dir: string): string[] {
    const files: string[] = [];
    const extensions = ['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte'];
    const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__tests__'];

    const walk = (currentDir: string) => {
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory() && !ignoreDirs.includes(entry.name)) {
            walk(fullPath);
          } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
            files.push(fullPath);
          }
        }
      } catch {
        // Permission denied or other access issue
      }
    };

    walk(dir);
    return files.slice(0, 5000); // Cap at 5000 files
  }

  // ---------------------------------------------------------------------------
  // Populate Structured Metadata for Dashboard
  // ---------------------------------------------------------------------------
  private populateMetadata(): void {
    // ── Lint Results ──
    const staticFindings = this.findings.filter((f) => f.category === 'Static Analysis' || f.category === 'Semgrep');
    const eslintErrors = staticFindings.filter((f) => f.severity === 'medium' || f.severity === 'high').length;
    const eslintWarnings = staticFindings.filter((f) => f.severity === 'low').length;
    const fixable = staticFindings.filter((f) => f.autoFixable).length;

    // ── Dead Code ──
    const deadCodeFindings = this.findings.filter((f) => f.category === 'Dead Code');
    const deadCode = deadCodeFindings.map((f) => ({
      type: f.title.includes('Unused import') ? 'unused-import' as const
        : f.title.includes('Unreachable') ? 'unreachable' as const
        : 'unused-variable' as const,
      file: f.location?.file || '',
      line: f.location?.line || 0,
      code: f.description,
      confidence: 0.8,
    }));

    // ── Memory Leaks ──
    const memoryLeakFindings = this.findings.filter((f) => f.category === 'Memory Leak');
    const memoryLeaks = memoryLeakFindings.map((f) => ({
      type: f.title.includes('addEventListener') ? 'event-listener' as const
        : f.title.includes('setInterval') || f.title.includes('setTimeout') ? 'timer' as const
        : f.title.includes('subscribe') ? 'subscription' as const
        : f.title.includes('Player') ? 'dom-reference' as const
        : 'closure' as const,
      file: f.location?.file || '',
      line: f.location?.line || 0,
      description: f.description,
      severity: f.severity,
    }));

    // ── Async Issues ──
    const asyncIssueFindings = this.findings.filter((f) => f.category === 'Async Issue');
    const asyncIssues = asyncIssueFindings.map((f) => ({
      type: f.title.includes('missing await') ? 'missing-await' as const
        : f.title.includes('Empty catch') ? 'unhandled-promise' as const
        : f.title.includes('Promise.all') ? 'race-condition' as const
        : 'unhandled-promise' as const,
      file: f.location?.file || '',
      line: f.location?.line || 0,
      description: f.description,
      severity: f.severity,
    }));

    // ── Anti-patterns ──
    const antiPatternFindings = this.findings.filter((f) => f.category === 'Anti-pattern' || f.category === 'Anti-patterns');
    const antiPatterns = antiPatternFindings.map((f) => ({
      pattern: f.title.split(':')[0] || f.title,
      file: f.location?.file || '',
      line: f.location?.line || 0,
      description: f.description,
      suggestion: f.remediation,
      severity: f.severity,
    }));

    // ── Unhandled Exceptions ──
    const exceptionFindings = this.findings.filter((f) => f.category === 'Unhandled Exception');
    const unhandledExceptions = exceptionFindings.map((f) => ({
      type: f.title.includes('JSON.parse') ? 'uncaught' as const
        : f.title.includes('empty catch') ? 'empty-catch' as const
        : f.title.includes('Deep property') ? 'uncaught' as const
        : 'generic-catch' as const,
      file: f.location?.file || '',
      line: f.location?.line || 0,
      description: f.description,
    }));

    // ── Complexity ──
    const complexityFindings = this.findings.filter((f) => f.category === 'Complexity');
    const complexityValues = complexityFindings.map((f) => {
      const match = f.title.match(/complexity \((\d+)\)/);
      return match ? parseInt(match[1]) : 15;
    });
    const avgComplexity = complexityValues.length > 0
      ? complexityValues.reduce((s, v) => s + v, 0) / complexityValues.length
      : 5;
    const maxComplexity = complexityValues.length > 0
      ? Math.max(...complexityValues)
      : 5;

    // Estimate technical debt (rough: 30 min per medium finding, 2h per high, 4h per critical)
    const debtHours = this.findings.reduce((sum, f) => {
      switch (f.severity) {
        case 'critical': return sum + 4;
        case 'high': return sum + 2;
        case 'medium': return sum + 0.5;
        case 'low': return sum + 0.25;
        default: return sum;
      }
    }, 0);
    const debtDays = Math.floor(debtHours / 8);
    const debtRemainingHours = Math.round(debtHours % 8);
    const technicalDebt = debtDays > 0 ? `${debtDays}d ${debtRemainingHours}h` : `${Math.round(debtHours)}h`;

    this.metadata = {
      lintResults: {
        errors: eslintErrors,
        warnings: eslintWarnings,
        fixable,
      },
      deadCode,
      memoryLeaks,
      asyncIssues,
      antiPatterns,
      unhandledExceptions,
      complexity: {
        avgCyclomaticComplexity: Math.round(avgComplexity * 10) / 10,
        maxCyclomaticComplexity: maxComplexity,
        avgCognitiveComplexity: Math.round(avgComplexity * 0.8 * 10) / 10,
        maxCognitiveComplexity: Math.round(maxComplexity * 0.8),
        duplicateBlocks: 0,
        technicalDebt,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------------
  protected calculateScore(): WeightedScore {
    // Category-based scoring with capped penalties per category
    const breakdown = [
      { metric: 'Static Analysis', value: 0, maxScore: 20, actualScore: 0, penalty: 0, details: '' },
      { metric: 'Dead Code', value: 0, maxScore: 15, actualScore: 0, penalty: 0, details: '' },
      { metric: 'Memory Leaks', value: 0, maxScore: 20, actualScore: 0, penalty: 0, details: '' },
      { metric: 'Async Issues', value: 0, maxScore: 15, actualScore: 0, penalty: 0, details: '' },
      { metric: 'Anti-patterns', value: 0, maxScore: 15, actualScore: 0, penalty: 0, details: '' },
      { metric: 'Complexity', value: 0, maxScore: 15, actualScore: 0, penalty: 0, details: '' },
    ].map((b) => {
      const matchingFindings = this.findings.filter((f) => f.category === b.metric || f.category.includes(b.metric.split(' ')[0]));
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
      category: 'code-quality',
      rawScore,
      weight: 0.25,     // Code quality gets 25% weight
      weightedScore: rawScore * 0.25,
      breakdown,
    };
  }
}
