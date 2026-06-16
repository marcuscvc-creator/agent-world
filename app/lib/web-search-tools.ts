import { getAgentWorldConfig } from "./config";
import { checkExecutionAllowed } from "./execution-manager";

type WebSearchUsage = {
  day: string;
  count: number;
  estimatedCost: number;
};

const globalUsage = globalThis as typeof globalThis & {
  __agentWorldWebSearchUsage?: WebSearchUsage;
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function usage() {
  const day = todayKey();
  if (!globalUsage.__agentWorldWebSearchUsage || globalUsage.__agentWorldWebSearchUsage.day !== day) {
    globalUsage.__agentWorldWebSearchUsage = { day, count: 0, estimatedCost: 0 };
  }
  return globalUsage.__agentWorldWebSearchUsage;
}

export function checkWebSearchAllowed(input: { query: string; broadResearch?: boolean; estimatedCost?: number }) {
  const config = getAgentWorldConfig();
  const current = usage();
  const estimatedCost = input.estimatedCost ?? 0;

  if (!config.allowWebSearch) {
    return { allowed: false, reasons: ["ALLOW_WEB_SEARCH is false."], usage: current };
  }

  if (current.count >= config.maxWebSearchesPerDay) {
    return { allowed: false, reasons: ["MAX_WEB_SEARCHES_PER_DAY limit reached."], usage: current };
  }

  if (input.broadResearch && config.requireApprovalForWebSearch) {
    const decision = checkExecutionAllowed({
      actionType: "spend_money",
      riskLevel: "medium",
      spendingAmount: estimatedCost
    });
    if (!decision.allowed) return { allowed: false, reasons: ["Broad web research requires approval.", ...decision.reasons], usage: current };
  }

  return { allowed: true, reasons: [], usage: current };
}

export function logWebSearchUsage(estimatedCost = 0) {
  const current = usage();
  current.count += 1;
  current.estimatedCost += estimatedCost;
  return current;
}
