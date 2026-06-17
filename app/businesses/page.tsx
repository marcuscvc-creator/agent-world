import { getPrismaClient } from "@/app/lib/prisma";
import { PageHeader, Badge, StatCard, EmptyState, money } from "@/app/components/ui";

export const dynamic = "force-dynamic";

function deriveHealth(b: { trustScore: number; complianceScore: number; spamRiskScore: number; reputationScore: number }) {
  const score = (b.trustScore + b.complianceScore + b.reputationScore) / 3 - b.spamRiskScore * 0.5;
  if (score >= 85) return { label: "growing", tone: "good" as const };
  if (score >= 70) return { label: "healthy", tone: "info" as const };
  if (score >= 50) return { label: "watch", tone: "warn" as const };
  return { label: "at_risk", tone: "danger" as const };
}

export default async function BusinessesPage() {
  const prisma = getPrismaClient();

  const [businesses, agents] = prisma
    ? await Promise.all([
        prisma.business.findMany({
          orderBy: { revenue: "desc" },
          include: { ownerAgent: { select: { name: true } } },
        }),
        prisma.agent.findMany({ select: { id: true, name: true } }),
      ])
    : [[], []];

  const totalRevenue = businesses.reduce((s, b) => s + Number(b.revenue), 0);
  const totalProfit = businesses.reduce((s, b) => s + Number(b.profit), 0);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Businesses"
        subtitle={`${businesses.length} active · ${money(totalRevenue)} total revenue`}
      />

      {!prisma && (
        <EmptyState icon="⚡" title="Database not connected" description="Run pnpm db:setup." />
      )}

      {prisma && businesses.length === 0 && (
        <EmptyState
          icon="🏪"
          title="No businesses yet"
          description="Agents will create business entities as they identify opportunities and get approved to pursue them."
        />
      )}

      {businesses.length > 0 && (
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Businesses" value={businesses.length} accent="purple" />
            <StatCard label="Total Revenue" value={money(totalRevenue)} accent="green" />
            <StatCard label="Total Profit" value={money(totalProfit)} accent={totalProfit >= 0 ? "green" : "rose"} />
            <StatCard label="Active" value={businesses.filter((b) => b.status === "ACTIVE").length} accent="blue" />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {businesses.map((b) => {
              const health = deriveHealth(b);
              return (
              <div
                key={b.id}
                className="flex flex-col gap-3 rounded border border-[#2a1f3d] bg-[#0f0d1a] p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-bold text-[#fff1a8]">{b.name}</p>
                    <p className="text-xs text-[#7a7090]">{b.niche} · {b.businessModel}</p>
                  </div>
                  <Badge label={health.label} tone={health.tone} />
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded border border-[#2a1f3d] bg-[#181622] py-1.5">
                    <p className="font-mono text-xs font-bold text-[#4ade80]">{money(Number(b.revenue))}</p>
                    <p className="text-xs text-[#4a4060]">Revenue</p>
                  </div>
                  <div className="rounded border border-[#2a1f3d] bg-[#181622] py-1.5">
                    <p className="font-mono text-xs font-bold text-rose-300">{money(Number(b.expenses))}</p>
                    <p className="text-xs text-[#4a4060]">Expenses</p>
                  </div>
                  <div className="rounded border border-[#2a1f3d] bg-[#181622] py-1.5">
                    <p className={`font-mono text-xs font-bold ${Number(b.profit) >= 0 ? "text-[#4ade80]" : "text-rose-300"}`}>
                      {money(Number(b.profit))}
                    </p>
                    <p className="text-xs text-[#4a4060]">Profit</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-[#7a7090]">
                  <span>Owner: {b.ownerAgent?.name ?? "Unknown"}</span>
                  <Badge label={b.status} tone={b.status === "ACTIVE" ? "good" : "neutral"} />
                </div>

                {b.trustScore < 70 && (
                  <p className="rounded border border-amber-400/30 bg-amber-400/5 px-2 py-1 text-xs text-amber-300">
                    Trust score low ({b.trustScore}) — agents need more approvals
                  </p>
                )}
              </div>
            );})}
          </div>
        </div>
      )}
    </div>
  );
}
