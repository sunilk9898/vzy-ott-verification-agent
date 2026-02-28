"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Shield,
  Gauge,
  Code2,
  Settings2,
  FileBarChart,
  Users,
  ChevronLeft,
  ChevronRight,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore, useAuthStore } from "@/lib/store";
import type { UserRole } from "@/types/api";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles: UserRole[];         // which roles can see this item
}

const NAV_ITEMS: NavItem[] = [
  { label: "Overview",        href: "/",                icon: LayoutDashboard, roles: ["admin", "devops", "developer", "executive"] },
  { label: "Security",        href: "/security",        icon: Shield,          roles: ["admin", "devops", "developer", "executive"] },
  { label: "Performance",     href: "/performance",     icon: Gauge,           roles: ["admin", "devops", "developer", "executive"] },
  { label: "Code Quality",    href: "/code-quality",    icon: Code2,           roles: ["admin", "devops", "developer", "executive"] },
  { label: "Control Center",  href: "/control-center",  icon: Settings2,       roles: ["admin", "devops"] },
  { label: "Users",           href: "/users",           icon: Users,           roles: ["admin"] },
  { label: "Reporting",       href: "/reporting",       icon: FileBarChart,    roles: ["admin", "devops", "developer", "executive"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { user } = useAuthStore();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !user || item.roles.includes(user.role),
  );

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen flex flex-col border-r border-white/[0.06] bg-surface-1 transition-all duration-300",
        sidebarCollapsed ? "w-[68px]" : "w-[240px]",
      )}
    >
      {/* ── Logo ── */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-white/[0.06]">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-cyan-500 flex items-center justify-center">
          <Zap className="w-4 h-4 text-white" />
        </div>
        {!sidebarCollapsed && (
          <div className="min-w-0">
            <div className="text-sm font-bold text-white tracking-tight">VZY Agent</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-widest">OTT Monitor</div>
          </div>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group",
                isActive
                  ? "bg-brand-600/15 text-brand-400 border-glow"
                  : "text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]",
              )}
            >
              <Icon
                className={cn(
                  "w-[18px] h-[18px] flex-shrink-0 transition-colors",
                  isActive ? "text-brand-400" : "text-gray-500 group-hover:text-gray-300",
                )}
              />
              {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* ── Collapse Toggle ── */}
      <div className="p-3 border-t border-white/[0.06]">
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] transition-colors"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}
