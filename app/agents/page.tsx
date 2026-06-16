import { getPrismaClient } from "@/app/lib/prisma";
import { PageHeader, Badge, Panel, StatCard, EmptyState, agentStatusTone } from "@/app/components/ui";
import { AgentActions } from "./AgentActions";

type ThoughtRow = { id: string; agentId: string; reasoning: string; toolCalls: unknown; tokensUsed: number; costUsd: unknown; createdAt?: Date };
type MemoryRow = { id: string; agentId: string };

export default async function AgentsPage() {
  const prisma = getPrismaClient();
  const db = prisma as any; // agentThought / agentMemory require pnpm db:setup (prisma generate)

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const p = prisma!;
  type AgentRow = Awaited<ReturnType<typeof p.agent.findMany>>;
  const [agents, thoughts, memories] = (prisma
    ? await Promise.all([
        prisma.agent.findMany({ orderBy: { name: "asc" } }),
        db.agentThought.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
        db.agentMemory.findMany({ orderBy: { relevance: "desc" }, take: 100 }),
      ])
    : [[], [], []]) as [AgentRow, ThoughtRow[], MemoryRow[]];

  const totalCost = thoughts.reduce((s: number, t: ThoughtRow) => s + Number(t.costUsd), 0);
  const totalTokens = thoughts.reduce((s: number, t: ThoughtRow) => s + t.tokensUsed, 0);
  const waitingCount = agents.filter((a) => a.status === "WAITING_APPROVAL").length;
  const workingCount = agents.filter((a) => a.status === "WORKING" || a.status === "THINKING").length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Agents"
        subtitle={`${agents.length} agents · ${workingCount} active · ${waitingCount} waiting approval`}
        action={<AgentActions />}
      />

      {!prisma && (
        <EmptyState
          icon="⚡"
          title="Database not connected"
          description="Set DATABASE_URL and run pnpm db:setup to seed agents."
        />
      )}

      {prisma && agents.length === 0 && (
        <EmptyState icon="◈" title="No agents yet" description="Run pnpm db:setup to seed the 8 founding agents." />
      )}

      {agents.length > 0 && (
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total Agents" value={agents.length} accent="purple" />
            <StatCard label="Active Now" value={workingCount} accent="green" />
            <StatCard label="Waiting Approval" value={waitingCount} accent="amber" />
            <StatCard
              label="Total AI Cost"
              value={`$${totalCost.toFixed(4)}`}
              sub={`${totalTokens.toLocaleString()} tokens`}
              accent="blue"
            />
          </div>

          {/* Agent grid */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {agents.map((agent) => {
              const agentThoughts = thoughts.filter((t: ThoughtRow) => t.agentId === agent.id);
              const agentMemories = memories.filter((m: MemoryRow) => m.agentId === agent.id);
              const agentCost = agentThoughts.reduce((s: number, t: ThoughtRow) => s + Number(t.costUsd), 0);
              const lastThought = agentThoughts[0];
              const statusTone = agentStatusTone(agent.status);

              return (
                <div
                  key={agent.id}
                  className="flex flex-col gap-3 rounded border border-[#2a1f3d] bg-[#0f0d1a] p-4 transition-colors hover:border-[#7c3aed]/40"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm font-bold text-[#fff1a8]">{agent.name}</p>
                      <p className="mt-0.5 truncate text-xs text-[#7a7090]">{agent.role}</p>
                    </div>
                    <Badge label={agent.status.replace("_", " ")} tone={statusTone} />
                  </div>

                  {/* Scores */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { label: "Trust", value: agent.trustScore },
                      { label: "Comply", value: agent.complianceScore },
                      { label: "Reliable", value: agent.reliabilityScore },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded border border-[#2a1f3d] bg-[#181622] py-1">
                        <p className="font-mono text-xs font-bold text-[#c4b5fd]">{value}</p>
                        <p className="text-xs text-[#4a4060]">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Goal / Task */}
                  <div className="space-y-1 text-xs text-[#d7ddc8]">
                    <p><span className="text-[#7a7090]">Goal: </span>{agent.currentGoal}</p>
                    <p className="truncate"><span className="text-[#7a7090]">Task: </span>{agent.currentTask}</p>
                  </div>

                  {/* Last thought */}
                  {lastThought && (
                    <div className="rounded border border-[#2a1f3d] bg-[#181622] p-2">
                      <p className="font-mono text-xs text-[#8fe0ff]">Last thought</p>
                      <p className="mt-1 line-clamp-2 text-xs text-[#d7ddc8]">
                        {lastThought.reasoning.slice(0, 120)}
                        {lastThought.reasoning.length > 120 ? "…" : ""}
                      </p>
                    </div>
                  )}

                  {/* Metrics footer */}
                  <div className="flex items-center justify-between border-t border-[#2a1f3d] pt-2 text-xs text-[#7a7090]">
                    <span>{agentThoughts.length} turns · ${agentCost.toFixed(4)}</span>
                    <span>{agentMemories.length} memories</span>
                  </div>

                  {/* Run button */}
                  <AgentActions agentId={agent.id} agentName={agent.name} inline />
                </div>
              );
            })}
          </div>

          {/* Recent thoughts log */}
          {thoughts.length > 0 && (
            <Panel title={`Recent Thoughts (${thoughts.length})`}>
              <div className="space-y-3">
                {thoughts.slice(0, 20).map((t: ThoughtRow) => {
                  const agent = agents.find((a) => a.id === t.agentId);
                  const toolCalls = Array.isArray(t.toolCalls) ? t.toolCalls as Array<{ toolName: string }> : [];
                  return (
                    <div key={t.id} className="rounded border border-[#2a1f3d] bg-[#181622] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-[#fff1a8]">{agent?.name ?? "Unknown"}</span>
                          {toolCalls.map((tc, i) => (
                            <Badge key={i} label={tc.toolName} tone="purple" />
                          ))}
                        </div>
                        <span className="font-mono text-xs text-[#4a4060]">
                          {t.tokensUsed.toLocaleString()} tok · ${Number(t.costUsd).toFixed(5)}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs text-[#d7ddc8]">
                        {t.reasoning.slice(0, 200)}
                        {t.reasoning.length > 200 ? "…" : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
