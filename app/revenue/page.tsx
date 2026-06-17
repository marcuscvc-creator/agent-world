import { getPrismaClient } from "@/app/lib/prisma";
import { PageHeader, StatCard, Panel, EmptyState, money } from "@/app/components/ui";

export const dynamic = "force-dynamic";

export default async function RevenuePage() {
  const prisma = getPrismaClient();

  const [revenueEvents, worldState] = prisma
    ? await Promise.all([
        prisma.revenueEvent.findMany({ orderBy: { occurredAt: "desc" }, take: 100 }),
        prisma.worldState.findFirst({ where: { id: "world-singleton" } }),
      ])
    : [[], null];

  const gross = Number(worldState?.grossRevenue ?? 0);
  const net = Number(worldState?.netRevenue ?? 0);
  const totalFees = revenueEvents.reduce((s, e) => s + Number(e.stripeFee), 0);
  const totalRefunds = revenueEvents.reduce((s, e) => s + Number(e.refund), 0);
  const liveEvents = revenueEvents.filter((e) => !e.sandbox);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Revenue"
        subtitle={`${revenueEvents.length} events · ${liveEvents.length} live`}
      />

      {!prisma && (
        <EmptyState icon="⚡" title="Database not connected" description="Run pnpm db:setup to activate revenue tracking." />
      )}

      {prisma && (
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Gross Revenue" value={money(gross)} accent="green" />
            <StatCard label="Net Revenue" value={money(net)} sub={`After fees & refunds`} accent="green" />
            <StatCard label="Stripe Fees" value={money(totalFees, 2)} accent="rose" />
            <StatCard label="Refunds" value={money(totalRefunds, 2)} accent="amber" />
          </div>

          {revenueEvents.length === 0 ? (
            <EmptyState
              icon="$"
              title="No revenue yet"
              description="When an agent logs a confirmed sale, or Stripe sends a webhook, events appear here."
            />
          ) : (
            <Panel title={`Revenue Events (${revenueEvents.length})`}>
              <div className="space-y-2">
                {revenueEvents.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center gap-3 rounded border border-[#2a1f3d] bg-[#181622] px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-[#d7ddc8]">{e.source}</p>
                      <p className="text-xs text-[#7a7090]">
                        {new Date(e.occurredAt).toLocaleString()} · {e.sandbox ? "sandbox" : "live"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-semibold text-[#4ade80]">{money(Number(e.amount), 2)}</p>
                      {Number(e.stripeFee) > 0 && (
                        <p className="font-mono text-xs text-rose-300">-{money(Number(e.stripeFee), 2)} fee</p>
                      )}
                    </div>
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
