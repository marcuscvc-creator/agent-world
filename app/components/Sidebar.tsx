"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Brain,
  CheckSquare,
  CircleDollarSign,
  FlaskConical,
  Globe,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
};

const NAV: NavItem[] = [
  { href: "/", label: "World", icon: <Globe size={16} /> },
  { href: "/agents", label: "Agents", icon: <Users size={16} /> },
  { href: "/tasks", label: "Tasks", icon: <LayoutDashboard size={16} /> },
  { href: "/businesses", label: "Businesses", icon: <Store size={16} /> },
  { href: "/approvals", label: "Approvals", icon: <CheckSquare size={16} /> },
  { href: "/revenue", label: "Revenue", icon: <CircleDollarSign size={16} /> },
  { href: "/finance", label: "Finance", icon: <BarChart3 size={16} /> },
  { href: "/memory", label: "Memory", icon: <Brain size={16} /> },
  { href: "/analytics", label: "Analytics", icon: <Sparkles size={16} /> },
  { href: "/settings", label: "Settings", icon: <Settings size={16} /> },
];

const BOTTOM_NAV: NavItem[] = [
  { href: "/diagnostics", label: "Diagnostics", icon: <FlaskConical size={16} /> },
  { href: "/setup", label: "Setup", icon: <ShieldCheck size={16} /> },
];

export function Sidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav className="flex h-screen w-14 flex-col border-r border-[#2a1f3d] bg-[#0a0814] lg:w-48">
      {/* Logo */}
      <div className="flex h-12 items-center justify-center border-b border-[#2a1f3d] px-3 lg:justify-start lg:gap-2">
        <span className="text-lg">⚔️</span>
        <span className="hidden font-mono text-xs font-bold tracking-widest text-[#fff1a8] lg:block">
          AGENT WORLD
        </span>
      </div>

      {/* Main nav */}
      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-1.5 pt-3">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 rounded px-2 py-2 transition-colors ${
              isActive(item.href)
                ? "bg-[#7c3aed]/20 text-[#c4b5fd]"
                : "text-[#6b6280] hover:bg-[#1a1428] hover:text-[#d7ddc8]"
            }`}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            <span className="hidden truncate font-mono text-xs lg:block">{item.label}</span>
            {item.badge && (
              <span className="ml-auto hidden rounded-full bg-amber-400/20 px-1.5 py-0.5 font-mono text-xs text-amber-300 lg:block">
                {item.badge}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* Bottom nav */}
      <div className="flex flex-col gap-0.5 border-t border-[#2a1f3d] p-1.5 pb-3">
        {BOTTOM_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 rounded px-2 py-2 transition-colors ${
              isActive(item.href)
                ? "bg-[#7c3aed]/20 text-[#c4b5fd]"
                : "text-[#4a4060] hover:bg-[#1a1428] hover:text-[#d7ddc8]"
            }`}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            <span className="hidden truncate font-mono text-xs lg:block">{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
