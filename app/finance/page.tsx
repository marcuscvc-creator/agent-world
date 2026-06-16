import { getPrismaClient } from "@/app/lib/prisma";
import { PageHeader, StatCard, Panel, EmptyState, money, pct } from "@/app/components/ui";
import { getPLStatement, getBurnRate, getMonthlyData, getPLByAgent } from "@/app/lib/finance/reports";
import { FinanceCharts } from "./FinanceCharts";

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  const period = (params.period ?? "all") as "today" | "7d" | "30d" | "monthly" | "all";
  const prisma = getPrismaClient();

  const [pl, burn, monthly, byAgent] = prisma
    ? await Promise.all([
        getPLStatement(period),
        getBurnRate(),
        getMonthlyData(6),
        getPLByAgent(),
      ])
    : [null, null, [], []];

  const periods = ["today", "7d", "30d", "monthly", "all"] as const;
  const periodLabels: Record<string, string> = {
    today: "Today", "7d": "7 Days", "30d": "30 Days", monthly: "This Month", all: "All Time",
  };

  const firstDollarEarned = pl && pl.grossRevenue > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Financial Command Center"
        subtitle="P&amp;L · burn rate · runway · by agent"
        action={
          <div className="flex gap-1">
            {periods.map((p) => (
              <a
                key={p}
                href={`/finance?period=${p}`}
                className={`rounded border px-3 py-1.5 font-mono text-xs transition-colors ${
                  period === p
                    ? "border-[#7c3aed]/60 bg-[#7c3aed]/20 text-[#c4b5fd]"
                    : "border-[#2a1f3d] text-[#7a7090] hover:text-[#d7ddc8]"
                }`}
              >
                {periodLabels[p]}
              </a>
            ))}
          </div>
        }
      />

      {!prisma && (
        <EmptyState icon="⚡" title="Database not connected" description="Run pnpm db:setup to activate financial tracking." />
      )}

      {prisma && (
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
          {/* First dollar progress */}
          {!firstDollarEarned && (
            <div className="rounded border border-amber-400/30 bg-amber-400/5 p-4">
              <p className="font-mono text-xs text-amber-300">FIRST DOLLAR TRACKER</p>
              <p className="mt-1 text-sm text-[#d7ddc8]">
                Agents have not yet earned real revenue. Once the first payment clears, the world evolves from Campsite → Cabins.
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#2a1f3d]">
                <div className="h-full w-0 rounded-full bg-amber-400" />
              </div>
              <p className="mt-1 font-mono text-xs text-amber-300/60">$0 / $1.00</p>
            </div>
          )}

          {/* Top P&L stats */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Gross Revenue" value={money(pl?.grossRevenue ?? 0)} accent="green" />
            <StatCard
              label="Net Revenue"
              value={money(pl?.netRevenue ?? 0)}
              sub={`-${money(pl?.stripeFees ?? 0)} fees · -${money(pl?.refunds ?? 0)} refunds`}
              accent="green"
            />
            <StatCard
              label="Total Expenses"
              value={money(pl?.expenses.total ?? 0)}
              sub={`OpenAI: ${money(pl?.expenses.openai ?? 0)} · Marketing: ${money(pl?.expenses.marketing ?? 0)}`}
              accent="rose"
            />
            <StatCard
              label="Net Profit"
              value={money(pl?.netProfit ?? 0)}
              sub={pl ? `${pct(pl.profitMargin)} margin` : undefined}
              accent={pl && pl.netProfit >= 0 ? "green" : "rose"}
            />
          </div>

          {/* Secondary stats */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Cash Balance"
              value={money(burn?.cashBalance ?? 0)}
              accent="blue"
            />
            <StatCard
              label="Monthly Burn"
              value={money(burn?.monthlyBurn ?? 0)}
              sub={`${money(burn?.dailyBurn ?? 0, 2)}/day`}
              accent="amber"
            />
            <StatCard
              label="Runway"
              value={burn?.runwayDays != null ? `${burn.runwayDays}d` : "∞"}
              sub={burn?.runwayMonths != null ? `${burn.runwayMonths.toFixed(1)} months` : "No burn"}
              accent="purple"
            />
            <StatCard
              label="Revenue Events"
              value={pl?.revenueEvents ?? 0}
              sub={`${pl?.expenseEvents ?? 0} expense events`}
              accent="blue"
            />
          </div>

          {/* Expense breakdown */}
          {pl && pl.expenses.total > 0 && (
            <Panel title="Expense Breakdown">
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  { label: "OpenAI API", value: pl.expenses.openai },
                  { label: "Marketing", value: pl.expenses.marketing },
                  { label: "Hosting", value: pl.expenses.hosting },
                  { label: "Agent Labor", value: pl.expenses.agentLabor },
                  { label: "Other", value: pl.expenses.other },
                ].filter((e) => e.value > 0).map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between rounded border border-[#2a1f3d] bg-[#181622] px-3 py-2">
                    <span className="text-sm text-[#d7ddc8]">{label}</span>
                    <span className="font-mono text-sm text-rose-300">{money(value, 4)}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* Monthly chart + by-agent */}
          <div className="grid gap-6 lg:grid-cols-2">
            {monthly.length > 0 && (
              <Panel title="6-Month Revenue vs Expenses">
                <FinanceCharts data={monthly} />
              </Panel>
            )}

            {byAgent.length > 0 && (
              <Panel title="P&amp;L by Agent">
                <div className="space-y-2">
                  {byAgent
                    .sort((a, b) => b.revenue - a.revenue)
                    .map((row) => (
                      <div
                        key={row.agentId}
                        className="flex items-center gap-3 rounded border border-[#2a1f3d] bg-[#181622] px-3 py-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm text-[#d7ddc8]">{row.name}</span>
                        <span className="font-mono text-xs text-[#4ade80]">{money(row.revenue)}</span>
                        <span className="font-mono text-xs text-rose-300">-{money(row.cost, 4)}</span>
                        <span className={`font-mono text-xs ${row.profit >= 0 ? "text-[#4ade80]" : "text-rose-300"}`}>
                          {money(row.profit, 4)}
                        </span>
                      </div>
                    ))}
                </div>
              </Panel>
            )}
          </div>

          {!pl || (pl.grossRevenue === 0 && pl.expenses.total === 0) ? (
            <EmptyState
              icon="$"
              title="No financial data yet"
              description="Agents need to earn revenue or incur expenses. Run agents with OPENAI_API_KEY set to start accumulating data."
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
