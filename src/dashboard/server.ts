// ============================================================================
// Dashboard API Server - REST API + Auth + User Management
// ============================================================================

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { Server } from 'socket.io';
import http from 'http';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { Logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Lazy-load heavy modules (Puppeteer, Lighthouse, etc.)
// The Orchestrator imports SecurityAgent/PerformanceAgent which pull in puppeteer
// at the module level. On hosted platforms without Chromium (Render free tier),
// this would crash the server at startup. We load them on-demand instead.
// ---------------------------------------------------------------------------
function lazyOrchestrator() {
  const { Orchestrator } = require('../orchestrator');
  return Orchestrator;
}

const logger = new Logger('dashboard');

// Track running scans so we can abort them
const runningScans = new Map<string, { orchestrator: any; abortController: AbortController }>();

const JWT_SECRET = process.env.JWT_SECRET || 'vzy-dashboard-secret-key-2026';
const JWT_EXPIRES_IN = '24h';

// ---------------------------------------------------------------------------
// PostgreSQL Connection
// ---------------------------------------------------------------------------
const pg = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://vzy:changeme@localhost:5432/vzy_agent',
});

// ---------------------------------------------------------------------------
// Express Setup
// ---------------------------------------------------------------------------
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.static('dashboard-ui'));

// ---------------------------------------------------------------------------
// JWT Auth Middleware
// ---------------------------------------------------------------------------
interface AuthRequest extends Request {
  user?: { id: string; email: string; name: string; role: string };
}

