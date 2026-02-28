"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  Code2,
  Briefcase,
  Pencil,
  Trash2,
  X,
  Check,
  Loader2,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { getUsers, createUser, updateUser, deleteUser, type ManagedUser } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/api";

// ---------------------------------------------------------------------------
// Role Badge
// ---------------------------------------------------------------------------
const ROLE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  admin:     { label: "Admin",     color: "bg-red-500/15 text-red-400 border-red-500/30",       icon: ShieldCheck },
  devops:    { label: "DevOps",    color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: Shield },
  developer: { label: "Developer", color: "bg-blue-500/15 text-blue-400 border-blue-500/30",    icon: Code2 },
  executive: { label: "Executive", color: "bg-purple-500/15 text-purple-400 border-purple-500/30", icon: Briefcase },
};

function RoleBadge({ role }: { role: string }) {
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.developer;
  const Icon = config.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border", config.color)}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Create User Modal
// ---------------------------------------------------------------------------
function CreateUserModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (user: ManagedUser) => void;
}) {
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "developer" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const user = await createUser(form);
      onCreated(user);
      setForm({ email: "", name: "", password: "", role: "developer" });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create user");
    }
    setLoading(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="card p-6 w-full max-w-md mx-4 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-brand-400" />
            Create New User
          </h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="text-xs text-red-400">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Full Name</label>
            <input
              type="text"
              className="input"
              placeholder="John Doe"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Email</label>
            <input
              type="email"
              className="input"
              placeholder="user@dishtv.in"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                className="input pr-10"
                placeholder="Minimum 6 characters"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Role</label>
            <div className="grid grid-cols-2 gap-2">
              {(["admin", "devops", "developer", "executive"] as const).map((r) => {
                const cfg = ROLE_CONFIG[r];
                const Icon = cfg.icon;
                return (
                  <button
                    type="button"
                    key={r}
                    onClick={() => setForm({ ...form, role: r })}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all",
                      form.role === r
                        ? "border-brand-500 bg-brand-500/10 text-brand-400"
                        : "border-white/[0.06] text-gray-400 hover:border-white/10 hover:bg-white/[0.02]",
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1 py-2.5">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 py-2.5">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {loading ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit User Modal
// ---------------------------------------------------------------------------
function EditUserModal({
  user,
  onClose,
  onUpdated,
}: {
  user: ManagedUser;
  onClose: () => void;
  onUpdated: (user: ManagedUser) => void;
}) {
  const [form, setForm] = useState({ name: user.name, role: user.role, password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data: any = { name: form.name, role: form.role };
      if (form.password) data.password = form.password;
      const updated = await updateUser(user.id, data);
      onUpdated(updated);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to update user");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="card p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Pencil className="w-5 h-5 text-brand-400" />
            Edit User
          </h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="text-xs text-red-400">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Email (read-only)</label>
            <input type="email" className="input opacity-50" value={user.email} disabled />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Full Name</label>
            <input
              type="text"
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">New Password (leave empty to keep current)</label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              minLength={6}
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Role</label>
            <div className="grid grid-cols-2 gap-2">
              {(["admin", "devops", "developer", "executive"] as const).map((r) => {
                const cfg = ROLE_CONFIG[r];
                const Icon = cfg.icon;
                return (
                  <button
                    type="button"
                    key={r}
                    onClick={() => setForm({ ...form, role: r })}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all",
                      form.role === r
                        ? "border-brand-500 bg-brand-500/10 text-brand-400"
                        : "border-white/[0.06] text-gray-400 hover:border-white/10 hover:bg-white/[0.02]",
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1 py-2.5">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 py-2.5">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function UsersPage() {
  const { user: currentUser, hasRole } = useAuthStore();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isAdmin = hasRole(["admin" as UserRole]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (err: any) {
      setError(err.message || "Failed to load users");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) fetchUsers();
  }, [isAdmin, fetchUsers]);

  const handleToggleActive = async (u: ManagedUser) => {
    try {
      const updated = await updateUser(u.id, { is_active: !u.is_active });
      setUsers((prev) => prev.map((p) => (p.id === u.id ? updated : p)));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to permanently delete this user?")) return;
    setDeletingId(id);
    try {
      await deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (err: any) {
      setError(err.message);
    }
    setDeletingId(null);
  };

  // RBAC Guard
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Shield className="w-16 h-16 text-gray-600" />
        <h2 className="text-xl font-semibold text-gray-400">Access Denied</h2>
        <p className="text-sm text-gray-500">Only Admins can manage users.</p>
      </div>
    );
  }

  const formatDate = (d?: string) => {
    if (!d) return "Never";
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Users className="w-7 h-7 text-brand-400" />
            User Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage user accounts and RBAC roles for dashboard access
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchUsers} className="btn-ghost px-3 py-2 text-sm">
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
          <button onClick={() => setShowCreateModal(true)} className="btn-primary px-4 py-2 text-sm">
            <UserPlus className="w-4 h-4" />
            Add User
          </button>
        </div>
      </div>

      {/* Role Legend */}
      <div className="card p-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Role Permissions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="flex items-start gap-2">
            <RoleBadge role="admin" />
            <span className="text-xs text-gray-500 leading-relaxed">Full access + user management</span>
          </div>
          <div className="flex items-start gap-2">
            <RoleBadge role="devops" />
            <span className="text-xs text-gray-500 leading-relaxed">Full access + scan control</span>
          </div>
          <div className="flex items-start gap-2">
            <RoleBadge role="developer" />
            <span className="text-xs text-gray-500 leading-relaxed">View all dashboards + reports</span>
          </div>
          <div className="flex items-start gap-2">
            <RoleBadge role="executive" />
            <span className="text-xs text-gray-500 leading-relaxed">View only (overview + reports)</span>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span className="text-sm text-red-400">{error}</span>
        </div>
      )}

      {/* Users Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-20">
            <Users className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500">No users found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">User</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Role</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Last Login</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Created</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-600 to-cyan-600 flex items-center justify-center text-white text-sm font-bold">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">
                          {u.name}
                          {u.id === currentUser?.id && (
                            <span className="ml-2 text-[10px] text-brand-400 bg-brand-500/10 px-1.5 py-0.5 rounded">
                              YOU
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => handleToggleActive(u)}
                      disabled={u.id === currentUser?.id}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                        u.is_active
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25"
                          : "bg-gray-500/15 text-gray-400 border-gray-500/30 hover:bg-gray-500/25",
                        u.id === currentUser?.id && "opacity-50 cursor-not-allowed",
                      )}
                    >
                      <span className={cn("w-1.5 h-1.5 rounded-full", u.is_active ? "bg-emerald-400" : "bg-gray-500")} />
                      {u.is_active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-500">{formatDate(u.last_login)}</td>
                  <td className="px-5 py-4 text-xs text-gray-500">{formatDate(u.created_at)}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditingUser(u)}
                        className="btn-ghost p-2 rounded-lg text-gray-400 hover:text-brand-400"
                        title="Edit user"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {u.id !== currentUser?.id && (
                        <button
                          onClick={() => handleDelete(u.id)}
                          disabled={deletingId === u.id}
                          className="btn-ghost p-2 rounded-lg text-gray-400 hover:text-red-400"
                          title="Delete user"
                        >
                          {deletingId === u.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(ROLE_CONFIG).map(([role, cfg]) => {
          const count = users.filter((u) => u.role === role).length;
          const Icon = cfg.icon;
          return (
            <div key={role} className="card p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", cfg.color.split(" ")[0])}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{count}</div>
                <div className="text-xs text-gray-500">{cfg.label}s</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modals */}
      <CreateUserModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={(user) => setUsers((prev) => [...prev, user])}
      />

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onUpdated={(updated) => {
            setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
          }}
        />
      )}
    </div>
  );
}
