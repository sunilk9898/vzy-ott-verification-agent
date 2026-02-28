"use client";

import { useState, useEffect } from "react";
import {
  Play, Settings2, Bell, Clock, Globe, Webhook,
  Loader2, CheckCircle2, XCircle, Slack, Mail, Ticket,
  RefreshCw, Save, StopCircle, List, ArrowRight,
} from "lucide-react";
import { ScanInput } from "@/components/shared/scan-input";
import { MetricCard } from "@/components/cards/metric-card";
import { useScanReport } from "@/hooks/use-scan-report";
import { useScanStore, useAuthStore, useBatchStore, useReportStore, type BatchScanEntry } from "@/lib/store";
import { getConfig, updateConfig, getWebhookLogs, getHealth, abortScan, triggerBatchScan, getLatestReport, type SystemConfig, type WebhookLog } from "@/lib/api";
import { onBatchProgress, onBatchComplete } from "@/lib/websocket";
import { cn, timeAgo } from "@/lib/utils";

export default function ControlCenterPage() {
  const { startScan, loading, activeScan, target, setTarget } = useScanReport();
  const { user } = useAuthStore();
  const { scanHistory, setActiveScan } = useScanStore();
  const { batchId, batchScans, batchRunning, startBatch, updateBatchEntry, clearBatch } = useBatchStore();

  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [health, setHealth] = useState<{ status: string; uptime: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [aborting, setAborting] = useState(false);
  const [activeSection, setActiveSection] = useState<"scan" | "schedule" | "thresholds" | "notifications" | "webhooks">("scan");

  // Load a specific URL's report into the global store (used by all sub-pages)
  const loadReportForUrl = async (url: string) => {
    setTarget(url);
    try {
      const r = await getLatestReport(url);
      useReportStore.getState().setReport(r);
    } catch (e: any) {
      console.warn("Failed to load report for", url, e.message);
    }
  };

  // Abort a running scan
  const handleAbortScan = async () => {
    if (!activeScan) return;
    setAborting(true);
    try {
      await abortScan(activeScan.scanId);
    } catch {
      console.warn("Backend abort failed — clearing local scan state");
    }
    setActiveScan(null);
    setAborting(false);
  };

  // Handle batch scan submission
  const handleBatchSubmit = async (config: { urls: string[]; platform: any; agents: any[] }) => {
    try {
      const res = await triggerBatchScan(config);
      startBatch(res.batchId, res.scans.map((s) => ({ url: s.url, scanId: s.scanId })));
    } catch (err: any) {
      alert(`Batch scan failed: ${err.message}`);
    }
  };

  // Listen for batch WebSocket events
  useEffect(() => {
    const unsubProgress = onBatchProgress((data) => {
      updateBatchEntry(data.scanId, {
        status: data.status as BatchScanEntry["status"],
        score: data.score,
        error: data.error,
      });
      // Auto-load first completed URL's report
      if (data.status === "completed" && data.url && !useReportStore.getState().target) {
        loadReportForUrl(data.url);
      }
    });
    const unsubComplete = onBatchComplete(() => {
      useBatchStore.setState({ batchRunning: false });
      // If no target set yet, load first completed
      const completed = useBatchStore.getState().batchScans.find((s) => s.status === "completed");
      if (completed && !useReportStore.getState().target) {
        loadReportForUrl(completed.url);
      }
    });
    return () => {
      unsubProgress();
      unsubComplete();
    };
  }, [updateBatchEntry]);

  // Load config & health
  useEffect(() => {
    getConfig().then(setConfig).catch(() => {});
    getHealth().then(setHealth).catch(() => {});
    getWebhookLogs(20).then(setWebhookLogs).catch(() => {});
  }, []);

  const handleSaveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const updated = await updateConfig(config);
      setConfig(updated);
    } catch {
      alert("Failed to save configuration");
    }
    setSaving(false);
  };

  // RBAC check
  if (user && !["admin", "devops"].includes(user.role)) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center text-gray-500 space-y-2">
          <Settings2 className="w-12 h-12 mx-auto opacity-30" />
          <p className="text-sm">Access restricted to Admin and DevOps roles.</p>
        </div>
      </div>
    );
  }

  // Batch stats
  const batchCompleted = batchScans.filter((s) => s.status === "completed").length;
  const batchErrors = batchScans.filter((s) => s.status === "error").length;
  const batchTotal = batchScans.length;

  const sections = [
    { id: "scan" as const, label: "Run Scan", icon: Play },
    { id: "schedule" as const, label: "Schedule", icon: Clock },
    { id: "thresholds" as const, label: "KPI Thresholds", icon: Settings2 },
    { id: "notifications" as const, label: "Notifications", icon: Bell },
    { id: "webhooks" as const, label: "Webhook Logs", icon: Webhook },
  ];

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-100">Control Center</h1>
          <p className="text-sm text-gray-500">Scan management, scheduling, configuration, and integrations</p>
        </div>
        {health && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/[0.06] border border-green-500/20">
            <div className="status-dot-healthy" />
            <span className="text-xs text-green-400">System Online</span>
            <span className="text-xs text-gray-500 ml-2">Uptime: {Math.floor((health.uptime || 0) / 3600)}h</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Sidebar nav */}
        <div className="col-span-12 md:col-span-3">
          <nav className="space-y-1">
            {sections.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors",
                    activeSection === s.id ? "bg-brand-600/15 text-brand-400" : "text-gray-400 hover:bg-white/[0.04] hover:text-gray-200",
                  )}
                >
                  <Icon className="w-4 h-4" /> {s.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="col-span-12 md:col-span-9 space-y-6">
          {/* ── RUN SCAN ── */}
          {activeSection === "scan" && (
            <>
              <ScanInput
                onSubmit={(c) => startScan(c)}
                onBatchSubmit={handleBatchSubmit}
                loading={loading || batchRunning}
              />

              {/* Active single scan progress */}
              {activeScan && (
                <div className="card p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-brand-400 animate-spin" />
                      <span className="text-sm font-medium text-brand-400">Scan in Progress</span>
                      <span className="text-xs text-gray-500">{activeScan.scanId}</span>
                    </div>
                    <button
                      onClick={handleAbortScan}
                      disabled={aborting}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    >
                      {aborting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <StopCircle className="w-3.5 h-3.5" />
                      )}
                      {aborting ? "Aborting..." : "Abort Scan"}
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {Object.entries(activeScan.agents).map(([agent, info]) => (
                      <div key={agent} className="p-3 rounded-lg bg-surface-1 text-center">
                        <div className="text-xs text-gray-400 capitalize">{agent}</div>
                        <div className={cn(
                          "text-sm font-medium mt-1",
                          info.status === "completed" ? "text-green-400" : info.status === "running" ? "text-brand-400" : "text-gray-500",
                        )}>
                          {info.status === "completed" ? "Done" : info.status === "running" ? `${info.progress}%` : "Queued"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── BATCH SCAN PROGRESS ── */}
              {batchScans.length > 0 && (
                <div className="card">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                    <div className="flex items-center gap-3">
                      {batchRunning ? (
                        <Loader2 className="w-4 h-4 text-brand-400 animate-spin" />
                      ) : (
                        <List className="w-4 h-4 text-brand-400" />
                      )}
                      <div>
                        <h3 className="text-sm font-semibold text-gray-200">
                          Batch Scan {batchRunning ? "in Progress" : "Complete"}
                        </h3>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          {batchCompleted}/{batchTotal} completed
                          {batchErrors > 0 && ` · ${batchErrors} failed`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Progress bar */}
                      <div className="w-32 h-1.5 bg-surface-4 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-500 rounded-full transition-all duration-500"
                          style={{ width: `${batchTotal > 0 ? ((batchCompleted + batchErrors) / batchTotal) * 100 : 0}%` }}
                        />
                      </div>
                      {!batchRunning && (
                        <button
                          onClick={clearBatch}
                          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="divide-y divide-white/[0.04] max-h-[400px] overflow-y-auto">
                    {batchScans.map((scan, i) => {
                      const isClickable = scan.status === "completed";
                      const isActive = target === scan.url;
                      return (
                        <div
                          key={scan.scanId}
                          onClick={() => isClickable && loadReportForUrl(scan.url)}
                          className={cn(
                            "px-5 py-3 flex items-center justify-between transition-colors",
                            isClickable && "cursor-pointer hover:bg-white/[0.04]",
                            isActive && "bg-brand-600/10 border-l-2 border-brand-500",
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="text-[10px] text-gray-600 w-5 text-right shrink-0">{i + 1}.</span>
                            {scan.status === "completed" ? (
                              <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                            ) : scan.status === "running" ? (
                              <Loader2 className="w-4 h-4 text-brand-400 animate-spin shrink-0" />
                            ) : scan.status === "error" ? (
                              <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                            ) : (
                              <Clock className="w-4 h-4 text-gray-500 shrink-0" />
                            )}
                            <span className="text-xs text-gray-300 truncate">{scan.url}</span>
                            {isActive && <span className="text-[9px] text-brand-400 font-medium ml-1">Active</span>}
                          </div>
                          <div className="flex items-center gap-3 shrink-0 ml-3">
                            {scan.score !== undefined && (
                              <span className={cn(
                                "text-sm font-bold",
                                scan.score >= 95 ? "text-green-400" : scan.score >= 70 ? "text-amber-400" : "text-red-400",
                              )}>
                                {scan.score}
                              </span>
                            )}
                            <span className={cn(
                              "text-[10px] px-2 py-0.5 rounded-full font-medium",
                              scan.status === "completed" ? "bg-green-500/15 text-green-400" :
                              scan.status === "running" ? "bg-brand-500/15 text-brand-400" :
                              scan.status === "error" ? "bg-red-500/15 text-red-400" :
                              "bg-white/[0.06] text-gray-500",
                            )}>
                              {scan.status === "completed" ? "Done" : scan.status === "running" ? "Scanning" : scan.status === "error" ? "Failed" : "Queued"}
                            </span>
                            {isClickable && <ArrowRight className="w-3 h-3 text-gray-500" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {!batchRunning && batchScans.some((s) => s.status === "completed") && (
                    <div className="px-5 py-2 border-t border-white/[0.06]">
                      <p className="text-[10px] text-gray-500">Click a completed scan to view its detailed report</p>
                    </div>
                  )}
                </div>
              )}

              {/* Recent scan history */}
              {scanHistory.length > 0 && (
                <div className="card">
                  <div className="px-5 py-4 border-b border-white/[0.06]">
                    <h3 className="text-sm font-semibold text-gray-200">Recent Scans</h3>
                  </div>
                  <div className="divide-y divide-white/[0.04]">
                    {scanHistory.slice(0, 10).map((scan) => (
                      <div key={scan.scanId} className="px-5 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {scan.status === "pass" ? (
                            <CheckCircle2 className="w-4 h-4 text-green-400" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-400" />
                          )}
                          <span className="text-xs font-mono text-gray-400">{scan.scanId}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className={cn("text-sm font-bold", scan.score >= 95 ? "text-green-400" : "text-amber-400")}>{scan.score}</span>
                          <span className="text-xs text-gray-500">{timeAgo(scan.timestamp)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── SCHEDULE ── */}
          {activeSection === "schedule" && config && (
            <div className="card p-5 space-y-4">
              <h3 className="text-sm font-semibold text-gray-200">Scan Schedule</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Cron Expression</label>
                  <input
                    value={config.schedule.cron}
                    onChange={(e) => setConfig({ ...config, schedule: { ...config.schedule, cron: e.target.value } })}
                    className="input font-mono"
                    placeholder="0 2 * * *"
                  />
                  <p className="text-[10px] text-gray-600 mt-1">Default: 0 2 * * * (Daily at 2 AM)</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Timezone</label>
                  <input
                    value={config.schedule.timezone}
                    onChange={(e) => setConfig({ ...config, schedule: { ...config.schedule, timezone: e.target.value } })}
                    className="input"
                    placeholder="Asia/Kolkata"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-300">Scheduler Enabled</label>
                <button
                  onClick={() => setConfig({ ...config, schedule: { ...config.schedule, enabled: !config.schedule.enabled } })}
                  className={cn(
                    "w-10 h-6 rounded-full transition-colors relative",
                    config.schedule.enabled ? "bg-brand-600" : "bg-surface-4",
                  )}
                >
                  <span className={cn(
                    "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                    config.schedule.enabled ? "left-5" : "left-1",
                  )} />
                </button>
              </div>
              <button onClick={handleSaveConfig} disabled={saving} className="btn-primary">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Schedule
              </button>
            </div>
          )}

          {/* ── KPI THRESHOLDS ── */}
          {activeSection === "thresholds" && config && (
            <div className="card p-5 space-y-4">
              <h3 className="text-sm font-semibold text-gray-200">KPI Score Thresholds</h3>
              <p className="text-xs text-gray-500">Set minimum passing scores. Scans below these thresholds trigger alerts.</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {(["overall", "security", "performance", "codeQuality"] as const).map((key) => (
                  <div key={key}>
                    <label className="text-xs text-gray-500 capitalize mb-1 block">{key.replace("codeQuality", "Code Quality")}</label>
                    <input
                      type="number" min={0} max={100}
                      value={config.thresholds[key]}
                      onChange={(e) => setConfig({ ...config, thresholds: { ...config.thresholds, [key]: Number(e.target.value) } })}
                      className="input text-center font-mono"
                    />
                  </div>
                ))}
              </div>
              <button onClick={handleSaveConfig} disabled={saving} className="btn-primary">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Thresholds
              </button>
            </div>
          )}

          {/* ── NOTIFICATIONS ── */}
          {activeSection === "notifications" && config && (
            <div className="space-y-4">
              {/* Slack */}
              <div className="card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Slack className="w-4 h-4 text-gray-400" /><span className="text-sm font-semibold text-gray-200">Slack</span></div>
                  <button
                    onClick={() => setConfig({ ...config, notifications: { ...config.notifications, slack: { ...config.notifications.slack, enabled: !config.notifications.slack.enabled } } })}
                    className={cn("w-10 h-6 rounded-full transition-colors relative", config.notifications.slack.enabled ? "bg-brand-600" : "bg-surface-4")}
                  >
                    <span className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-transform", config.notifications.slack.enabled ? "left-5" : "left-1")} />
                  </button>
                </div>
                {config.notifications.slack.enabled && (
                  <input value={config.notifications.slack.channel} onChange={(e) => setConfig({ ...config, notifications: { ...config.notifications, slack: { ...config.notifications.slack, channel: e.target.value } } })} className="input" placeholder="#ott-monitoring" />
                )}
              </div>

              {/* Email */}
              <div className="card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400" /><span className="text-sm font-semibold text-gray-200">Email</span></div>
                  <button
                    onClick={() => setConfig({ ...config, notifications: { ...config.notifications, email: { ...config.notifications.email, enabled: !config.notifications.email.enabled } } })}
                    className={cn("w-10 h-6 rounded-full transition-colors relative", config.notifications.email.enabled ? "bg-brand-600" : "bg-surface-4")}
                  >
                    <span className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-transform", config.notifications.email.enabled ? "left-5" : "left-1")} />
                  </button>
                </div>
                {config.notifications.email.enabled && (
                  <input value={config.notifications.email.recipients.join(", ")} onChange={(e) => setConfig({ ...config, notifications: { ...config.notifications, email: { ...config.notifications.email, recipients: e.target.value.split(",").map((s: string) => s.trim()) } } })} className="input" placeholder="cto@dishtv.in, dev@dishtv.in" />
                )}
              </div>

              {/* Jira */}
              <div className="card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Ticket className="w-4 h-4 text-gray-400" /><span className="text-sm font-semibold text-gray-200">Jira Auto-Tickets</span></div>
                  <button
                    onClick={() => setConfig({ ...config, notifications: { ...config.notifications, jira: { ...config.notifications.jira, enabled: !config.notifications.jira.enabled } } })}
                    className={cn("w-10 h-6 rounded-full transition-colors relative", config.notifications.jira.enabled ? "bg-brand-600" : "bg-surface-4")}
                  >
                    <span className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-transform", config.notifications.jira.enabled ? "left-5" : "left-1")} />
                  </button>
                </div>
                {config.notifications.jira.enabled && (
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-gray-500">Auto-create for:</label>
                    <span className="badge bg-red-500/15 text-red-400 border-red-500/30 text-xs">Critical & High</span>
                    <span className="text-xs text-gray-500">Project: {config.notifications.jira.projectKey}</span>
                  </div>
                )}
              </div>

              <button onClick={handleSaveConfig} disabled={saving} className="btn-primary">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Notification Settings
              </button>
            </div>
          )}

          {/* ── WEBHOOK LOGS ── */}
          {activeSection === "webhooks" && (
            <div className="card">
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                <h3 className="text-sm font-semibold text-gray-200">Webhook Logs</h3>
                <button onClick={() => getWebhookLogs(20).then(setWebhookLogs)} className="btn-ghost text-xs">
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
              </div>
              <table className="data-table">
                <thead><tr><th>Time</th><th>Event</th><th>Source</th><th>Status</th></tr></thead>
                <tbody>
                  {webhookLogs.length === 0 ? (
                    <tr><td colSpan={4} className="text-center text-gray-500 py-8">No webhook events</td></tr>
                  ) : (
                    webhookLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="text-xs text-gray-400">{timeAgo(log.timestamp)}</td>
                        <td className="text-xs text-gray-200">{log.event}</td>
                        <td className="text-xs text-gray-400">{log.source}</td>
                        <td>
                          {log.status === "success" ? (
                            <span className="badge bg-green-500/15 text-green-400 border-green-500/30 text-[10px]">Success</span>
                          ) : (
                            <span className="badge bg-red-500/15 text-red-400 border-red-500/30 text-[10px]">Failed</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
