/**
 * ui.tsx — Shared UI primitives for all Agent World dashboard pages.
 * Dark cyberpunk / pixel-RPG aesthetic. No external component library.
 */
import type { ReactNode } from "react";

// ── PageHeader ───────────────────────────────────────────────────────────────
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between border-b border-[#2a1f3d] bg-[#100e1e] px-6 py-4">
      <div>
        <h1 className="font-mono text-xl font-bold tracking-wide text-[#fff1a8]">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-[#7a7090]">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

// ── StatCard ─────────────────────────────────────────────────────────────────
export function StatCard({
  label,
  value,
  sub,
  accent = "blue",
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "blue" | "green" | "purple" | "amber" | "rose";
}) {
  const colors = {
    blue:   "border-[#8fe0ff]/30 text-[#8fe0ff]",
    green:  "border-[#4ade80]/30 text-[#4ade80]",
    purple: "border-[#c4b5fd]/30 text-[#c4b5fd]",
    amber:  "border-amber-300/30 text-amber-300",
    rose:   "border-rose-300/30 text-rose-300",
  };
  return (
    <div className={`rounded border bg-[#0f0d1a] p-4 ${colors[accent]}`}>
      <p className="font-mono text-xs uppercase tracking-widest opacity-70">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs opacity-60">{sub}</p>}
    </div>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────
export function Panel({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded border border-[#2a1f3d] bg-[#0f0d1a] ${className}`}>
      {title && (
        <div className="border-b border-[#2a1f3d] px-4 py-3">
          <p className="font-mono text-xs uppercase tracking-widest text-[#8fe0ff]">{title}</p>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

// ── EmptyState ───────────────────────────────────────────────────────────────
export function EmptyState({
  icon = "◈",
  title,
  description,
}: {
  icon?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <span className="font-mono text-3xl text-[#4a4060]">{icon}</span>
      <p className="font-mono text-sm text-[#7a7090]">{title}</p>
      {description && <p className="max-w-xs text-xs text-[#4a4060]">{description}</p>}
    </div>
  );
}

// ── Badge ────────────────────────────────────────────────────────────────────
export function Badge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "good" | "warn" | "danger" | "info" | "purple";
}) {
  const tones = {
    neutral: "border-[#4a4060] bg-[#1a1428] text-[#7a7090]",
    good:    "border-[#4ade80]/40 bg-[#4ade80]/10 text-[#4ade80]",
    warn:    "border-amber-400/40 bg-amber-400/10 text-amber-300",
    danger:  "border-rose-400/40 bg-rose-400/10 text-rose-300",
    info:    "border-[#8fe0ff]/40 bg-[#8fe0ff]/10 text-[#8fe0ff]",
    purple:  "border-[#c4b5fd]/40 bg-[#c4b5fd]/10 text-[#c4b5fd]",
  };
  return (
    <span className={`inline-block rounded border px-2 py-0.5 font-mono text-xs ${tones[tone]}`}>
      {label}
    </span>
  );
}

// ── Pill button ──────────────────────────────────────────────────────────────
export function PillBtn({
  children,
  onClick,
  tone = "neutral",
  disabled = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "neutral" | "good" | "danger" | "info" | "purple";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const tones = {
    neutral: "border-[#4a4060] bg-[#1a1428] text-[#d7ddc8] hover:bg-[#251f38]",
    good:    "border-[#4ade80]/40 bg-[#4ade80]/10 text-[#4ade80] hover:bg-[#4ade80]/20",
    danger:  "border-rose-400/40 bg-rose-400/10 text-rose-300 hover:bg-rose-400/20",
    info:    "border-[#8fe0ff]/40 bg-[#8fe0ff]/10 text-[#8fe0ff] hover:bg-[#8fe0ff]/20",
    purple:  "border-[#c4b5fd]/40 bg-[#c4b5fd]/10 text-[#c4b5fd] hover:bg-[#c4b5fd]/20",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded border px-3 py-1.5 font-mono text-xs transition-colors disabled:opacity-40 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

// ── Money helpers ─────────────────────────────────────────────────────────────
export function money(n: number | string, decimals = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: decimals,
  }).format(Number(n));
}

export function pct(n: number | string) {
  return `${Number(n).toFixed(1)}%`;
}

// ── Status tone helpers ───────────────────────────────────────────────────────
export function agentStatusTone(status: string): "good" | "info" | "warn" | "neutral" | "danger" {
  const s = status.toUpperCase();
  if (s === "WORKING") return "good";
  if (s === "THINKING") return "info";
  if (s === "WAITING_APPROVAL") return "warn";
  if (s === "BLOCKED") return "danger";
  return "neutral";
}

export function riskTone(risk: string): "good" | "warn" | "danger" | "neutral" {
  const r = risk.toUpperCase();
  if (r === "LOW") return "good";
  if (r === "MEDIUM") return "warn";
  if (r === "HIGH" || r === "CRITICAL") return "danger";
  return "neutral";
}
