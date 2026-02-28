// ============================================================================
// Orchestrator - Multi-Agent Scan Coordinator
// ============================================================================
//
// WORKFLOW:
//   1. Receive scan config (URL or repo path + options)
//   2. Initialize selected agents in parallel
//   3. Execute agents concurrently with timeout guards
//   4. Collect results into unified JSON
//   5. Feed into Report Generator for AI reasoning + scoring
//   6. Trigger notifications (Jira, Slack, Email)
//   7. Store results for trend tracking
//
// ============================================================================

import { v4 as uuid } from 'uuid';
import { Logger } from '../utils/logger';
import { SecurityAgent } from '../agents/security/security-agent';
import { PerformanceAgent } from '../agents/performance/performance-agent';
import { CodeQualityAgent } from '../agents/code-quality/code-quality-agent';
import { ReportGenerator } from '../agents/report/report-generator';
import { NotificationService } from '../integrations/notification-service';
import { ResultStore } from '../store/result-store';
import { BaseAgent } from '../core/base-agent';
import {
  ScanConfig, AgentResult, AgentType, ScanReport,
  ScanTarget, Platform, ScoreThresholds, NotificationConfig,
} from '../types';

const AGENT_TIMEOUT_MS = 300_000;  // 5 minutes per agent

export class Orchestrator {
  private logger = new Logger('orchestrator');
  private reportGenerator = new ReportGenerator();
  private notificationService = new NotificationService();
  private resultStore = new ResultStore();

  // ---------------------------------------------------------------------------
  // Main Entry Point
  // ---------------------------------------------------------------------------
  async runScan(config: ScanConfig): Promise<ScanReport> {
    this.logger.info('=== Starting Orchestrated Scan ===', {
      id: config.id,
      target: config.target.url || config.target.repoPath,
      agents: config.agents,
      platform: config.platform,
    });

    const startTime = Date.now();

    // 1. Initialize agents
    const agents = this.initializeAgents(config.agents);
    this.logger.info(`Initialized ${agents.length} agent(s)`);

    // 2. Execute all agents concurrently
    const agentResults = await this.executeAgentsConcurrently(agents, config);
    this.logger.info(`All agents completed in ${Date.now() - startTime}ms`);

    // 3. Generate report with AI reasoning
    const previousReport = await this.resultStore.getLatestReport(
      config.target.url || config.target.repoPath || '',
    );
    const report = await this.reportGenerator.generate(config, agentResults, previousReport || undefined);

    // 4. Store results
    await this.resultStore.saveReport(report);

    // 5. Send notifications
    await this.notificationService.notify(report, config.notifications);

    // 6. Log summary
    this.logSummary(report, Date.now() - startTime);

    return report;
  }

  // ---------------------------------------------------------------------------
  // Create Default Config
  // ---------------------------------------------------------------------------
  static createConfig(params: {
    url?: string;
    repoPath?: string;
    agents?: AgentType[];
    platform?: Platform;
    notifications?: NotificationConfig;
  }): ScanConfig {
    return {
      id: `scan_${uuid()}`,
      target: {
        mode: params.url ? 'url' : 'repo',
        url: params.url,
        repoPath: params.repoPath,
      },
      agents: params.agents || ['security', 'performance', 'code-quality'],
      platform: params.platform || 'both',
      thresholds: {
        overall: 95,
        security: 90,
        performance: 95,
        codeQuality: 85,
      },
      notifications: params.notifications || {},
      createdAt: new Date(),
    };
  }

  // ---------------------------------------------------------------------------
  // Agent Initialization
  // ---------------------------------------------------------------------------
  private initializeAgents(agentTypes: AgentType[]): BaseAgent[] {
    const agentMap: Record<string, () => BaseAgent> = {
      security: () => new SecurityAgent(),
      performance: () => new PerformanceAgent(),
      'code-quality': () => new CodeQualityAgent(),
    };

    return agentTypes
      .filter((type) => agentMap[type])
      .map((type) => agentMap[type]());
  }

  // ---------------------------------------------------------------------------
  // Concurrent Agent Execution
  // ---------------------------------------------------------------------------
  private async executeAgentsConcurrently(
    agents: BaseAgent[],
    config: ScanConfig,
  ): Promise<AgentResult[]> {
    const results = await Promise.allSettled(
      agents.map((agent) =>
        Promise.race([
          agent.execute(config),
          this.timeoutGuard(agent.constructor.name),
        ]),
      ),
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }

      this.logger.error(`Agent ${agents[index].constructor.name} failed`, {
        reason: result.reason?.message || 'Unknown error',
      });

      // Return a failure result so other agents' results are still used
      return {
        agentType: config.agents[index],
        scanId: config.id,
        status: 'failed' as const,
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 0,
        findings: [],
        score: { category: config.agents[index], rawScore: 0, weight: 0, weightedScore: 0, breakdown: [] },
        metadata: {},
        errors: [{
          code: 'AGENT_FAILED',
          message: result.reason?.message || 'Agent execution failed',
          recoverable: false,
          timestamp: new Date(),
        }],
      } satisfies AgentResult;
    });
  }

  private timeoutGuard(agentName: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Agent ${agentName} timed out after ${AGENT_TIMEOUT_MS / 1000}s`));
      }, AGENT_TIMEOUT_MS);
    });
  }

  // ---------------------------------------------------------------------------
  // Summary Logging
  // ---------------------------------------------------------------------------
  private logSummary(report: ScanReport, totalMs: number): void {
    const { kpiScore } = report;

    this.logger.info('=== Scan Complete ===');
    this.logger.info(`Total Time:        ${(totalMs / 1000).toFixed(1)}s`);
    this.logger.info(`Overall Score:     ${kpiScore.overallScore}/100 ${kpiScore.passesThreshold ? 'PASS' : 'FAIL'}`);
    this.logger.info(`Security:          ${kpiScore.grades.security.rawScore}/100 (weight: 40%)`);
    this.logger.info(`Performance:       ${kpiScore.grades.performance.rawScore}/100 (weight: 35%)`);
    this.logger.info(`Code Quality:      ${kpiScore.grades.codeQuality.rawScore}/100 (weight: 25%)`);
    this.logger.info(`Trend:             ${kpiScore.trend.direction} (${kpiScore.trend.delta > 0 ? '+' : ''}${kpiScore.trend.delta.toFixed(1)})`);
    this.logger.info(`Critical Findings: ${report.criticalFindings.length}`);
    this.logger.info(`Regressions:       ${kpiScore.regressions.length}`);
    this.logger.info(`Recommendations:   ${report.recommendations.length}`);
  }
}
