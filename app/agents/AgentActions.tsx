"use client";

import { useState } from "react";
import { Loader2, Play, PlayCircle } from "lucide-react";

type Props =
  | { agentId?: undefined; agentName?: undefined; inline?: false }
  | { agentId: string; agentName: string; inline: true };

export function AgentActions({ agentId, agentName, inline }: Props = {}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function runAgent(id?: string) {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/agent-tick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { agentId: id } : {}),
      });
      const data = await res.json() as { ok: boolean; result?: { agentsRun?: number; totalCostUsd?: number; error?: string } };
      if (id) {
        setResult(data.ok ? "✓ Turn complete" : `✗ ${data.result?.error ?? "Error"}`);
      } else {
        setResult(data.ok
          ? `✓ ${data.result?.agentsRun ?? 0} agents ran ($${Number(data.result?.totalCostUsd ?? 0).toFixed(5)})`
          : `✗ ${data.result?.error ?? "Error"}`);
      }
    } catch {
      setResult("✗ Network error");
    } finally {
      setLoading(false);
      setTimeout(() => setResult(null), 5000);
    }
  }

  // Inline variant — shown inside each agent card
  if (inline) {
    return (
      <button
        onClick={() => runAgent(agentId)}
        disabled={loading}
        className="flex w-full items-center justify-center gap-1.5 rounded border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-3 py-1.5 font-mono text-xs text-[#c4b5fd] transition-colors hover:bg-[#7c3aed]/20 disabled:opacity-50"
      >
        {loading ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
        {loading ? "Thinking…" : `Run ${agentName}`}
      </button>
    );
  }

  // Page-level variant — "Run All Agents" button in the header
  return (
    <div className="flex items-center gap-2">
      {result && (
        <span className={`font-mono text-xs ${result.startsWith("✓") ? "text-[#4ade80]" : "text-rose-300"}`}>
          {result}
        </span>
      )}
      <button
        onClick={() => runAgent()}
        disabled={loading}
        className="flex items-center gap-2 rounded border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-4 py-2 font-mono text-xs text-[#c4b5fd] transition-colors hover:bg-[#7c3aed]/20 disabled:opacity-50"
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />}
        {loading ? "Running agents…" : "Run All Agents"}
      </button>
    </div>
  );
}
