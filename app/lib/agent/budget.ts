/**
 * budget.ts
 * Hard-cap budget guardian for AI spend.
 * Tracks daily + monthly costs from AgentThought records.
 * Enforces $50/month cap and exposes tier selection.
 */

import { getPrismaClient } from "../prisma";

export type ReasoningTier = 0 | 1 | 2 | 3;

export interface BudgetStatus {
  dailySpend: number;
  monthlySpend: number;
  dailyCap: number;
  hardCap: number;
  dailyRemaining: number;
  monthlyRemaining: number;
  throttled: boolean;
  blocked: boolean;          // true when monthly cap hit
  recommendedTier: ReasoningTier;
}

// Model names per tier
export const TIER_MODELS: Record<ReasoningTier, string | null> = {
  0: null,           // No AI
  1: "gpt-4o-mini",  // Cheap classification
  2: "gpt-4o-mini",  // Standard reasoning (default model)
  3: "gpt-4o",       // Deep reasoning — used sparingly
};

export const TIER_LABELS: Record<ReasoningTier, string> = {
  0: "Tier 0 — no AI",
  1: "Tier 1 — classification",
  2: "Tier 2 — standard",
  3: "Tier 3 — deep reasoning",
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function thisMonthStr(): string {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

/**
 * Get or create the BudgetTracker singleton, resetting counters if the
 * day or month has rolled over.
 */
export async function getBudgetStatus(): Promise<BudgetStatus> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return {
      dailySpend: 0, monthlySpend: 0,
      dailyCap: 2, hardCap: 50,
      dailyRemaining: 2, monthlyRemaining: 50,
      throttled: false, blocked: false,
      recommendedTier: 2,
    };
  }

  const today = todayStr();
  const thisMonth = thisMonthStr();

  let tracker = await (prisma as any).budgetTracker.findUnique({
    where: { id: "budget-singleton" },
  });

  if (!tracker) {
    tracker = await (prisma as any).budgetTracker.create({
      data: { id: "budget-singleton", dailyDate: today, monthlyDate: thisMonth },
    });
  }

  // Reset daily counter if date rolled
  const needsDailyReset = tracker.dailyDate !== today;
  // Reset monthly counter if month rolled
  const needsMonthlyReset = tracker.monthlyDate !== thisMonth;

  if (needsDailyReset || needsMonthlyReset) {
    tracker = await (prisma as any).budgetTracker.update({
      where: { id: "budget-singleton" },
      data: {
        ...(needsDailyReset ? { dailySpend: 0, dailyDate: today } : {}),
        ...(needsMonthlyReset ? { monthlySpend: 0, monthlyDate: thisMonth, throttled: false } : {}),
      },
    });
  }

  const daily = Number(tracker.dailySpend);
  const monthly = Number(tracker.monthlySpend);
  const dailyCap = Number(tracker.dailyCap);
  const hardCap = Number(tracker.hardCap);

  const dailyRemaining = Math.max(0, dailyCap - daily);
  const monthlyRemaining = Math.max(0, hardCap - monthly);
  const blocked = monthly >= hardCap;
  const throttled = tracker.throttled || daily >= dailyCap;

  // Pick recommended tier based on remaining budget
  let recommendedTier: ReasoningTier = 2;
  if (blocked) {
    recommendedTier = 0;
  } else if (throttled || monthlyRemaining < 5) {
    recommendedTier = 1; // Only cheap AI when budget is tight
  } else if (monthlyRemaining < 15) {
    recommendedTier = 2; // Standard but no Tier 3
  } else {
    recommendedTier = 2; // Normal operation — Tier 3 allowed on explicit request
  }

  return {
    dailySpend: daily,
    monthlySpend: monthly,
    dailyCap,
    hardCap,
    dailyRemaining,
    monthlyRemaining,
    throttled,
    blocked,
    recommendedTier,
  };
}

/**
 * Record AI spend after an agent turn completes.
 * Called by think.ts after each successful OpenAI response.
 */
export async function recordSpend(costUsd: number): Promise<void> {
  if (costUsd <= 0) return;
  const prisma = getPrismaClient();
  if (!prisma) return;

  const today = todayStr();
  const thisMonth = thisMonthStr();

  try {
    await (prisma as any).budgetTracker.upsert({
      where: { id: "budget-singleton" },
      create: {
        id: "budget-singleton",
        dailySpend: costUsd,
        monthlySpend: costUsd,
        dailyDate: today,
        monthlyDate: thisMonth,
      },
      update: {
        dailySpend: { increment: costUsd },
        monthlySpend: { increment: costUsd },
      },
    });
  } catch {
    // Non-fatal — don't break agent runs over budget tracking
  }
}

/**
 * Check whether an AI call is allowed at the requested tier.
 * Returns { allowed, reason, downgradeToTier } if blocked or downgraded.
 */
export async function checkBudgetAllowance(requestedTier: ReasoningTier): Promise<{
  allowed: boolean;
  actualTier: ReasoningTier;
  reason: string;
}> {
  if (requestedTier === 0) {
    return { allowed: true, actualTier: 0, reason: "Tier 0 always allowed" };
  }

  const status = await getBudgetStatus();

  if (status.blocked) {
    return {
      allowed: false,
      actualTier: 0,
      reason: `Monthly budget cap of $${status.hardCap} reached ($${status.monthlySpend.toFixed(4)} spent). No AI calls until next month.`,
    };
  }

  if (requestedTier === 3 && status.monthlyRemaining < 15) {
    return {
      allowed: true,
      actualTier: 2,
      reason: `Tier 3 downgraded to Tier 2 — less than $15 monthly budget remaining ($${status.monthlyRemaining.toFixed(2)} left).`,
    };
  }

  if (status.throttled && requestedTier >= 2) {
    return {
      allowed: true,
      actualTier: 1,
      reason: `Daily cap reached — downgraded to Tier 1 classification only.`,
    };
  }

  return { allowed: true, actualTier: requestedTier, reason: "Within budget" };
}
