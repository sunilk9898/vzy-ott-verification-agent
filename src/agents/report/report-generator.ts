// ============================================================================
// Report Generator Agent - AI Reasoning, Scoring, Comparison, Reporting
// ============================================================================

import OpenAI from 'openai';
import { Logger } from '../../utils/logger';
import {
  AgentResult, ScanConfig, ScanReport, KPIScore,
  WeightedScore, Finding, Recommendation, Regression,
  Severity, TrendData, ScanComparison,
} from '../../types';

// ---- KPI Scoring Formula ----
// Overall Score = (Security_Score × 0.40) + (Performance_Score × 0.35) + (CodeQuality_Score × 0.25)
//
// Per-Agent Score = 100 - Σ(finding_severity_penalty)
//   critical = -25 points
//   high     = -15 points
//   medium   = -8  points
//   low      = -3  points
//   info     = -0  points
//
// Clamp: [0, 100]
// Target: ≥95 overall

const AGENT_WEIGHTS = {
  security: 0.40,
  performance: 0.35,
  'code-quality': 0.25,
} as const;

export class ReportGenerator {
  private logger = new Logger('report-generator');
  private openai?: OpenAI;

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }

  // ---------------------------------------------------------------------------
  // Generate Full Report
  // ---------------------------------------------------------------------------
  async generate(
    config: ScanConfig,
    agentResults: AgentResult[],
    previousReport?: ScanReport,
  ): Promise<ScanReport> {
    this.logger.info('Generating scan report');

    // 1. Calculate KPI Score
    const kpiScore = this.calculateKPIScore(config, agentResults, previousReport);

    // 2. Detect regressions
    const comparison = previousReport
      ? this.compareWithPrevious(agentResults, previousReport)
      : undefined;

    // 3. Collect critical findings
    const criticalFindings = agentResults
      .flatMap((r) => r.findings)
      .filter((f) => f.severity === 'critical' || f.severity === 'high')
      .sort((a, b) => this.severityRank(a.severity) - this.severityRank(b.severity));

    // 4. Generate AI-powered executive summary
    const executiveSummary = await this.generateExecutiveSummary(kpiScore, criticalFindings, comparison);

    // 5. Generate prioritized recommendations
    const recommendations = await this.generateRecommendations(agentResults, kpiScore);

    const report: ScanReport = {
      id: `report_${Date.now()}`,
      scanId: config.id,
      generatedAt: new Date(),
      target: config.target,
      platform: config.platform,
      kpiScore,
      agentResults,
      executiveSummary,
      criticalFindings,
      recommendations,
      comparisonWithPrevious: comparison,
    };

    this.logger.info(`Report generated: overall score = ${kpiScore.overallScore}`);
    return report;
  }

  // ---------------------------------------------------------------------------
  // KPI Score Calculation
  // ---------------------------------------------------------------------------
  calculateKPIScore(
    config: ScanConfig,
    agentResults: AgentResult[],
    previousReport?: ScanReport,
  ): KPIScore {
    const grades: Record<string, WeightedScore> = {};

    for (const result of agentResults) {
      const weight = AGENT_WEIGHTS[result.agentType as keyof typeof AGENT_WEIGHTS] || 0;
      grades[result.agentType] = {
        ...result.score,
        weight,
        weightedScore: result.score.rawScore * weight,
      };
    }

    // Calculate overall weighted score
    const overallScore = Math.round(
      Object.values(grades).reduce((sum, g) => sum + g.weightedScore, 0) * 100,
    ) / 100;

    // Build trend data
    const trend = this.buildTrend(overallScore, previousReport);

    // Detect regressions
    const regressions = this.detectRegressions(agentResults, previousReport);

    return {
      scanId: config.id,
      timestamp: new Date(),
      platform: config.platform,
      overallScore,
      grades: {
        security: grades['security'] || this.emptyScore('security'),
        performance: grades['performance'] || this.emptyScore('performance'),
        codeQuality: grades['code-quality'] || this.emptyScore('code-quality'),
      },
      trend,
      regressions,
      passesThreshold: overallScore >= config.thresholds.overall,
    };
  }

  // ---------------------------------------------------------------------------
  // Regression Detection
  // ---------------------------------------------------------------------------
  private detectRegressions(
    agentResults: AgentResult[],
    previousReport?: ScanReport,
  ): Regression[] {
    if (!previousReport) return [];

    const regressions: Regression[] = [];

    for (const current of agentResults) {
      const prevResult = previousReport.agentResults.find((r) => r.agentType === current.agentType);
      if (!prevResult) continue;

      const scoreDelta = current.score.rawScore - prevResult.score.rawScore;
      if (scoreDelta < -5) {
        regressions.push({
          metric: `${current.agentType} score`,
          previousValue: prevResult.score.rawScore,
          currentValue: current.score.rawScore,
          delta: scoreDelta,
          severity: scoreDelta < -20 ? 'critical' : scoreDelta < -10 ? 'high' : 'medium',
          agent: current.agentType,
        });
      }

      // Check for new critical/high findings
      const prevFindingIds = new Set(prevResult.findings.map((f) => `${f.category}:${f.title}`));
      const newCritical = current.findings.filter(
        (f) =>
          (f.severity === 'critical' || f.severity === 'high') &&
          !prevFindingIds.has(`${f.category}:${f.title}`),
      );

      for (const finding of newCritical) {
        regressions.push({
          metric: finding.title,
          previousValue: 0,
          currentValue: 1,
          delta: 1,
          severity: finding.severity,
          agent: current.agentType,
        });
      }
    }

    return regressions;
  }

  // ---------------------------------------------------------------------------
  // Comparison with Previous Scan
  // ---------------------------------------------------------------------------
  private compareWithPrevious(
    agentResults: AgentResult[],
    previousReport: ScanReport,
  ): ScanComparison {
    const currentFindings = agentResults.flatMap((r) => r.findings);
    const prevFindings = previousReport.agentResults.flatMap((r) => r.findings);

    const prevKeys = new Set(prevFindings.map((f) => `${f.category}:${f.title}:${f.location?.file || ''}`));
    const currKeys = new Set(currentFindings.map((f) => `${f.category}:${f.title}:${f.location?.file || ''}`));

    const newFindings = currentFindings.filter(
      (f) => !prevKeys.has(`${f.category}:${f.title}:${f.location?.file || ''}`),
    );

    const resolvedFindings = prevFindings.filter(
      (f) => !currKeys.has(`${f.category}:${f.title}:${f.location?.file || ''}`),
    );

    const currentOverall = agentResults.reduce(
      (sum, r) => sum + r.score.weightedScore, 0,
    );

    return {
      previousScanId: previousReport.scanId,
      scoreDelta: currentOverall - previousReport.kpiScore.overallScore,
      newFindings,
      resolvedFindings,
      regressions: this.detectRegressions(agentResults, previousReport),
    };
  }

  // ---------------------------------------------------------------------------
  // AI-Powered Executive Summary
  // ---------------------------------------------------------------------------
  private async generateExecutiveSummary(
    kpiScore: KPIScore,
    criticalFindings: Finding[],
    comparison?: ScanComparison,
  ): Promise<string> {
    if (!this.openai) {
      return this.generateStaticSummary(kpiScore, criticalFindings, comparison);
    }

    try {
      const prompt = `You are an OTT platform security and performance analyst. Generate a concise executive summary (max 300 words) for this scan report:

OVERALL SCORE: ${kpiScore.overallScore}/100 (target: 95)
PASSES THRESHOLD: ${kpiScore.passesThreshold}

SECURITY SCORE: ${kpiScore.grades.security.rawScore}/100
PERFORMANCE SCORE: ${kpiScore.grades.performance.rawScore}/100
CODE QUALITY SCORE: ${kpiScore.grades.codeQuality.rawScore}/100

TREND: ${kpiScore.trend.direction} (${kpiScore.trend.delta > 0 ? '+' : ''}${kpiScore.trend.delta})

CRITICAL FINDINGS: ${criticalFindings.length}
${criticalFindings.slice(0, 5).map((f) => `- [${f.severity.toUpperCase()}] ${f.title}`).join('\n')}

${comparison ? `
REGRESSION: ${comparison.regressions.length} regression(s) detected
NEW FINDINGS: ${comparison.newFindings.length}
RESOLVED: ${comparison.resolvedFindings.length}
SCORE CHANGE: ${comparison.scoreDelta > 0 ? '+' : ''}${comparison.scoreDelta.toFixed(1)}
` : ''}

Focus on: 1) Overall health assessment 2) Most critical risks 3) OTT-specific concerns (DRM, player, CDN) 4) Key recommendations`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.3,
      });

      return response.choices[0]?.message?.content || this.generateStaticSummary(kpiScore, criticalFindings, comparison);
    } catch (error) {
      this.logger.warn('AI summary generation failed, using static summary', { error: String(error) });
      return this.generateStaticSummary(kpiScore, criticalFindings, comparison);
    }
  }

  private generateStaticSummary(
    kpiScore: KPIScore,
    criticalFindings: Finding[],
    comparison?: ScanComparison,
  ): string {
    const status = kpiScore.passesThreshold ? 'PASSES' : 'FAILS';
    const trendEmoji = kpiScore.trend.direction === 'improving' ? 'Improving' :
      kpiScore.trend.direction === 'declining' ? 'Declining' : 'Stable';

    let summary = `Overall KPI Score: ${kpiScore.overallScore}/100 - ${status} threshold (95). `;
    summary += `Trend: ${trendEmoji} (${kpiScore.trend.delta > 0 ? '+' : ''}${kpiScore.trend.delta.toFixed(1)}). `;
    summary += `Security: ${kpiScore.grades.security.rawScore}/100, Performance: ${kpiScore.grades.performance.rawScore}/100, Code Quality: ${kpiScore.grades.codeQuality.rawScore}/100. `;

    if (criticalFindings.length > 0) {
      summary += `${criticalFindings.length} critical/high findings require immediate attention. `;
      summary += `Top issue: ${criticalFindings[0].title}. `;
    }

    if (comparison) {
      if (comparison.regressions.length > 0) {
        summary += `WARNING: ${comparison.regressions.length} regression(s) detected since last scan. `;
      }
      if (comparison.resolvedFindings.length > 0) {
        summary += `${comparison.resolvedFindings.length} previous finding(s) resolved. `;
      }
    }

    return summary;
  }

  // ---------------------------------------------------------------------------
  // AI-Powered Recommendations
  // ---------------------------------------------------------------------------
  private async generateRecommendations(
    agentResults: AgentResult[],
    kpiScore: KPIScore,
  ): Promise<Recommendation[]> {
    const allFindings = agentResults.flatMap((r) => r.findings);
    const recommendations: Recommendation[] = [];

    // Group findings by category and prioritize
    const categoryGroups = new Map<string, Finding[]>();
    for (const finding of allFindings) {
      const group = categoryGroups.get(finding.category) || [];
      group.push(finding);
      categoryGroups.set(finding.category, group);
    }

    let priority = 1;
    const sortedCategories = [...categoryGroups.entries()]
      .sort(([, a], [, b]) => {
        const aMax = Math.min(...a.map((f) => this.severityRank(f.severity)));
        const bMax = Math.min(...b.map((f) => this.severityRank(f.severity)));
        return aMax - bMax;
      });

    for (const [category, findings] of sortedCategories.slice(0, 10)) {
      const topSeverity = findings.reduce((max, f) =>
        this.severityRank(f.severity) < this.severityRank(max) ? f.severity : max,
        'info' as Severity,
      );

      recommendations.push({
        priority: priority++,
        title: `Address ${category} issues (${findings.length} findings)`,
        description: findings[0].remediation,
        impact: `Resolving these ${findings.length} findings could improve the ${findings[0].agent} score by up to ${findings.reduce((s, f) => s + this.severityPoints(f.severity), 0)} points.`,
        effort: findings.some((f) => !f.autoFixable) ? 'high' : findings.length > 5 ? 'medium' : 'low',
        category: findings[0].agent,
      });
    }

    return recommendations;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  private buildTrend(currentScore: number, previousReport?: ScanReport): TrendData {
    const history = previousReport
      ? [...(previousReport.kpiScore.trend.history || []), { date: new Date(), score: currentScore }]
      : [{ date: new Date(), score: currentScore }];

    const delta = previousReport ? currentScore - previousReport.kpiScore.overallScore : 0;

    return {
      direction: delta > 2 ? 'improving' : delta < -2 ? 'declining' : 'stable',
      delta,
      history: history.slice(-30), // Keep last 30 data points
    };
  }

  private emptyScore(category: string): WeightedScore {
    return {
      category: category as any,
      rawScore: 0,
      weight: 0,
      weightedScore: 0,
      breakdown: [],
    };
  }

  private severityRank(severity: Severity): number {
    return { critical: 1, high: 2, medium: 3, low: 4, info: 5 }[severity];
  }

  private severityPoints(severity: Severity): number {
    return { critical: 25, high: 15, medium: 8, low: 3, info: 0 }[severity];
  }
}