function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string; name: string; role: string };
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Database Initialization: Users Table + Default Admin
// ---------------------------------------------------------------------------
async function initializeAuthDB() {
  try {
    // Create users table
    await pg.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'developer',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_login TIMESTAMP WITH TIME ZONE,
        created_by UUID REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    `);

    // Create scan_reports table if not exists
    await pg.query(`
      CREATE TABLE IF NOT EXISTS scan_reports (
        id VARCHAR(100) PRIMARY KEY,
        scan_id VARCHAR(100) NOT NULL,
        target_url TEXT NOT NULL,
        platform VARCHAR(20) NOT NULL,
        overall_score DECIMAL(5,2) NOT NULL,
        security_score DECIMAL(5,2),
        performance_score DECIMAL(5,2),
        code_quality_score DECIMAL(5,2),
        critical_findings_count INTEGER DEFAULT 0,
        report_json JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_scan_reports_target ON scan_reports(target_url);
      CREATE INDEX IF NOT EXISTS idx_scan_reports_date ON scan_reports(created_at DESC);
    `);

    // Seed default admin if no users exist
    const userCount = await pg.query('SELECT COUNT(*) FROM users');
    if (parseInt(userCount.rows[0].count) === 0) {
      const adminPassword = await bcrypt.hash('admin123', 12);
      const devopsPassword = await bcrypt.hash('devops123', 12);
      const devPassword = await bcrypt.hash('dev123', 12);
      const execPassword = await bcrypt.hash('exec123', 12);

      await pg.query(
        `INSERT INTO users (email, name, password_hash, role) VALUES
          ($1, $2, $3, $4),
          ($5, $6, $7, $8),
          ($9, $10, $11, $12),
          ($13, $14, $15, $16)`,
        [
          'admin@dishtv.in', 'Admin User', adminPassword, 'admin',
          'devops@dishtv.in', 'DevOps Engineer', devopsPassword, 'devops',
          'dev@dishtv.in', 'Developer', devPassword, 'developer',
          'exec@dishtv.in', 'Executive', execPassword, 'executive',
        ],
      );
      logger.info('Default users seeded: admin@dishtv.in / admin123');
    }

    logger.info('Auth database initialized');
  } catch (error) {
    logger.error('Failed to initialize auth DB', { error: String(error) });
  }
}

// ============================= AUTH ROUTES =================================

// Login
app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const result = await pg.query(
      'SELECT id, email, name, password_hash, role, is_active FROM users WHERE email = $1',
      [email.toLowerCase()],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated. Contact your administrator.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    await pg.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN },
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });

    logger.info(`User logged in: ${user.email} [${user.role}]`);
  } catch (error) {
    logger.error('Login error', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user
app.get('/api/auth/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pg.query(
      'SELECT id, email, name, role, is_active, created_at, last_login FROM users WHERE id = $1',
      [req.user!.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================= USER MANAGEMENT (Admin Only) =================

// List all users
app.get('/api/auth/users', authMiddleware, requireRole('admin'), async (_req: AuthRequest, res: Response) => {
  try {
    const result = await pg.query(
      `SELECT id, email, name, role, is_active, created_at, last_login, updated_at
       FROM users ORDER BY created_at ASC`,
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('Failed to list users', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new user
app.post('/api/auth/users', authMiddleware, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const { email, name, password, role } = req.body;

  if (!email || !name || !password || !role) {
    return res.status(400).json({ error: 'email, name, password, and role are required' });
  }

  const validRoles = ['admin', 'devops', 'developer', 'executive'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
  }

  try {
    // Check for existing email
    const existing = await pg.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pg.query(
      `INSERT INTO users (email, name, password_hash, role, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, name, role, is_active, created_at`,
      [email.toLowerCase(), name, passwordHash, role, req.user!.id],
    );

    logger.info(`User created by ${req.user!.email}: ${email} [${role}]`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Failed to create user', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a user
app.put('/api/auth/users/:id', authMiddleware, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, role, is_active, password } = req.body;

  try {
    // Prevent admin from deactivating themselves
    if (id === req.user!.id && is_active === false) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (role !== undefined) {
      const validRoles = ['admin', 'devops', 'developer', 'executive'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
      }
      updates.push(`role = $${paramIndex++}`);
      values.push(role);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      updates.push(`password_hash = $${paramIndex++}`);
      values.push(hash);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pg.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, email, name, role, is_active, created_at, updated_at, last_login`,
      values,
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    logger.info(`User updated by ${req.user!.email}: ${result.rows[0].email}`);
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Failed to update user', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a user
app.delete('/api/auth/users/:id', authMiddleware, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  if (id === req.user!.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  try {
    const result = await pg.query(
      'DELETE FROM users WHERE id = $1 RETURNING id, email',
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    logger.info(`User deleted by ${req.user!.email}: ${result.rows[0].email}`);
    res.json({ message: 'User deleted', id: result.rows[0].id });
  } catch (error) {
    logger.error('Failed to delete user', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================= EXISTING API ENDPOINTS =======================

// Get latest scan report (direct PostgreSQL — no ResultStore/Redis dependency)
app.get('/api/reports/latest', async (req, res) => {
  const target = req.query.target as string;
  if (!target) return res.status(400).json({ error: 'target query param required' });

  try {
    const result = await pg.query(
      `SELECT report_json FROM scan_reports WHERE target_url = $1 ORDER BY created_at DESC LIMIT 1`,
      [target],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'No reports found' });
    res.json(result.rows[0].report_json);
  } catch (error) {
    logger.error('Failed to get latest report', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get trend data (direct PostgreSQL)
app.get('/api/trends', async (req, res) => {
  const target = req.query.target as string;
  const days = parseInt(req.query.days as string) || 30;

  if (!target) return res.status(400).json({ error: 'target query param required' });

  try {
    const result = await pg.query(
      `SELECT created_at as date, overall_score as score,
              security_score as security, performance_score as performance,
              code_quality_score as "codeQuality"
       FROM scan_reports
       WHERE target_url = $1 AND created_at > NOW() - make_interval(days => $2)
       ORDER BY created_at`,
      [target, days],
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('Failed to get trends', { error: String(error) });
    res.json([]);
  }
});

// Trigger manual scan
app.post('/api/scans', authMiddleware, requireRole('admin', 'devops') as any, async (req: Request, res: Response) => {
  const { url, repoPath, agents, platform } = req.body;

  if (!url && !repoPath) {
    return res.status(400).json({ error: 'url or repoPath required' });
  }

  const OrchestratorClass = lazyOrchestrator();
  const config = OrchestratorClass.createConfig({ url, repoPath, agents, platform });
  res.json({ status: 'queued', scanId: config.id });

  // Run scan in background with abort support
  const orchestrator = new OrchestratorClass();
  const abortController = new AbortController();
  runningScans.set(config.id, { orchestrator, abortController });

  try {
    const report = await orchestrator.runScan(config);

    // Only emit if not aborted
    if (!abortController.signal.aborted) {
      io.emit('scan:complete', {
        scanId: config.id,
        score: report.kpiScore.overallScore,
        status: report.kpiScore.passesThreshold ? 'pass' : 'fail',
      });
    }
  } catch (error) {
    if (abortController.signal.aborted) {
      io.emit('scan:error', { scanId: config.id, error: 'Scan aborted by user' });
    } else {
      io.emit('scan:error', { scanId: config.id, error: String(error) });
    }
  } finally {
    runningScans.delete(config.id);
  }
});

// Batch scan — run multiple URLs sequentially
app.post('/api/scans/batch', authMiddleware, requireRole('admin', 'devops') as any, async (req: Request, res: Response) => {
  const { urls, agents, platform } = req.body;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'urls array required' });
  }

  if (urls.length > 20) {
    return res.status(400).json({ error: 'Maximum 20 URLs per batch' });
  }

  const batchId = `batch_${Date.now()}`;

  // De-duplicate and trim URLs
  const uniqueUrls = [...new Set(urls.map((u: string) => u.trim()).filter(Boolean))];

  const OrchestratorClass = lazyOrchestrator();

  // Create configs lazily per URL (avoid sharing state between configs)
  const scanEntries = uniqueUrls.map((url: string) => {
    const config = OrchestratorClass.createConfig({ url, agents, platform });
    return { url, scanId: config.id, config, status: 'queued' as string };
  });

  // Return immediately with batch info
  res.json({
    batchId,
    total: scanEntries.length,
    scans: scanEntries.map((s) => ({ url: s.url, scanId: s.scanId, status: 'queued' })),
  });

  // Emit batch start
  io.emit('batch:start', { batchId, total: scanEntries.length });

  const BATCH_SCAN_TIMEOUT = 360_000; // 6 minutes per URL (slightly more than agent timeout)
  const INTER_SCAN_DELAY = 3_000;     // 3 seconds between scans for cleanup

  // Process sequentially with robust error isolation
  for (let i = 0; i < scanEntries.length; i++) {
    const entry = scanEntries[i];

    // Inter-scan delay to allow previous browser/resource cleanup
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, INTER_SCAN_DELAY));
    }

    logger.info(`[Batch ${batchId}] Starting scan ${i + 1}/${scanEntries.length}: ${entry.url}`);

    const orchestrator = new OrchestratorClass();
    const abortController = new AbortController();
    runningScans.set(entry.scanId, { orchestrator, abortController });

    io.emit('batch:progress', {
      batchId,
      current: i + 1,
      total: scanEntries.length,
      scanId: entry.scanId,
      url: entry.url,
      status: 'running',
    });

    try {
      // Wrap each scan in its own timeout to prevent one hanging URL from stalling the batch
      const report = await Promise.race([
        orchestrator.runScan(entry.config),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Batch scan timeout after ${BATCH_SCAN_TIMEOUT / 1000}s for ${entry.url}`)), BATCH_SCAN_TIMEOUT),
        ),
      ]);

      if (!abortController.signal.aborted) {
        io.emit('scan:complete', {
          scanId: entry.scanId,
          url: entry.url,
          score: report.kpiScore.overallScore,
          status: report.kpiScore.passesThreshold ? 'pass' : 'fail',
          batchId,
        });
        io.emit('batch:progress', {
          batchId,
          current: i + 1,
          total: scanEntries.length,
          scanId: entry.scanId,
          url: entry.url,
          status: 'completed',
          score: report.kpiScore.overallScore,
        });
        logger.info(`[Batch ${batchId}] Scan ${i + 1} completed: ${entry.url} → ${report.kpiScore.overallScore}`);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[Batch ${batchId}] Scan ${i + 1} failed: ${entry.url}`, { error: errMsg });

      io.emit('scan:error', { scanId: entry.scanId, url: entry.url, error: errMsg, batchId });
      io.emit('batch:progress', {
        batchId,
        current: i + 1,
        total: scanEntries.length,
        scanId: entry.scanId,
        url: entry.url,
        status: 'error',
        error: errMsg,
      });
    } finally {
      runningScans.delete(entry.scanId);
    }
  }

  // Emit batch complete
  io.emit('batch:complete', { batchId, total: scanEntries.length });
  logger.info(`Batch scan completed: ${batchId} (${scanEntries.length} URLs)`);
});

// Abort a running scan
app.post('/api/scans/:scanId/abort', authMiddleware, requireRole('admin', 'devops') as any, async (req: AuthRequest, res: Response) => {
  const { scanId } = req.params;
  const running = runningScans.get(scanId);

  if (!running) {
    return res.status(404).json({ error: 'Scan not found or already completed' });
  }

  try {
    // Signal abort
    running.abortController.abort();

    // Try to stop the orchestrator if it has a cancel method
    if (typeof (running.orchestrator as any).cancel === 'function') {
      await (running.orchestrator as any).cancel();
    }

    runningScans.delete(scanId);
    io.emit('scan:error', { scanId, error: 'Scan aborted by user' });

    logger.info(`Scan aborted by ${req.user!.email}: ${scanId}`);
    res.json({ message: 'Scan aborted', scanId });
  } catch (error) {
    logger.error('Failed to abort scan', { error: String(error), scanId });
    res.status(500).json({ error: 'Failed to abort scan' });
  }
});

// ============================= REPORT ENDPOINTS ==============================

// Get report by scan ID
app.get('/api/reports/:scanId', async (req, res) => {
  const { scanId } = req.params;
  try {
    const result = await pg.query(
      'SELECT report_json FROM scan_reports WHERE scan_id = $1 LIMIT 1',
      [scanId],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Report not found' });
    res.json(result.rows[0].report_json);
  } catch (error) {
    logger.error('Failed to get report', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get report history with optional target filter
app.get('/api/reports', async (req, res) => {
  const target = req.query.target as string;
  const limit = parseInt(req.query.limit as string) || 20;
  try {
    let query: string;
    let params: any[];
    if (target) {
      query = 'SELECT report_json FROM scan_reports WHERE target_url = $1 ORDER BY created_at DESC LIMIT $2';
      params = [target, limit];
    } else {
      query = 'SELECT report_json FROM scan_reports ORDER BY created_at DESC LIMIT $1';
      params = [limit];
    }
    const result = await pg.query(query, params);
    res.json(result.rows.map((r: any) => r.report_json));
  } catch (error) {
    logger.error('Failed to get reports', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================= SYSTEM CONFIG =================================

// In-memory config (persistent via PostgreSQL in production)
let systemConfig = {
  schedule: { cron: '0 2 * * *', timezone: 'Asia/Kolkata', enabled: true },
  thresholds: { overall: 95, security: 90, performance: 95, codeQuality: 85 },
  notifications: {
    slack: { enabled: false, channel: '#ott-monitoring' },
    email: { enabled: false, recipients: ['cto@dishtv.in'] },
    jira: { enabled: false, projectKey: 'OTT', autoCreate: false },
  },
};

// Load config from DB on startup
async function loadSystemConfig() {
  try {
    await pg.query(`
      CREATE TABLE IF NOT EXISTS system_config (
        key VARCHAR(50) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    const result = await pg.query("SELECT value FROM system_config WHERE key = 'main'");
    if (result.rows.length > 0) {
      systemConfig = { ...systemConfig, ...result.rows[0].value };
    }
  } catch {
    // Use defaults
  }
}

app.get('/api/config', authMiddleware as any, async (_req, res) => {
  res.json(systemConfig);
});

app.patch('/api/config', authMiddleware as any, requireRole('admin', 'devops') as any, async (req: AuthRequest, res: Response) => {
  try {
    systemConfig = { ...systemConfig, ...req.body };
    await pg.query(
      `INSERT INTO system_config (key, value, updated_at) VALUES ('main', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify(systemConfig)],
    );
    logger.info(`Config updated by ${req.user!.email}`);
    res.json(systemConfig);
  } catch (error) {
    logger.error('Failed to save config', { error: String(error) });
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

// ============================= WEBHOOK LOGS ==================================

app.get('/api/webhooks/logs', authMiddleware as any, async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  try {
    // Create webhook_logs table if not exists
    await pg.query(`
      CREATE TABLE IF NOT EXISTS webhook_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        event VARCHAR(100) NOT NULL,
        source VARCHAR(100) NOT NULL,
        status VARCHAR(20) NOT NULL,
        payload JSONB DEFAULT '{}'
      )
    `);
    const result = await pg.query(
      'SELECT id, timestamp, event, source, status, payload FROM webhook_logs ORDER BY timestamp DESC LIMIT $1',
      [limit],
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('Failed to get webhook logs', { error: String(error) });
    res.json([]); // Return empty array on failure so frontend doesn't crash
  }
});

// ============================= JIRA INTEGRATION ==============================

app.post('/api/jira/create', authMiddleware as any, requireRole('admin', 'devops') as any, async (req: AuthRequest, res: Response) => {
  const { findingId } = req.body;
  if (!findingId) return res.status(400).json({ error: 'findingId required' });

  // Placeholder - would connect to actual Jira API with JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN
  const ticketId = `OTT-${Math.floor(Math.random() * 9000) + 1000}`;
  logger.info(`Jira ticket created: ${ticketId} for finding ${findingId} by ${req.user!.email}`);
  res.json({ ticketId, url: `${process.env.JIRA_HOST || 'https://dishtv.atlassian.net'}/browse/${ticketId}` });
});

// Health check (public)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ============================= WEBSOCKET ===================================
io.on('connection', (socket) => {
  logger.info(`Dashboard client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    logger.info(`Dashboard client disconnected: ${socket.id}`);
  });
});

// ============================= START SERVER =================================
const PORT = parseInt(process.env.PORT || process.env.DASHBOARD_PORT || '3001');
const HOST = process.env.HOST || '0.0.0.0';  // Bind to all interfaces (required for Render/Docker)

// Catch unhandled errors so the server doesn't crash silently
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { error: String(reason) });
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: String(err), stack: err.stack });
  // Don't exit — let health check keep responding
});

async function start() {
  try {
    await initializeAuthDB();
  } catch (err) {
    logger.error('DB init failed (will retry on first request)', { error: String(err) });
  }

  try {
    await loadSystemConfig();
  } catch (err) {
    logger.error('Config load failed (using defaults)', { error: String(err) });
  }

  server.listen(PORT, HOST, () => {
    logger.info(`Dashboard API running on http://${HOST}:${PORT}`);
    logger.info(`Default admin credentials: admin@dishtv.in / admin123`);
  });
}

start().catch((err) => {
  logger.error('Failed to start server', { error: String(err) });
  process.exit(1);
});
