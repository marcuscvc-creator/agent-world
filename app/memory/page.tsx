import { getPrismaClient } from "@/app/lib/prisma";
import { PageHeader, Badge, StatCard, Panel, EmptyState } from "@/app/components/ui";

export const dynamic = "force-dynamic";

const typeTone: Record<string, "info" | "good" | "purple" | "warn"> = {
  observation: "info",
  learning: "good",
  decision: "purple",
  goal: "warn",
};

type MemoryRow = { id: string; agentId: string; type: string; content: string; relevance: number; createdAt: Date; agent?: { name: string } | null };

export default async function MemoryPage({
  searchParams,
}: {
  searchParams: Promise<{ agentId?: string; type?: string }>;
}) {
  const params = await searchParams;
  const prisma = getPrismaClient();
  const db = prisma as any; // agentMemory requires pnpm db:setup (prisma generate)

  const [memories, agents]: [MemoryRow[], { id: string; name: string }[]] = prisma
    ? await Promise.all([
        (db.agentMemory.findMany({
          where: {
            ...(params.agentId ? { agentId: params.agentId } : {}),
            ...(params.type ? { type: params.type } : {}),
          },
          orderBy: [{ relevance: "desc" }, { createdAt: "desc" }],
          take: 200,
          include: { agent: { select: { name: true } } },
        }) as Promise<MemoryRow[]>),
        prisma.agent.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      ])
    : [[], []];

  const byType = (t: string) => memories.filter((m: MemoryRow) => m.type === t);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Memory"
        subtitle={`${memories.length} memories across ${agents.length} agents`}
        action={
          <div className="flex gap-1">
            <a href="/memory" className={`rounded border px-3 py-1.5 font-mono text-xs ${!params.agentId && !params.type ? "border-[#7c3aed]/60 bg-[#7c3aed]/20 text-[#c4b5fd]" : "border-[#2a1f3d] text-[#7a7090] hover:text-[#d7ddc8]"}`}>
              All
            </a>
            {agents.map((a) => (
              <a
                key={a.id}
                href={`/memory?agentId=${a.id}`}
                className={`rounded border px-3 py-1.5 font-mono text-xs ${params.agentId === a.id ? "border-[#7c3aed]/60 bg-[#7c3aed]/20 text-[#c4b5fd]" : "border-[#2a1f3d] text-[#7a7090] hover:text-[#d7ddc8]"}`}
              >

                {a.name.split(" ")[0]}
              </a>
            ))}
          </div>
        }
      />

      {!prisma && (
        <EmptyState icon="⚡" title="Database not connected" description="Run pnpm db:setup to activate memory." />
      )}

      {prisma && (
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {["observation", "learning", "decision", "goal"].map((t) => (
              <StatCard key={t} label={t} value={byType(t).length} accent={t === "observation" ? "blue" : t === "learning" ? "green" : t === "decision" ? "purple" : "rose"} />
            ))}
          </div>

          {memories.length === 0 ? (
            <EmptyState icon="◈" title="No memories yet" description="Agents write memories when they make decisions, learnings, and observations." />
          ) : (
            <div className="space-y-2">
              {memories.map((m: MemoryRow) => (
                <div
                  key={m.id}
                  className="flex gap-3 rounded border border-[#2a1f3d] bg-[#0f0d1a] px-4 py-3"
                >
                  <div className="mt-0.5 flex flex-shrink-0 flex-col items-center gap-1">
                    <Badge label={m.type} tone={typeTone[m.type] ?? "neutral"} />
                    <span className="font-mono text-xs text-[#4a4060]">{m.relevance}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[#d7ddc8]">{m.content}</p>
                    <p className="mt-1 text-xs text-[#7a7090]">
                      {m.agent?.name ?? "Unknown"} · {new Date(m.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
