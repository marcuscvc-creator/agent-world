import { getPrismaClient } from "@/app/lib/prisma";
import { PageHeader, StatCard, Panel, EmptyState, money } from "@/app/components/ui";
import { getStageForRevenue, getNextStage } from "@/app/lib/world/stages";

export const dynamic = "force-dynamic";

type ThoughtRow = { id: string; agentId: string; tokensUsed: number; costUsd: unknown };

export default async function AnalyticsPage() {
  const prisma = getPrismaClient();
  const db = prisma as any; // agentThought requires pnpm db:setup (prisma generate)

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const p = prisma!;
  type AgentRow = Awaited<ReturnType<typeof p.agent.findMany>>;
  type LogRow = Awaited<ReturnType<typeof p.agentLog.findMany>>;
  type ApprovalRow = Awaited<ReturnType<typeof p.approvalRequest.findMany>>;
  type WorldRow = Awaited<ReturnType<typeof p.worldState.findFirst>>;

  const [agents, thoughts, logs, world, approvals] = (prisma
    ? await Promise.all([
        prisma.agent.findMany({ orderBy: { revenueInfluenced: "desc" } }),
        db.agentThought.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
        prisma.agentLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
        prisma.worldState.findFirst({ where: { id: "world-singleton" } }),
        prisma.approvalRequest.findMany({ orderBy: { requestedAt: "desc" }, take: 200 }),
      ])
    : [[], [], [], null, []]) as [AgentRow, ThoughtRow[], LogRow, WorldRow, ApprovalRow];

  const gross = Number(world?.grossRevenue ?? 0);
  const stage = getStageForRevenue(gross);
  const nextStage = getNextStage(stage.id);

  const totalCost = thoughts.reduce((s: number, t: ThoughtRow) => s + Number(t.costUsd), 0);
  const totalTokens = thoughts.reduce((s: number, t: ThoughtRow) => s + t.tokensUsed, 0);
  const approvedCount = approvals.filter((a) => a.status === "EXECUTED").length;
  const rejectedCount = approvals.filter((a) => a.status === "REJECTED").length;
  const approvalRate = approvals.length > 0 ? ((approvedCount / approvals.length) * 100).toFixed(1) : "0";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader title="Analytics" subtitle="World progress, agent performance, approval rates" />

      {!prisma && (
        <EmptyState icon="⚡" title="Database not connected" description="Run pnpm db:setup to activate analytics." />
      )}

      {prisma && (
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
          {/* World stage progress */}
          <Panel title="World Stage Progress">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-[#fff1a8]">{stage.label}</span>
                {nextStage && <span className="font-mono text-xs text-[#7a7090]">Next: {nextStage.label} at {money(nextStage.minRevenue)}</span>}
              </div>
              <p className="text-xs text-[#d7ddc8]">{stage.description}</p>
              {nextStage && (
                <>
                  <div className="h-2 overflow-hidden rounded-full bg-[#2a1f3d]">
                    <div
                      className="h-full rounded-full bg-[#7c3aed]"
                      style={{ width: `${Math.min((gross / nextStage.minRevenue) * 100, 100).toFixed(1)}%` }}
                    />
                  </div>
                  <p className="font-mono text-xs text-[#7a7090]">
                    {money(gross)} / {money(nextStage.minRevenue)} ({((gross / nextStage.minRevenue) * 100).toFixed(1)}%)
                  </p>
                </>
              )}
            </div>
          </Panel>

          {/* Top-level stats */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Think Turns" value={thoughts.length} accent="purple" />
            <StatCard label="Total AI Cost" value={`$${totalCost.toFixed(4)}`} sub={`${(totalTokens / 1000).toFixed(1)}k tokens`} accent="rose" />
            <StatCard label="Approval Rate" value={`${approvalRate}%`} sub={`${approvedCount} approved / ${rejectedCount} rejected`} accent="green" />
            <StatCard label="Activity Logs" value={logs.length} accent="blue" />
          </div>

          {/* Agent performance table */}
          {agents.length > 0 && (
            <Panel title="Agent Performance">
              <div className="space-y-2">
                <div className="flex gap-3 border-b border-[#2a1f3d] pb-2 font-mono text-xs text-[#7a7090]">
                  <span className="flex-1">Agent</span>
                  <span className="w-24 text-right">Revenue</span>
                  <span className="w-24 text-right">Cost</span>
                  <span className="w-24 text-right">Profit</span>
                  <span className="w-16 text-right">Turns</span>
                </div>
                {agents.map((a) => {
                  const agentThoughts = thoughts.filter((t: ThoughtRow) => t.agentId === a.id).length;
                  const rev = Number(a.revenueInfluenced);
                  const cost = Number(a.costIncurred);
                  return (
                    <div key={a.id} className="flex items-center gap-3 rounded border border-[#2a1f3d] bg-[#181622] px-3 py-2">
                      <div className="flex-1">
                        <p className="font-mono text-xs font-semibold text-[#fff1a8]">{a.name}</p>
                        <p className="text-xs text-[#7a7090]">{a.role}</p>
                      </div>
                      <span className="w-24 text-right font-mono text-xs text-[#4ade80]">{money(rev, 2)}</span>
                      <span className="w-24 text-right font-mono text-xs text-rose-300">{money(cost, 4)}</span>
                      <span className={`w-24 text-right font-mono text-xs ${rev - cost >= 0 ? "text-[#4ade80]" : "text-rose-300"}`}>
                        {money(rev - cost, 4)}
                      </span>
                      <span className="w-16 text-right font-mono text-xs text-[#7a7090]">{agentThoughts}</span>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}

          {/* Recent activity feed */}
          {logs.length > 0 && (
            <Panel title="Recent Activity">
              <div className="space-y-1">
                {logs.slice(0, 30).map((log: (typeof logs)[number]) => (
                  <div key={log.id} className="flex items-start gap-2 py-1 text-xs">
                    <span className="mt-0.5 flex-shrink-0 font-mono text-[#4a4060]">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </span>
                    <span className="min-w-0 flex-1 text-[#d7ddc8]">{log.message}</span>
                    {log.approvalNeeded && (
                      <span className="flex-shrink-0 rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 font-mono text-xs text-amber-300">
                        approval
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
