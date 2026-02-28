// ============================================================================
// API Client - Consumes existing backend REST endpoints
// ============================================================================

import type { ScanReport, AgentType, Platform } from "@/types/api";

const BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

// ---------------------------------------------------------------------------
// Generic Fetch Wrapper
// ---------------------------------------------------------------------------
async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("vzy_token") : null;

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error || res.statusText);
  }

  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
export async function getLatestReport(target: string): Promise<ScanReport> {
  return request<ScanReport>(`/reports/latest?target=${encodeURIComponent(target)}`);
}

export async function getReportById(scanId: string): Promise<ScanReport> {
  return request<ScanReport>(`/reports/${scanId}`);
}

export async function getReportHistory(
  target: string,
  limit = 20,
): Promise<ScanReport[]> {
  return request<ScanReport[]>(
    `/reports?target=${encodeURIComponent(target)}&limit=${limit}`,
  );
}

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------
export interface TrendPoint {
  date: string;
  score: number;
  security?: number;
  performance?: number;
  codeQuality?: number;
}

export async function getTrends(
  target: string,
  days = 30,
): Promise<TrendPoint[]> {
  return request<TrendPoint[]>(
    `/trends?target=${encodeURIComponent(target)}&days=${days}`,
  );
}

// ---------------------------------------------------------------------------
// Scans
// ---------------------------------------------------------------------------
export interface ScanRequest {
  url?: string;
  repoPath?: string;
  agents?: AgentType[];
  platform?: Platform;
}

export interface ScanResponse {
  status: "accepted" | "queued";
  scanId: string;
}

export async function triggerScan(body: ScanRequest): Promise<ScanResponse> {
  return request<ScanResponse>("/scans", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface BatchScanResponse {
  batchId: string;
  total: number;
  scans: { url: string; scanId: string; status: string }[];
}

export async function triggerBatchScan(body: {
  urls: string[];
  agents?: AgentType[];
  platform?: Platform;
}): Promise<BatchScanResponse> {
  return request<BatchScanResponse>("/scans/batch", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function abortScan(scanId: string): Promise<{ message: string; scanId: string }> {
  return request<{ message: string; scanId: string }>(`/scans/${scanId}/abort`, {
    method: "POST",
  });
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
export interface SystemConfig {
  schedule: { cron: string; timezone: string; enabled: boolean };
  thresholds: { overall: number; security: number; performance: number; codeQuality: number };
  notifications: {
    slack: { enabled: boolean; channel: string };
    email: { enabled: boolean; recipients: string[] };
    jira: { enabled: boolean; projectKey: string; autoCreate: boolean };
  };
}

export async function getConfig(): Promise<SystemConfig> {
  return request<SystemConfig>("/config");
}

export async function updateConfig(config: Partial<SystemConfig>): Promise<SystemConfig> {
  return request<SystemConfig>("/config", {
    method: "PATCH",
    body: JSON.stringify(config),
  });
}

// ---------------------------------------------------------------------------
// Webhook Logs
// ---------------------------------------------------------------------------
export interface WebhookLog {
  id: string;
  timestamp: string;
  event: string;
  source: string;
  status: "success" | "failed";
  payload: Record<string, unknown>;
}

export async function getWebhookLogs(limit = 50): Promise<WebhookLog[]> {
  return request<WebhookLog[]>(`/webhooks/logs?limit=${limit}`);
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export async function login(
  email: string,
  password: string,
): Promise<{ token: string; user: { id: string; email: string; name: string; role: string } }> {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

// ---------------------------------------------------------------------------
// User Management (Admin)
// ---------------------------------------------------------------------------
export interface ManagedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  last_login?: string;
}

export async function getUsers(): Promise<ManagedUser[]> {
  return request<ManagedUser[]>("/auth/users");
}

export async function createUser(data: {
  email: string;
  name: string;
  password: string;
  role: string;
}): Promise<ManagedUser> {
  return request<ManagedUser>("/auth/users", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateUser(
  id: string,
  data: { name?: string; role?: string; is_active?: boolean; password?: string },
): Promise<ManagedUser> {
  return request<ManagedUser>(`/auth/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteUser(id: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/auth/users/${id}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
export async function getHealth(): Promise<{
  status: string;
  uptime: number;
  timestamp: string;
}> {
  return request("/health");
}

// ---------------------------------------------------------------------------
// Jira
// ---------------------------------------------------------------------------
export async function createJiraTicket(findingId: string): Promise<{ ticketId: string; url: string }> {
  return request("/jira/create", {
    method: "POST",
    body: JSON.stringify({ findingId }),
  });
}
