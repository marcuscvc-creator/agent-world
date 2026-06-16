import { getPrismaClient } from "../prisma";

// ── Native date helpers (no date-fns dependency) ─────────────────────────────
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function subDays(d: Date, n: number) {
  return new Date(d.getTime() - n * 86_400_000);
}
function subMonths(d: Date, n: number) {
  const r = new Date(d);
  r.setMonth(r.getMonth() - n);
  return r;
}
function formatMonth(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export type FinancialPeriod = "today" | "7d" | "30d" | "monthly" | "all";

export type PLStatement = {
  period: FinancialPeriod;
  from: Date;
  to: Date;
  grossRevenue: number;
  stripeFees: number;
  refunds: number;
  netRevenue: number;
  expenses: {
    total: number;
    openai: number;
    hosting: number;
    marketing: number;
    agentLabor: number;
    other: number;
  };
  grossProfit: number;
  netProfit: number;
  profitMargin: number;
  revenueEvents: number;
  expenseEvents: number;
};

export type BurnRateReport = {
  dailyBurn: number;
  weeklyBurn: number;
  monthlyBurn: number;
  cashBalance: number;
  runwayDays: number | null;
  runwayMonths: number | null;
};

export type MonthlyDataPoint = {
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
};

function periodToDateRange(period: FinancialPeriod): { from: Date; to: Date } {
  const now = new Date();
  switch (period) {
    case "today":
      return { from: startOfDay(now), to: now };
    case "7d":
      return { from: subDays(now, 7), to: now };
    case "30d":
      return { from: subDays(now, 30), to: now };
    case "monthly":
      return { from: startOfMonth(now), to: now };
    case "all":
      return { from: new Date(0), to: now };
  }
}

export async function getPLStatement(period: FinancialPeriod): Promise<PLStatement | null> {
  const prisma = getPrismaClient();
  if (!prisma) return null;

  const { from, to } = periodToDateRange(period);

  const [revenueEvents, expenseEvents] = await Promise.all([
    prisma.revenueEvent.findMany({
      where: { occurredAt: { gte: from, lte: to } },
    }),
    prisma.expenseEvent.findMany({
      where: { occurredAt: { gte: from, lte: to } },
    }),
  ]);

  const grossRevenue = revenueEvents.reduce((s, e) => s + Number(e.amount), 0);
  const stripeFees = revenueEvents.reduce((s, e) => s + Number(e.stripeFee), 0);
  const refunds = revenueEvents.reduce((s, e) => s + Number(e.refund), 0);
  const netRevenue = grossRevenue - stripeFees - refunds;

  const expenseByCategory = (cat: string) =>
    expenseEvents.filter((e) => e.category === cat).reduce((s, e) => s + Number(e.amount), 0);

  const expenseTotal = expenseEvents.reduce((s, e) => s + Number(e.amount), 0);

  const expenses = {
    total: expenseTotal,
    openai: expenseByCategory("openai_api"),
    hosting: expenseByCategory("hosting"),
    marketing: expenseByCategory("marketing"),
    agentLabor: expenseByCategory("agent_labor"),
    other:
      expenseTotal -
      expenseByCategory("openai_api") -
      expenseByCategory("hosting") -
      expenseByCategory("marketing") -
      expenseByCategory("agent_labor"),
  };

  const grossProfit = netRevenue;
  const netProfit = netRevenue - expenseTotal;
  const profitMargin = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;

  return {
    period,
    from,
    to,
    grossRevenue,
    stripeFees,
    refunds,
    netRevenue,
    expenses,
    grossProfit,
    netProfit,
    profitMargin,
    revenueEvents: revenueEvents.length,
    expenseEvents: expenseEvents.length,
  };
}

export async function getBurnRate(): Promise<BurnRateReport | null> {
  const prisma = getPrismaClient();
  if (!prisma) return null;

  const capital = await prisma.capitalAccount.findFirst({
    where: { id: "capital-singleton" },
  });
  if (!capital) return null;

  const thirtyDaysAgo = subDays(new Date(), 30);
  const recentExpenses = await prisma.expenseEvent.findMany({
    where: { occurredAt: { gte: thirtyDaysAgo } },
  });

  const monthlyBurn = recentExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const dailyBurn = monthlyBurn / 30;
  const weeklyBurn = dailyBurn * 7;
  const cashBalance = Number(capital.availableCapital);

  const runwayDays = dailyBurn > 0 ? Math.floor(cashBalance / dailyBurn) : null;
  const runwayMonths = monthlyBurn > 0 ? cashBalance / monthlyBurn : null;

  return {
    dailyBurn,
    weeklyBurn,
    monthlyBurn,
    cashBalance,
    runwayDays,
    runwayMonths,
  };
}

export async function getMonthlyData(months = 6): Promise<MonthlyDataPoint[]> {
  const prisma = getPrismaClient();
  if (!prisma) return [];

  const points: MonthlyDataPoint[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const monthStart = startOfMonth(subMonths(new Date(), i));
    const monthEnd = startOfMonth(subMonths(new Date(), i - 1));

    const [revEvents, expEvents] = await Promise.all([
      prisma.revenueEvent.findMany({
        where: { occurredAt: { gte: monthStart, lt: monthEnd } },
      }),
      prisma.expenseEvent.findMany({
        where: { occurredAt: { gte: monthStart, lt: monthEnd } },
      }),
    ]);

    const revenue = revEvents.reduce((s, e) => s + Number(e.amount) - Number(e.stripeFee) - Number(e.refund), 0);
    const expenses = expEvents.reduce((s, e) => s + Number(e.amount), 0);

    points.push({
      month: formatMonth(monthStart),
      revenue,
      expenses,
      profit: revenue - expenses,
    });
  }

  return points;
}

export async function getPLByAgent(): Promise<Array<{ agentId: string; name: string; revenue: number; cost: number; profit: number }>> {
  const prisma = getPrismaClient();
  if (!prisma) return [];

  const agents = await prisma.agent.findMany({
    select: { id: true, name: true, revenueInfluenced: true, costIncurred: true },
  });

  return agents.map((a) => ({
    agentId: a.id,
    name: a.name,
    revenue: Number(a.revenueInfluenced),
    cost: Number(a.costIncurred),
    profit: Number(a.revenueInfluenced) - Number(a.costIncurred),
  }));
}

export async function getPLByBusiness(): Promise<Array<{ businessId: string; name: string; revenue: number; expenses: number; profit: number }>> {
  const prisma = getPrismaClient();
  if (!prisma) return [];

  const businesses = await prisma.business.findMany({
    select: { id: true, name: true, revenue: true, expenses: true, profit: true },
  });

  return businesses.map((b) => ({
    businessId: b.id,
    name: b.name,
    revenue: Number(b.revenue),
    expenses: Number(b.expenses),
    profit: Number(b.profit),
  }));
}
