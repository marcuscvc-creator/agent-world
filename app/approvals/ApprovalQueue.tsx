"use client";

import { useState } from "react";
import { Check, Eye, Loader2, X } from "lucide-react";
import { Badge, riskTone } from "@/app/components/ui";

type Approval = {
  id: string;
  title: string | null;
  summary: string | null;
  proposedAction: string;
  actionType: string;
  riskLevel: string;
  expectedUpside: string;
  downside: string;
  exactExecution: string;
  agent?: { name: string; role: string } | null;
};

export function ApprovalQueue({ approvals: initial }: { approvals: Approval[] }) {
  const [approvals, setApprovals] = useState(initial);
  const [loading, setLoading] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function decide(id: string, decision: "approved" | "rejected" | "modification_requested") {
    setLoading(id);
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId: id, decision }),
      });
      const data = await res.json() as { approval?: { id: string } };
      if (data.approval) setApprovals((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setLoading(null);
    }
  }

  const riskOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sorted = [...approvals].sort(
    (a, b) => (riskOrder[a.riskLevel as keyof typeof riskOrder] ?? 4) - (riskOrder[b.riskLevel as keyof typeof riskOrder] ?? 4)
  );

  return (
    <div className="space-y-3">
      {sorted.map((a) => {
        const isExpanded = expanded === a.id;
        const isLoading = loading === a.id;

        return (
          <div
            key={a.id}
            className={`rounded border bg-[#0f0d1a] transition-colors ${
              a.riskLevel === "CRITICAL" ? "border-red-400/50" :
              a.riskLevel === "HIGH" ? "border-rose-400/40" :
              a.riskLevel === "MEDIUM" ? "border-amber-400/30" :
              "border-[#2a1f3d]"
            }`}
          >
            {/* Card header */}
            <div className="flex items-start gap-3 p-4">
              <Badge label={a.riskLevel} tone={riskTone(a.riskLevel)} />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-semibold text-[#fff1a8]">
                  {a.title ?? a.actionType}
                </p>
                <p className="mt-0.5 text-xs text-[#7a7090]">
                  {a.agent?.name ?? "Agent"} · {a.agent?.role ?? ""}
                </p>
                <p className="mt-1 text-sm text-[#d7ddc8]">{a.summary ?? a.proposedAction}</p>
              </div>
              <button
                onClick={() => setExpanded(isExpanded ? null : a.id)}
                className="mt-0.5 flex-shrink-0 rounded border border-[#2a1f3d] px-2 py-1 font-mono text-xs text-[#7a7090] hover:text-[#d7ddc8]"
              >
                {isExpanded ? "less" : "more"}
              </button>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="space-y-2 border-t border-[#2a1f3d] px-4 pb-4 pt-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="mb-1 font-mono text-xs text-[#4ade80]">Expected upside</p>
                    <p className="text-sm text-[#d7ddc8]">{a.expectedUpside}</p>
                  </div>
                  <div>
                    <p className="mb-1 font-mono text-xs text-rose-300">Downside risk</p>
                    <p className="text-sm text-[#d7ddc8]">{a.downside}</p>
                  </div>
                </div>
                <div>
                  <p className="mb-1 font-mono text-xs text-[#8fe0ff]">Exact execution</p>
                  <p className="whitespace-pre-wrap rounded border border-[#2a1f3d] bg-[#181622] p-3 text-xs text-[#d7ddc8]">
                    {a.exactExecution}
                  </p>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 border-t border-[#2a1f3d] px-4 py-3">
              <button
                onClick={() => decide(a.id, "approved")}
                disabled={isLoading}
                className="flex flex-1 items-center justify-center gap-1.5 rounded border border-[#4ade80]/40 bg-[#4ade80]/10 py-2 font-mono text-xs font-semibold text-[#4ade80] transition-colors hover:bg-[#4ade80]/20 disabled:opacity-50"
              >
                {isLoading ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                Approve &amp; Execute
              </button>
              <button
                onClick={() => decide(a.id, "modification_requested")}
                disabled={isLoading}
                className="flex items-center gap-1.5 rounded border border-amber-400/40 bg-amber-400/10 px-3 py-2 font-mono text-xs text-amber-200 transition-colors hover:bg-amber-400/20 disabled:opacity-50"
              >
                <Eye size={11} />
                Modify
              </button>
              <button
                onClick={() => decide(a.id, "rejected")}
                disabled={isLoading}
                className="flex items-center gap-1.5 rounded border border-rose-400/40 bg-rose-400/10 px-3 py-2 font-mono text-xs text-rose-300 transition-colors hover:bg-rose-400/20 disabled:opacity-50"
              >
                <X size={11} />
                Reject
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
