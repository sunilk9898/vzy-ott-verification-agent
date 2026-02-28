// ============================================================================
// Zustand Store - Global client state for dashboard
// ============================================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ScanReport,
  User,
  UserRole,
  ScanStatus,
  AgentType,
} from "@/types/api";

// ---------------------------------------------------------------------------
// Auth Store
// ---------------------------------------------------------------------------
interface AuthStore {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  hasRole: (roles: UserRole[]) => boolean;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        set({ user, token });
        if (typeof window !== "undefined") {
          localStorage.setItem("vzy_token", token);
          // Set cookie so Next.js middleware can read it server-side
          document.cookie = `vzy_token=${token}; path=/; max-age=${60 * 60 * 24}; SameSite=Lax`;
        }
      },
      logout: () => {
        set({ user: null, token: null });
        if (typeof window !== "undefined") {
          localStorage.removeItem("vzy_token");
          // Clear the cookie
          document.cookie = "vzy_token=; path=/; max-age=0";
        }
      },
      hasRole: (roles) => {
        const user = get().user;
        return user ? roles.includes(user.role) : false;
      },
    }),
    { name: "vzy-auth" },
  ),
);

// ---------------------------------------------------------------------------
// Report Store
// ---------------------------------------------------------------------------
interface ReportStore {
  report: ScanReport | null;
  target: string;
  loading: boolean;
  error: string | null;
  setReport: (report: ScanReport) => void;
  setTarget: (target: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useReportStore = create<ReportStore>((set) => ({
  report: null,
  target: "",
  loading: false,
  error: null,
  setReport: (report) => set({ report, error: null }),
  setTarget: (target) => set({ target }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
}));

// ---------------------------------------------------------------------------
// Scan Activity Store (real-time)
// ---------------------------------------------------------------------------
interface ScanActivity {
  scanId: string;
  status: ScanStatus;
  agents: Record<AgentType, { progress: number; status: ScanStatus }>;
  startedAt: string;
  score?: number;
}

interface ScanStore {
  activeScan: ScanActivity | null;
  scanHistory: { scanId: string; score: number; status: string; timestamp: string }[];
  setActiveScan: (scan: ScanActivity | null) => void;
  updateAgentProgress: (scanId: string, agent: AgentType, progress: number, status: ScanStatus) => void;
  completeScan: (scanId: string, score: number, status: string) => void;
}

export const useScanStore = create<ScanStore>((set, get) => ({
  activeScan: null,
  scanHistory: [],
  setActiveScan: (scan) => set({ activeScan: scan }),
  updateAgentProgress: (scanId, agent, progress, status) => {
    const current = get().activeScan;
    if (!current || current.scanId !== scanId) return;
    set({
      activeScan: {
        ...current,
        agents: { ...current.agents, [agent]: { progress, status } },
      },
    });
  },
  completeScan: (scanId, score, status) => {
    set((state) => ({
      activeScan: null,
      scanHistory: [
        { scanId, score, status, timestamp: new Date().toISOString() },
        ...state.scanHistory.slice(0, 49),
      ],
    }));
  },
}));

// ---------------------------------------------------------------------------
// Batch Scan Store (multi-URL)
// ---------------------------------------------------------------------------
export interface BatchScanEntry {
  url: string;
  scanId: string;
  status: "queued" | "running" | "completed" | "error";
  score?: number;
  error?: string;
}

interface BatchStore {
  batchId: string | null;
  batchScans: BatchScanEntry[];
  batchRunning: boolean;
  startBatch: (batchId: string, scans: { url: string; scanId: string }[]) => void;
  updateBatchEntry: (scanId: string, updates: Partial<BatchScanEntry>) => void;
  clearBatch: () => void;
}

export const useBatchStore = create<BatchStore>((set) => ({
  batchId: null,
  batchScans: [],
  batchRunning: false,
  startBatch: (batchId, scans) =>
    set({
      batchId,
      batchScans: scans.map((s) => ({ ...s, status: "queued" as const })),
      batchRunning: true,
    }),
  updateBatchEntry: (scanId, updates) =>
    set((state) => ({
      batchScans: state.batchScans.map((s) =>
        s.scanId === scanId ? { ...s, ...updates } : s,
      ),
    })),
  clearBatch: () => set({ batchId: null, batchScans: [], batchRunning: false }),
}));

// ---------------------------------------------------------------------------
// UI Preferences
// ---------------------------------------------------------------------------
interface UIStore {
  sidebarCollapsed: boolean;
  trendRange: 7 | 30 | 90;
  toggleSidebar: () => void;
  setTrendRange: (range: 7 | 30 | 90) => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      trendRange: 30,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setTrendRange: (trendRange) => set({ trendRange }),
    }),
    { name: "vzy-ui" },
  ),
);
