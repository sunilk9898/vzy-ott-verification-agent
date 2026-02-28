// ============================================================================
// Notification Service - Jira, Slack, Email Integration
// ============================================================================

import axios from 'axios';
import nodemailer from 'nodemailer';
import { Logger } from '../utils/logger';
import { ScanReport, NotificationConfig, Finding, Severity, JiraConfig } from '../types';

export class NotificationService {
  private logger = new Logger('notifications');

  async notify(report: ScanReport, config: NotificationConfig): Promise<void> {
    const tasks: Promise<void>[] = [];

    if (config.slack) {
      tasks.push(this.sendSlackAlert(report, config.slack));
    }
    if (config.email) {
      tasks.push(this.sendEmailReport(report, config.email));
    }
    if (config.jira) {
      tasks.push(this.createJiraTickets(report, config.jira));
    }

    await Promise.allSettled(tasks);
  }

  // ---------------------------------------------------------------------------
  // Slack Integration
  // ---------------------------------------------------------------------------
  private async sendSlackAlert(
    report: ScanReport,
    config: { webhookUrl: string; channel: string; mentionOnCritical: string[] },
  ): Promise<void> {
    this.logger.info('Sending Slack alert');

    const { kpiScore } = report;
    const statusEmoji = kpiScore.passesThreshold ? ':white_check_mark:' : ':rotating_light:';
    const mentions = report.criticalFindings.length > 0
      ? config.mentionOnCritical.map((u) => `<@${u}>`).join(' ')
      : '';

    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${statusEmoji} OTT Scan Report - ${kpiScore.overallScore}/100` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Security:* ${kpiScore.grades.security.rawScore}/100` },
          { type: 'mrkdwn', text: `*Performance:* ${kpiScore.grades.performance.rawScore}/100` },
          { type: 'mrkdwn', text: `*Code Quality:* ${kpiScore.grades.codeQuality.rawScore}/100` },
          { type: 'mrkdwn', text: `*Trend:* ${kpiScore.trend.direction} (${kpiScore.trend.delta > 0 ? '+' : ''}${kpiScore.trend.delta.toFixed(1)})` },
        ],
      },
    ];

    if (report.criticalFindings.length > 0) {
      blocks.push({
        type: 'section',
        fields: [],
        text: {
          type: 'mrkdwn',
          text: `*:fire: ${report.criticalFindings.length} Critical/High Findings:*\n${report.criticalFindings.slice(0, 5).map((f) => `• [${f.severity.toUpperCase()}] ${f.title}`).join('\n')}`,
        },
      } as any);
    }

    if (kpiScore.regressions.length > 0) {
      blocks.push({
        type: 'section',
        fields: [],
        text: {
          type: 'mrkdwn',
          text: `*:chart_with_downwards_trend: ${kpiScore.regressions.length} Regression(s):*\n${kpiScore.regressions.slice(0, 3).map((r) => `• ${r.metric}: ${r.previousValue} → ${r.currentValue}`).join('\n')}`,
        },
      } as any);
    }

    try {
      await axios.post(config.webhookUrl, {
        channel: config.channel,
        text: `${mentions} OTT Scan Complete: ${kpiScore.overallScore}/100 ${kpiScore.passesThreshold ? 'PASS' : 'FAIL'}`,
        blocks,
      });
      this.logger.info('Slack alert sent successfully');
    } catch (error) {
      this.logger.error('Failed to send Slack alert', { error: String(error) });
    }
  }

  // ---------------------------------------------------------------------------
  // Email Integration
  // ---------------------------------------------------------------------------
  private async sendEmailReport(
    report: ScanReport,
    config: { recipients: string[]; smtpConfig: any },
  ): Promise<void> {
    this.logger.info('Sending email report');

    const transporter = nodemailer.createTransport(config.smtpConfig);
    const { kpiScore } = report;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <h1 style="color: ${kpiScore.passesThreshold ? '#2e7d32' : '#c62828'};">
          OTT Scan Report - Score: ${kpiScore.overallScore}/100
        </h1>

        <div style="display: flex; gap: 20px; margin: 20px 0;">
          ${this.scoreCard('Security', kpiScore.grades.security.rawScore, 90)}
          ${this.scoreCard('Performance', kpiScore.grades.performance.rawScore, 95)}
          ${this.scoreCard('Code Quality', kpiScore.grades.codeQuality.rawScore, 85)}
        </div>

        <h2>Executive Summary</h2>
        <p>${report.executiveSummary}</p>

        ${report.criticalFindings.length > 0 ? `
          <h2 style="color: #c62828;">Critical Findings (${report.criticalFindings.length})</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="background: #f5f5f5;">
              <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Severity</th>
              <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Finding</th>
              <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Category</th>
            </tr>
            ${report.criticalFindings.slice(0, 15).map((f) => `
              <tr>
                <td style="padding: 8px; border: 1px solid #ddd;">
                  <span style="color: ${f.severity === 'critical' ? '#c62828' : '#e65100'}; font-weight: bold;">
                    ${f.severity.toUpperCase()}
                  </span>
                </td>
                <td style="padding: 8px; border: 1px solid #ddd;">${f.title}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${f.category}</td>
              </tr>
            `).join('')}
          </table>
        ` : ''}

        <h2>Top Recommendations</h2>
        <ol>
          ${report.recommendations.slice(0, 5).map((r) => `
            <li><strong>${r.title}</strong> - ${r.description} (Effort: ${r.effort})</li>
          `).join('')}
        </ol>

        <hr style="margin: 30px 0;" />
        <p style="color: #666; font-size: 12px;">
          Generated: ${report.generatedAt.toISOString()} | Scan ID: ${report.scanId} | Platform: ${report.platform}
        </p>
      </div>
    `;

    try {
      await transporter.sendMail({
        from: config.smtpConfig.auth.user,
        to: config.recipients.join(', '),
        subject: `[${kpiScore.passesThreshold ? 'PASS' : 'FAIL'}] OTT Scan Report - ${kpiScore.overallScore}/100`,
        html,
      });
      this.logger.info('Email report sent successfully');
    } catch (error) {
      this.logger.error('Failed to send email report', { error: String(error) });
    }
  }

  private scoreCard(label: string, score: number, threshold: number): string {
    const color = score >= threshold ? '#2e7d32' : score >= threshold - 10 ? '#e65100' : '#c62828';
    return `
      <div style="flex: 1; padding: 16px; border-radius: 8px; background: #f5f5f5; text-align: center;">
        <div style="font-size: 36px; font-weight: bold; color: ${color};">${score}</div>
        <div style="color: #666;">${label}</div>
        <div style="font-size: 12px; color: #999;">Target: ${threshold}</div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Jira Integration
  // ---------------------------------------------------------------------------
  private async createJiraTickets(report: ScanReport, config: JiraConfig): Promise<void> {
    if (!config.autoCreate) return;

    this.logger.info('Creating Jira tickets for findings');

    const findingsToTicket = report.criticalFindings.filter(
      (f) => this.severityRank(f.severity) <= this.severityRank(config.autoCreateThreshold),
    );

    for (const finding of findingsToTicket.slice(0, 20)) {
      try {
        const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');

        const response = await axios.post(
          `${config.host}/rest/api/3/issue`,
          {
            fields: {
              project: { key: config.projectKey },
              summary: `[${finding.severity.toUpperCase()}] ${finding.title}`,
              description: {
                type: 'doc',
                version: 1,
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: finding.description }],
                  },
                  {
                    type: 'heading',
                    attrs: { level: 3 },
                    content: [{ type: 'text', text: 'Remediation' }],
                  },
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: finding.remediation }],
                  },
                  ...(finding.evidence ? [{
                    type: 'codeBlock',
                    content: [{ type: 'text', text: finding.evidence }],
                  }] : []),
                ],
              },
              issuetype: { name: config.issueType },
              priority: { name: config.severityMapping[finding.severity] || 'Medium' },
              labels: ['auto-scan', 'ott-agent', finding.agent, finding.severity],
            },
          },
          {
            headers: {
              Authorization: `Basic ${auth}`,
              'Content-Type': 'application/json',
            },
          },
        );

        finding.jiraTicketId = response.data.key;
        this.logger.info(`Created Jira ticket: ${response.data.key} for ${finding.title}`);
      } catch (error) {
        this.logger.error(`Failed to create Jira ticket for ${finding.title}`, { error: String(error) });
      }
    }
  }

  private severityRank(severity: Severity): number {
    return { critical: 1, high: 2, medium: 3, low: 4, info: 5 }[severity];
  }
}
