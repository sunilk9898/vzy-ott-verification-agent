// ============================================================================
// WebSocket Client - Real-time scan progress & alerts
// ============================================================================

import { io, Socket } from "socket.io-client";
import type { WSScanComplete, WSScanError, WSScanProgress } from "@/types/api";

const WS_URL = process.env.WS_URL || process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3001";

let socket: Socket | null = null;

type Listener<T> = (data: T) => void;

// Batch event types
export interface WSBatchProgress {
  batchId: string;
  current: number;
  total: number;
  scanId: string;
  url: string;
  status: string;
  score?: number;
  error?: string;
}

export interface WSBatchComplete {
  batchId: string;
  total: number;
}

const listeners = {
  "scan:progress": new Set<Listener<WSScanProgress>>(),
  "scan:complete": new Set<Listener<WSScanComplete>>(),
  "scan:error": new Set<Listener<WSScanError>>(),
  "batch:progress": new Set<Listener<WSBatchProgress>>(),
  "batch:complete": new Set<Listener<WSBatchComplete>>(),
};

// ---------------------------------------------------------------------------
// Connection Management
// ---------------------------------------------------------------------------
export function connect(): Socket {
  if (socket?.connected) return socket;

  socket = io(WS_URL, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionAttempts: 10,
    auth: {
      token: typeof window !== "undefined" ? localStorage.getItem("vzy_token") : "",
    },
  });

  socket.on("connect", () => {
    console.info("[WS] Connected:", socket?.id);
  });

  socket.on("disconnect", (reason) => {
    console.warn("[WS] Disconnected:", reason);
  });

  // Forward events to registered listeners
  socket.on("scan:progress", (data: WSScanProgress) => {
    listeners["scan:progress"].forEach((fn) => fn(data));
  });

  socket.on("scan:complete", (data: WSScanComplete) => {
    listeners["scan:complete"].forEach((fn) => fn(data));
  });

  socket.on("scan:error", (data: WSScanError) => {
    listeners["scan:error"].forEach((fn) => fn(data));
  });

  // Batch events
  socket.on("batch:progress", (data: WSBatchProgress) => {
    listeners["batch:progress"].forEach((fn) => fn(data));
  });

  socket.on("batch:complete", (data: WSBatchComplete) => {
    listeners["batch:complete"].forEach((fn) => fn(data));
  });

  return socket;
}

export function disconnect(): void {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}

// ---------------------------------------------------------------------------
// Event Subscription
// ---------------------------------------------------------------------------
export function onScanProgress(fn: Listener<WSScanProgress>): () => void {
  listeners["scan:progress"].add(fn);
  return () => {
    listeners["scan:progress"].delete(fn);
  };
}

export function onScanComplete(fn: Listener<WSScanComplete>): () => void {
  listeners["scan:complete"].add(fn);
  return () => {
    listeners["scan:complete"].delete(fn);
  };
}

export function onScanError(fn: Listener<WSScanError>): () => void {
  listeners["scan:error"].add(fn);
  return () => {
    listeners["scan:error"].delete(fn);
  };
}

export function onBatchProgress(fn: Listener<WSBatchProgress>): () => void {
  listeners["batch:progress"].add(fn);
  return () => {
    listeners["batch:progress"].delete(fn);
  };
}

export function onBatchComplete(fn: Listener<WSBatchComplete>): () => void {
  listeners["batch:complete"].add(fn);
  return () => {
    listeners["batch:complete"].delete(fn);
  };
}
