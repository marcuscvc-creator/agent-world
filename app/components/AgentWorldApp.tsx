"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  CircleDollarSign,
  Eye,
  Loader2,
  PauseCircle,
  Play,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { triggerAgentRun, triggerNextAgent } from "@/app/actions/runAgents";
import { PixelWorld } from "./PixelWorld";
import type { Agent, Building, ApprovalRequest, ApprovalStatus } from "@/app/lib/types";

// ── Static building layout (visual positions only) ───────────────────────────
const BUILDINGS: Building[] = [
  { id: "research_lab", name: "Research Lab", purpose: "Opportunity scanning and market scoring", x: 94, y: 86, width: 128, height: 88, color: "#7bc4c4" },
  { id: "product_workshop", name: "Product Workshop", purpose: "Products, offers, templates", x: 316, y: 72, width: 132, height: 104, color: "#f5a65b" },
  { id: "website_factory", name: "Website Factory", purpose: "Landing pages, funnels, copy", x: 612, y: 78, width: 148, height: 96, color: "#8fb96f" },
  { id: "marketing_studio", name: "Marketing Studio", purpose: "Posts, campaigns, newsletters", x: 798, y: 190, width: 138, height: 92, color: "#e889a8" },
  { id: "sales_office", name: "Sales Office", purpose: "Outreach drafts, lead lists", x: 604, y: 304, width: 126, height: 94, color: "#d9c65e" },
  { id: "compliance_office", name: "Compliance Office", purpose: "Approvals, risk checks", x: 330, y: 304, width: 138, height: 92, color: "#b99be6" },
  { id: "finance_bank", name: "Finance Bank", purpose: "Revenue, costs, Stripe", x: 104, y: 286, width: 124, height: 100, color: "#6fb98c" },
];

// ── Types ────────────────────────────────────────────────────────────────────
type WorldState = {
  grossRevenue: number;
  stage: string;
};

type WorldApiResponse = {
  worldState: WorldState | null;
  stage: { id: string; label: string; description: string } | null;
  stageProgress: number;
  revenueToNextStage: number;
};

type AgentsApiResponse = {
  agents: Agent[];
};

