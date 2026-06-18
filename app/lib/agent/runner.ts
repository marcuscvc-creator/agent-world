/**
 * runner.ts
 * Orchestrates a full agent loop tick: runs all eligible agents sequentially,
 * collecting results. Called by POST /api/agent-tick.
 */

import { getPrismaClient } from "../prisma";
import { thinkAgentTurn, type ThinkResult } from "./think";

export type RunnerResult = {
  triggeredAt: string;
  agentsEligible: number;
  agentsRun: number;
  agentsSkipped: number;
  totalTokens: number;
  totalCostUsd: number;
  approvalsQueued: number;
  draftsCreated: number;
  results: ThinkResult[];
  errors: Array<{ agentId: string; agentName: string; error: string }>;
};

/**
 * Run all eligible agents (IDLE or WORKING, not WAITING_APPROVAL or BLOCKED).
 * Agents run sequentially to avoid race conditions on shared world state.
 * Returns a full summary of the run.
 */
export async function runAgentLoop(options?: { agentIds?: string[] }): Promise<RunnerResult> {
  const prisma = getPrismaClient();
  const triggeredAt = new Date().toISOString();

  const empty: RunnerResult = {
    triggeredAt,
    agentsEligible: 0,
    agentsRun: 0,
    agentsSkipped: 0,
    totalTokens: 0,
    totalCostUsd: 0,
    approvalsQueued: 0,
    draftsCreated: 0,
    results: [],
    errors: [],
  };

  if (!prisma) {
    return { ...empty, errors: [{ agentId: "system", agentName: "System", error: "Database not connected." }] };
  }

  if (!process.env.OPENAI_API_KEY) {
    return { ...empty, errors: [{ agentId: "system", agentName: "System", error: "OPENAI_API_KEY not set." }] };
  }

  // Load eligible agents
  const whereClause = options?.agentIds
    ? { id: { in: options.agentIds } }
    : { status: { in: ["IDLE", "WORKING"] as ("IDLE" | "WORKING")[] } };

  const agents = await prisma.agent.findMany({
    where: whereClause,
    orderBy: { name: "asc" },
    select: { id: true, name: true, status: true },
  });

  const results: ThinkResult[] = [];
  const errors: Array<{ agentId: string; agentName: string; error: string }> = [];
  let agentsRun = 0;
  let agentsSkipped = 0;
  let totalTokens = 0;
  let totalCostUsd = 0;
  let approvalsQueued = 0;
  let draftsCreated = 0;

  for (const agent of agents) {
    try {
      const result = await thinkAgentTurn(agent.id);
      results.push(result);

      if (result.error && result.reasoning.includes("waiting for approval")) {
        agentsSkipped++;
      } else {
        agentsRun++;
      }

      totalTokens += result.tokensUsed;
      totalCostUsd += result.costUsd;
      if (result.approvalQueued) approvalsQueued++;

      // Count draft_content tool executions
      draftsCreated += result.toolsExecuted.filter((t) => t.toolName === "draft_content" && t.success).length;

      if (result.error && !result.error.includes("waiting")) {
        errors.push({ agentId: agent.id, agentName: agent.name, error: result.error });
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      errors.push({ agentId: agent.id, agentName: agent.name, error });
      agentsSkipped++;
    }
  }

  // Record overall run in an AgentLog summary entry
  await prisma.agentLog.create({
    data: {
      agentId: agents[0]?.id ?? "system",
      message: `Agent loop completed: ${agentsRun} agents ran, ${approvalsQueued} approvals queued, $${totalCostUsd.toFixed(5)} OpenAI cost`,
      rationale: `Runner tick at ${triggeredAt}`,
      toolUsed: "runner",
      result: `${totalTokens} tokens used`,
      approvalNeeded: approvalsQueued > 0,
    },
  }).catch(() => null);

  return {
    triggeredAt,
    agentsEligible: agents.length,
    agentsRun,
    agentsSkipped,
    totalTokens,
    totalCostUsd,
    approvalsQueued,
    draftsCreated,
    results,
    errors,
  };
}

/**
 * Run a single specific agent by ID.
 */
export async function runSingleAgent(agentId: string): Promise<ThinkResult> {
  return thinkAgentTurn(agentId);
}

/**
 * Run the next IDLE agent in round-robin order (oldest updatedAt first).
 * Designed for Vercel Hobby: one agent per call, stays under 10s timeout.
 *
 * Auto-recovery: before picking an agent, reset any stuck in THINKING/WORKING/WAITING_APPROVAL
 * for more than 60 seconds (caused by Vercel function timeouts killing the process mid-run).
 */
export async function runNextAgent(): Promise<
  (ThinkResult & { agentId: string; agentName: string }) | { skipped: true; reason: string }
> {
  const prisma = getPrismaClient();
  if (!prisma) return { skipped: true, reason: "Database not connected." };
  if (!process.env.OPENAI_API_KEY) return { skipped: true, reason: "OPENAI_API_KEY not set." };

  // Recover agents stuck in THINKING or WORKING for > 300s (Vercel Pro timeout victims).
  // WAITING_APPROVAL is intentional and must NOT be auto-cleared here — it persists
  // until the human approves or rejects via the approvals UI.
  const stuckCutoff = new Date(Date.now() - 300_000);
  await prisma.agent.updateMany({
    where: {
      status: { in: ["THINKING", "WORKING"] },
      updatedAt: { lt: stuckCutoff },
    },
    data: { status: "IDLE" },
  }).catch(() => null);

  const agent = await prisma.agent.findFirst({
    where: {
      status: "IDLE",
      // Skip agents that have been manually paused (currentTask starts with "PAUSED")
      NOT: { currentTask: { startsWith: "PAUSED" } },
    },
    orderBy: { updatedAt: "asc" },
    select: { id: true, name: true },
  });

  if (!agent) return { skipped: true, reason: "No IDLE agents found." };

  const result = await thinkAgentTurn(agent.id);
  return { ...result, agentId: agent.id, agentName: agent.name };
}
