// ============================================================================
// Base Agent - Abstract class all scanning agents extend
// ============================================================================

import { v4 as uuid } from 'uuid';
import { Logger } from '../utils/logger';
import {
  AgentType,
  AgentResult,
  AgentError,
  Finding,
  ScanConfig,
  ScanStatus,
  WeightedScore,
  Severity,
} from '../types';

export abstract class BaseAgent {
  protected readonly agentType: AgentType;
  protected readonly logger: Logger;
  protected findings: Finding[] = [];
  protected errors: AgentError[] = [];
  protected metadata: Record<string, unknown> = {};
  protected status: ScanStatus = 'queued';
  protected startedAt?: Date;
  protected completedAt?: Date;

  constructor(agentType: AgentType) {
    this.agentType = agentType;
    this.logger = new Logger(`agent:${agentType}`);
  }

  // ---- Lifecycle Methods ----

  async execute(config: ScanConfig): Promise<AgentResult> {
    this.status = 'running';
    this.startedAt = new Date();
    this.findings = [];
    this.errors = [];
    this.metadata = {};

    this.logger.info(`Starting ${this.agentType} scan for ${config.target.url || config.target.repoPath}`);

    try {
      await this.setup(config);
      await this.scan(config);
      this.status = 'completed';
    } catch (error) {
      const agentError = this.toAgentError(error);
      this.errors.push(agentError);

      if (agentError.recoverable) {
        this.logger.warn(`Recoverable error in ${this.agentType}: ${agentError.message}`);
        this.status = 'partial';
      } else {
        this.logger.error(`Fatal error in ${this.agentType}: ${agentError.message}`);
        this.status = 'failed';
      }
    } finally {
      this.completedAt = new Date();
      await this.teardown();
    }

    const result = this.buildResult(config);
    this.logger.info(`${this.agentType} scan completed: score=${result.score.rawScore}, findings=${this.findings.length}`);
    return result;
  }

  // ---- Abstract Methods (each agent implements) ----

  protected abstract setup(config: ScanConfig): Promise<void>;
  protected abstract scan(config: ScanConfig): Promise<void>;
  protected abstract teardown(): Promise<void>;
  protected abstract calculateScore(): WeightedScore;

  // ---- Shared Utilities ----

  protected addFinding(params: Omit<Finding, 'id' | 'agent' | 'jiraTicketId'>): void {
    this.findings.push({
      ...params,
      id: uuid(),
      agent: this.agentType,
    });
  }

  protected getSeverityWeight(severity: Severity): number {
    const weights: Record<Severity, number> = {
      critical: 25,
      high: 15,
      medium: 8,
      low: 3,
      info: 0,
    };
    return weights[severity];
  }

  protected calculatePenalty(): number {
    return this.findings.reduce((total, f) => total + this.getSeverityWeight(f.severity), 0);
  }

  protected clampScore(score: number): number {
    return Math.max(0, Math.min(100, Math.round(score * 100) / 100));
  }

  private buildResult(config: ScanConfig): AgentResult {
    return {
      agentType: this.agentType,
      scanId: config.id,
      status: this.status,
      startedAt: this.startedAt!,
      completedAt: this.completedAt,
      durationMs: this.completedAt!.getTime() - this.startedAt!.getTime(),
      findings: this.findings,
      score: this.calculateScore(),
      metadata: this.metadata,
      errors: this.errors,
    };
  }

  private toAgentError(error: unknown): AgentError {
    const message = error instanceof Error ? error.message : String(error);
    return {
      code: `${this.agentType.toUpperCase()}_ERROR`,
      message,
      recoverable: !(error instanceof TypeError || error instanceof ReferenceError),
      timestamp: new Date(),
    };
  }
}