type ApprovalsApiResponse = {
  approvals: (ApprovalRequest & { agent?: { name: string; role: string } })[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const riskStyles: Record<string, string> = {
  LOW: "border-emerald-300/40 bg-emerald-400/10 text-emerald-100",
  MEDIUM: "border-amber-300/40 bg-amber-400/10 text-amber-100",
  HIGH: "border-rose-300/40 bg-rose-400/10 text-rose-100",
  CRITICAL: "border-red-300/60 bg-red-500/20 text-red-100",
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

// ── Component ────────────────────────────────────────────────────────────────
export function AgentWorldApp() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [worldData, setWorldData] = useState<WorldApiResponse | null>(null);
  const [approvals, setApprovals] = useState<ApprovalsApiResponse["approvals"]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "good" | "warn" | "neutral" } | null>(null);
  const [agentRunning, setAgentRunning] = useState(false);

  const showToast = (message: string, tone: "good" | "warn" | "neutral" = "neutral") => {
    setToast({ message, tone });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchAll = useCallback(async () => {
    try {
      const [agentsRes, worldRes, approvalsRes] = await Promise.all([
        fetch("/api/agents"),
        fetch("/api/world"),
        fetch("/api/approvals"),
      ]);

      const [agentsData, worldDataResult, approvalsData]: [AgentsApiResponse, WorldApiResponse, ApprovalsApiResponse] =
        await Promise.all([agentsRes.json(), worldRes.json(), approvalsRes.json()]);

      setAgents(agentsData.agents ?? []);
      setWorldData(worldDataResult);
      setApprovals(approvalsData.approvals?.filter((a) => String(a.status).toLowerCase() === "pending") ?? []);
    } catch {
      // DB not connected yet — show empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  async function handleRunAgents(agentId?: string) {
    setAgentRunning(true);
    try {
      if (agentId) {
        // Run one specific agent
        const result = await triggerAgentRun(agentId);
        showToast(
          result.error ? `Error: ${result.error}` : `${agentId} ran · $${result.costUsd.toFixed(4)}`,
          result.error ? "warn" : "good"
        );
      } else {
        // Cycle through all agents one at a time (Vercel Hobby: 10s limit per call)
        const AGENT_COUNT = 8;
        let ran = 0;
        let totalCost = 0;
        for (let i = 0; i < AGENT_COUNT; i++) {
          const result = await triggerNextAgent();
          if ("skipped" in result) break; // no more IDLE agents
          ran++;
          totalCost += result.costUsd ?? 0;
          await new Promise((r) => setTimeout(r, 300)); // brief pause between calls
        }
        showToast(
          ran > 0 ? `${ran} agent${ran !== 1 ? "s" : ""} ran · $${totalCost.toFixed(4)}` : "No IDLE agents to run",
          ran > 0 ? "good" : "warn"
        );
      }
      await fetchAll();
    } catch (err) {
      showToast(`Run failed: ${err instanceof Error ? err.message : String(err)}`, "warn");
    } finally {
      setAgentRunning(false);
    }
  }

  async function handleDecision(approvalId: string, decision: ApprovalStatus) {
    setActionLoading(approvalId);
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId, decision }),
      });
      const data = await res.json();
      if (data.approval) {
        setApprovals((prev) => prev.filter((a) => a.id !== approvalId));
        showToast(
          decision === "approved" ? "Action approved and executed." : decision === "rejected" ? "Action rejected." : "Modification requested.",
          decision === "approved" ? "good" : decision === "rejected" ? "warn" : "neutral"
        );
        await fetchAll();
      }
    } finally {
      setActionLoading(null);
    }
  }

  const gross = worldData?.worldState ? Number(worldData.worldState.grossRevenue) : 0;

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#0d0f1a] text-[#f7f1dc]">
      {/* Top HUD */}
      <div className="flex items-center justify-between border-b border-[#2a1f3d] bg-[#100e1e] px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-[#8fe0ff]">AGENT WORLD</span>
          {worldData?.stage && (
            <span className="rounded border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-2 py-0.5 font-mono text-xs text-[#c4b5fd]">
              {worldData.stage.label.toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-[#4ade80]">
            <CircleDollarSign size={14} />
            <span className="font-mono text-sm font-semibold">{money(gross)}</span>
          </div>
          {approvals.length > 0 && (
            <div className="flex items-center gap-1.5 rounded border border-amber-400/40 bg-amber-400/10 px-2 py-0.5">
              <AlertTriangle size={12} className="text-amber-300" />
              <span className="font-mono text-xs text-amber-200">{approvals.length} pending</span>
            </div>
          )}
          <button
            onClick={() => handleRunAgents()}
            disabled={agentRunning}
            className="flex items-center gap-1.5 rounded border border-[#4ade80]/40 bg-[#4ade80]/10 px-3 py-1 font-mono text-xs font-semibold text-[#4ade80] transition-colors hover:bg-[#4ade80]/20 disabled:opacity-50"
          >
            {agentRunning ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
            {agentRunning ? "Running…" : "Run Agents"}
          </button>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* World canvas */}
        <div className="relative flex-1 overflow-hidden">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="animate-spin text-[#8fe0ff]" size={32} />
            </div>
          ) : (
            <PixelWorld
              agents={agents}
              buildings={BUILDINGS}
              revenue={gross}
              selectedAgentId={selectedAgent?.id}
              selectedBuildingId={selectedBuilding?.id}
              onSelectAgent={(agent) => setSelectedAgent(agent)}
              onSelectBuilding={(building) => setSelectedBuilding(building)}
            />
          )}

          {/* No-DB notice */}
          {!loading && agents.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0d0f1a]/80">
              <ShieldCheck size={40} className="text-[#8fe0ff]" />
              <p className="font-mono text-sm text-[#8fe0ff]">DATABASE NOT CONNECTED</p>
              <p className="max-w-xs text-center text-xs text-[#7a7090]">
                Set DATABASE_URL and run <code className="text-[#ff2d78]">pnpm db:setup</code> to seed agents and start the world.
              </p>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="flex w-80 flex-col gap-0 overflow-y-auto border-l border-[#2a1f3d] bg-[#0f0d1a]">
          {/* Agent detail */}
          {selectedAgent && (
            <section className="border-b border-[#2a1f3d] p-4">
              <div className="flex items-center justify-between">
                <p className="font-mono text-xs text-[#8fe0ff]">SELECTED AGENT</p>
                <button onClick={() => setSelectedAgent(null)} className="text-[#7a7090] hover:text-[#f7f1dc]">
                  <X size={14} />
                </button>
              </div>
              <p className="mt-2 font-mono text-base font-semibold text-[#fff1a8]">{selectedAgent.name}</p>
              <p className="text-xs text-[#c4b5fd]">{selectedAgent.role}</p>
              <div className="mt-3 space-y-1 text-xs text-[#d7ddc8]">
                <p><span className="text-[#7a7090]">Status:</span> {String(selectedAgent.status).toLowerCase()}</p>
                <p><span className="text-[#7a7090]">Goal:</span> {selectedAgent.currentGoal}</p>
                <p><span className="text-[#7a7090]">Task:</span> {selectedAgent.currentTask}</p>
                {selectedAgent.trustScore !== undefined && (
                  <p><span className="text-[#7a7090]">Trust:</span> {selectedAgent.trustScore}/100</p>
                )}
              </div>
              <button
                onClick={() => handleRunAgents(selectedAgent.id)}
                disabled={agentRunning}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-2 py-1.5 font-mono text-xs font-semibold text-[#c4b5fd] transition-colors hover:bg-[#7c3aed]/20 disabled:opacity-50"
              >
                {agentRunning ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
                {agentRunning ? "Running…" : `Run ${selectedAgent.name}`}
              </button>
            </section>
          )}

          {/* Building detail */}
          {selectedBuilding && !selectedAgent && (
            <section className="border-b border-[#2a1f3d] p-4">
              <div className="flex items-center justify-between">
                <p className="font-mono text-xs text-[#8fe0ff]">SELECTED BUILDING</p>
                <button onClick={() => setSelectedBuilding(null)} className="text-[#7a7090] hover:text-[#f7f1dc]">
                  <X size={14} />
                </button>
              </div>
              <p className="mt-2 font-mono text-sm font-semibold text-[#fff1a8]">{selectedBuilding.name}</p>
              <p className="mt-1 text-xs text-[#d7ddc8]">{selectedBuilding.purpose}</p>
            </section>
          )}

          {/* Agent roster */}
          <section className="border-b border-[#2a1f3d] p-4">
            <p className="font-mono text-xs text-[#8fe0ff]">AGENTS ({agents.length})</p>
            <div className="mt-3 space-y-2">
              {agents.length === 0 ? (
                <p className="text-xs text-[#7a7090]">No agents yet. Seed the database.</p>
              ) : (
                agents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgent(agent)}
                    className={`flex w-full items-center gap-2 rounded border px-3 py-2 text-left transition-colors ${
                      selectedAgent?.id === agent.id
                        ? "border-[#7c3aed]/60 bg-[#7c3aed]/10"
                        : "border-[#2a1f3d] bg-[#181622] hover:border-[#7c3aed]/30"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 flex-shrink-0 rounded-full ${
                        String(agent.status) === "WORKING" ? "bg-[#4ade80]" :
                        String(agent.status) === "THINKING" ? "bg-[#60a5fa]" :
                        String(agent.status) === "WAITING_APPROVAL" ? "bg-amber-400" :
                        "bg-[#4a4060]"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs font-semibold text-[#f7f1dc]">{agent.name}</p>
                      <p className="truncate text-xs text-[#7a7090]">{agent.role}</p>
                    </div>
                    <ChevronRight size={12} className="flex-shrink-0 text-[#4a4060]" />
                  </button>
                ))
              )}
            </div>
          </section>

          {/* Approval queue */}
          <section className="flex-1 p-4">
            <p className="font-mono text-xs text-[#8fe0ff]">
              APPROVALS {approvals.length > 0 && <span className="text-amber-300">({approvals.length})</span>}
            </p>

            {approvals.length === 0 ? (
              <div className="mt-4 flex flex-col items-center gap-2 py-6 text-center">
                <Sparkles size={20} className="text-[#4a4060]" />
                <p className="text-xs text-[#7a7090]">No pending approvals</p>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {approvals.map((approval) => {
                  const risk = String(approval.riskLevel).toUpperCase();
                  return (
                    <div
                      key={approval.id}
                      className={`rounded border p-3 ${riskStyles[risk] ?? riskStyles.MEDIUM}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-xs font-semibold text-[#fff1a8]">
                            {approval.title ?? approval.actionType}
                          </p>
                          <p className="mt-0.5 text-xs opacity-80">
                            {approval.agent?.name ?? "Agent"} · {risk}
                          </p>
                        </div>
                        <span className="flex-shrink-0 rounded border border-current/20 bg-current/5 px-1.5 py-0.5 font-mono text-xs">
                          {risk}
                        </span>
                      </div>

                      <p className="mt-2 text-xs opacity-70">{approval.summary ?? approval.proposedAction}</p>

                      {approval.expectedUpside && (
                        <p className="mt-1 text-xs text-[#4ade80]/80">↑ {approval.expectedUpside}</p>
                      )}
                      {approval.downside && (
                        <p className="mt-0.5 text-xs text-rose-300/70">↓ {approval.downside}</p>
                      )}

                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => handleDecision(approval.id, "approved")}
                          disabled={actionLoading === approval.id}
                          className="flex flex-1 items-center justify-center gap-1 rounded border border-[#4ade80]/40 bg-[#4ade80]/10 px-2 py-1.5 text-xs font-semibold text-[#4ade80] transition-colors hover:bg-[#4ade80]/20 disabled:opacity-50"
                        >
                          {actionLoading === approval.id ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                          Approve
                        </button>
                        <button
                          onClick={() => handleDecision(approval.id, "modification_requested")}
                          disabled={actionLoading === approval.id}
                          className="flex items-center justify-center gap-1 rounded border border-amber-400/40 bg-amber-400/10 px-2 py-1.5 text-xs text-amber-200 transition-colors hover:bg-amber-400/20 disabled:opacity-50"
                        >
                          <Eye size={10} />
                          Modify
                        </button>
                        <button
                          onClick={() => handleDecision(approval.id, "rejected")}
                          disabled={actionLoading === approval.id}
                          className="flex items-center justify-center gap-1 rounded border border-rose-400/40 bg-rose-400/10 px-2 py-1.5 text-xs text-rose-300 transition-colors hover:bg-rose-400/20 disabled:opacity-50"
                        >
                          <PauseCircle size={10} />
                          Reject
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 rounded border px-4 py-2 font-mono text-sm shadow-lg ${
            toast.tone === "good"
              ? "border-[#4ade80]/40 bg-[#0d0f1a] text-[#4ade80]"
              : toast.tone === "warn"
              ? "border-rose-400/40 bg-[#0d0f1a] text-rose-300"
              : "border-[#7c3aed]/40 bg-[#0d0f1a] text-[#c4b5fd]"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
