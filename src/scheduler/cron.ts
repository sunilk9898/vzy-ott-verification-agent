// ============================================================================
// Scheduler - Cron-based Daily Scans + Deployment Webhook Trigger
// ============================================================================

import cron from 'node-cron';
import express from 'express';
import crypto from 'crypto';
import { Logger } from '../utils/logger';
import { Orchestrator } from '../orchestrator';
import { ScanConfig } from '../types';

const logger = new Logger('scheduler');

// ---------------------------------------------------------------------------
// Load scan configurations from environment or config file
// ---------------------------------------------------------------------------
function loadScanConfigs(): ScanConfig[] {
  const configs: ScanConfig[] = [];

  // Primary OTT website scan
  if (process.env.SCAN_TARGET_URL) {
    configs.push(
      Orchestrator.createConfig({
        url: process.env.SCAN_TARGET_URL,
        platform: (process.env.SCAN_PLATFORM as any) || 'both',
        agents: ['security', 'performance', 'code-quality'],
        notifications: {
          slack: process.env.SLACK_WEBHOOK_URL
            ? {
                webhookUrl: process.env.SLACK_WEBHOOK_URL,
                channel: process.env.SLACK_CHANNEL || '#ott-monitoring',
                mentionOnCritical: (process.env.SLACK_MENTION_USERS || '').split(',').filter(Boolean),
              }
            : undefined,
          email: process.env.EMAIL_RECIPIENTS
            ? {
                recipients: process.env.EMAIL_RECIPIENTS.split(','),
                smtpConfig: {
                  host: process.env.SMTP_HOST || 'smtp.gmail.com',
                  port: parseInt(process.env.SMTP_PORT || '587'),
                  secure: process.env.SMTP_SECURE === 'true',
                  auth: {
                    user: process.env.SMTP_USER || '',
                    pass: process.env.SMTP_PASS || '',
                  },
                },
              }
            : undefined,
          jira: process.env.JIRA_HOST
            ? {
                host: process.env.JIRA_HOST,
                email: process.env.JIRA_EMAIL || '',
                apiToken: process.env.JIRA_API_TOKEN || '',
                projectKey: process.env.JIRA_PROJECT_KEY || 'OTT',
                issueType: 'Bug',
                severityMapping: {
                  critical: 'Highest',
                  high: 'High',
                  medium: 'Medium',
                  low: 'Low',
                  info: 'Lowest',
                },
                autoCreate: true,
                autoCreateThreshold: 'high',
              }
            : undefined,
        },
      }),
    );
  }

  // Repo scan (if configured)
  if (process.env.SCAN_REPO_PATH) {
    configs.push(
      Orchestrator.createConfig({
        repoPath: process.env.SCAN_REPO_PATH,
        agents: ['code-quality', 'security'],
      }),
    );
  }

  return configs;
}

// ---------------------------------------------------------------------------
// Cron Scheduler
// ---------------------------------------------------------------------------
function startScheduler(): void {
  const cronExpression = process.env.SCAN_CRON || '0 2 * * *';  // Default: 2 AM daily
  const configs = loadScanConfigs();

  if (configs.length === 0) {
    logger.warn('No scan targets configured. Set SCAN_TARGET_URL or SCAN_REPO_PATH.');
    return;
  }

  logger.info(`Scheduling ${configs.length} scan(s) with cron: ${cronExpression}`);

  cron.schedule(cronExpression, async () => {
    logger.info('=== Scheduled scan triggered ===');
    const orchestrator = new Orchestrator();

    for (const config of configs) {
      try {
        logger.info(`Starting scheduled scan for ${config.target.url || config.target.repoPath}`);
        await orchestrator.runScan(config);
      } catch (error) {
        logger.error(`Scheduled scan failed for ${config.target.url || config.target.repoPath}`, {
          error: String(error),
        });
      }
    }
  }, {
    timezone: process.env.SCAN_TIMEZONE || 'Asia/Kolkata',
  });

  logger.info('Scheduler started');
}

// ---------------------------------------------------------------------------
// Deployment Webhook Server
// ---------------------------------------------------------------------------
function startWebhookServer(): void {
  const app = express();
  const port = parseInt(process.env.WEBHOOK_PORT || '9090');
  const webhookSecret = process.env.DEPLOY_WEBHOOK_SECRET || '';

  app.use(express.json());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  // Deployment webhook - triggers scan on deployment
  app.post('/webhook/deploy', async (req, res) => {
    // Verify webhook signature
    if (webhookSecret) {
      const signature = req.headers['x-webhook-signature'] as string;
      const expectedSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(req.body))
        .digest('hex');

      if (signature !== `sha256=${expectedSig}`) {
        logger.warn('Invalid webhook signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }
    }

    const { environment, url, branch } = req.body;

    logger.info('Deployment webhook received', { environment, url, branch });

    // Only trigger for production/staging deployments
    if (!['production', 'staging'].includes(environment)) {
      res.json({ status: 'skipped', reason: 'Non-production environment' });
      return;
    }

    res.json({ status: 'accepted', message: 'Scan queued' });

    // Run scan asynchronously
    const orchestrator = new Orchestrator();
    const config = Orchestrator.createConfig({
      url: url || process.env.SCAN_TARGET_URL,
      agents: ['security', 'performance', 'code-quality'],
      platform: 'both',
    });

    try {
      await orchestrator.runScan(config);
      logger.info('Post-deployment scan completed');
    } catch (error) {
      logger.error('Post-deployment scan failed', { error: String(error) });
    }
  });

  // Manual scan trigger
  app.post('/webhook/scan', async (req, res) => {
    const { url, repoPath, agents, platform } = req.body;

    if (!url && !repoPath) {
      res.status(400).json({ error: 'Either url or repoPath is required' });
      return;
    }

    const config = Orchestrator.createConfig({ url, repoPath, agents, platform });
    res.json({ status: 'accepted', scanId: config.id });

    const orchestrator = new Orchestrator();
    try {
      const report = await orchestrator.runScan(config);
      logger.info(`Manual scan completed: ${report.kpiScore.overallScore}/100`);
    } catch (error) {
      logger.error('Manual scan failed', { error: String(error) });
    }
  });

  app.listen(port, () => {
    logger.info(`Webhook server listening on port ${port}`);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
startScheduler();
startWebhookServer();
