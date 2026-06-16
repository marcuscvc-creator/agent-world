import { getPrismaClient } from "../prisma";

export type RevenueSource =
  | "stripe"
  | "stripe_payment"
  | "stripe_webhook"
  | "direct"
  | "affiliate"
  | "consulting"
  | "ad_revenue"
  | "manual_entry"
  | "other";

export type ExpenseCategory =
  | "openai_api"
  | "OPENAI_API"
  | "stripe_fee"
  | "hosting"
  | "domain"
  | "marketing"
  | "tools"
  | "agent_labor"
  | "other";

export type LogRevenueInput = {
  amount: number;
  source: RevenueSource | string;
  description?: string;
  stripeFee?: number;
  refund?: number;
  sandbox?: boolean;
  agentId?: string;
  businessId?: string;
};

export type LogExpenseInput = {
  amount: number;
  category: ExpenseCategory | string;
  description?: string;
  reason?: string;
  vendorName?: string;
  approved?: boolean;
  agentId?: string;
  businessId?: string;
};

/**
 * Record a revenue event and update WorldState + CapitalAccount in a single transaction.
 * Returns the created RevenueEvent.
 */
export async function logRevenue(input: LogRevenueInput) {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Database not connected.");

  const amount = input.amount;
  const fee = input.stripeFee ?? 0;
  const refund = input.refund ?? 0;
  const net = amount - fee - refund;
  const sourceLabel = input.description
    ? `${input.source}::${input.description}`
    : input.source;

  const [event] = await prisma.$transaction([
    prisma.revenueEvent.create({
      data: {
        source: sourceLabel.slice(0, 255),
        amount,
        stripeFee: fee,
        refund,
        sandbox: input.sandbox ?? (process.env.NODE_ENV !== "production"),
      },
    }),
    prisma.worldState.updateMany({
      where: { id: "world-singleton" },
      data: {
        grossRevenue: { increment: amount },
        netRevenue: { increment: net },
        profit: { increment: net },
      },
    }),
    prisma.capitalAccount.updateMany({
      where: { id: "capital-singleton" },
      data: {
        generatedRevenue: { increment: net },
        availableCapital: { increment: net },
        netProfit: { increment: net },
      },
    }),
  ]);

  // Update world stage after revenue change
  await recalculateWorldStage();

  // If agentId provided, credit agent's revenue influence
  if (input.agentId) {
    await prisma.agent.update({
      where: { id: input.agentId },
      data: { revenueInfluenced: { increment: net } },
    }).catch(() => null);
  }

  return event;
}

/**
 * Record an expense event and update WorldState + CapitalAccount in a single transaction.
 * Returns the created ExpenseEvent.
 */
export async function logExpense(input: LogExpenseInput) {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Database not connected.");

  // Normalize category to lowercase for consistency
  const category = input.category.toLowerCase().replace("openai_api", "openai_api");
  const reason = input.reason ?? input.description ?? "Agent expense";
  const vendorNote = input.vendorName ? ` (${input.vendorName})` : "";

  const [event] = await prisma.$transaction([
    prisma.expenseEvent.create({
      data: {
        category,
        amount: input.amount,
        reason: `${reason}${vendorNote}`.slice(0, 500),
        approved: input.approved ?? false,
      },
    }),
    prisma.worldState.updateMany({
      where: { id: "world-singleton" },
      data: {
        expenses: { increment: input.amount },
        profit: { decrement: input.amount },
      },
    }),
    prisma.capitalAccount.updateMany({
      where: { id: "capital-singleton" },
      data: {
        currentExpenses: { increment: input.amount },
        availableCapital: { decrement: input.amount },
        netProfit: { decrement: input.amount },
        ...(input.approved
          ? { approvedSpending: { increment: input.amount } }
          : {}),
      },
    }),
  ]);

  // Debit agent's cost if agentId provided
  if (input.agentId) {
    await prisma.agent.update({
      where: { id: input.agentId },
      data: { costIncurred: { increment: input.amount } },
    }).catch(() => null);
  }

  return event;
}

/**
 * Recalculate and update the world stage string based on current grossRevenue.
 */
export async function recalculateWorldStage(): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) return;

  const world = await prisma.worldState.findFirst({ where: { id: "world-singleton" } });
  if (!world) return;

  const gross = Number(world.grossRevenue);
  let stage = "campsite";
  if (gross >= 10_000_000) stage = "empire";
  else if (gross >= 1_000_000) stage = "metropolis";
  else if (gross >= 100_000) stage = "city";
  else if (gross >= 10_000) stage = "town";
  else if (gross >= 1_000) stage = "village";
  else if (gross >= 100) stage = "cabins";

  await prisma.worldState.updateMany({ where: { id: "world-singleton" }, data: { stage } });
}
