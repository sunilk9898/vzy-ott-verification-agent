"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Loader2, AlertCircle, Eye } from "lucide-react";
import { login } from "@/lib/api";
import { useAuthStore, useReportStore } from "@/lib/store";
import { DEMO_USER, DEMO_TOKEN } from "@/lib/demo-data";
import type { UserRole } from "@/types/api";

// basePath for navigation — set at build time by next.config.js
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { setAuth } = useAuthStore();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { token, user } = await login(email, password);
      setAuth(
        { id: user.id, email: user.email, name: user.name, role: user.role as UserRole },
        token,
      );
      // Full page reload to ensure clean state — basePath is added automatically
      window.location.href = (basePath || "") + "/";
      return;
    } catch (err: any) {
      setError(err.message || "Authentication failed. Try Demo mode below.");
    }
    setLoading(false);
  };

  const handleDemoLogin = () => {
    // Set demo auth (bypasses backend entirely) — persisted to localStorage
    setAuth(DEMO_USER, DEMO_TOKEN);
    // Shell will auto-detect demo mode and load DEMO_REPORT on the dashboard page
    // Full page reload for reliable navigation with basePath
    window.location.href = (basePath || "") + "/";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0 p-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-cyan-500 flex items-center justify-center mb-4">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">VZY Agent Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            OTT Website Security, Performance & Code Quality
          </p>
        </div>

        {/* Demo Button — prominent for GitHub Pages visitors */}
        <button
          onClick={handleDemoLogin}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-gradient-to-r from-brand-500/20 to-cyan-500/20 border border-brand-500/40 text-brand-400 hover:from-brand-500/30 hover:to-cyan-500/30 hover:border-brand-500/60 transition-all font-medium"
        >
          <Eye className="w-4 h-4" />
          View Demo Dashboard
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-800" />
          <span className="text-xs text-gray-600">or sign in with backend</span>
          <div className="flex-1 h-px bg-gray-800" />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-xs text-red-400">{error}</span>
            </div>
          )}

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="admin@dishtv.in"
              required
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
              required
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-600">
          Default: admin@dishtv.in / admin123 &middot; RBAC: Admin, DevOps, Dev, Exec
        </p>
      </div>
    </div>
  );
}
