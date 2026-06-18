/**
 * orchestrator.ts
 * Runs every 60 seconds (Tier 0 — no AI).
 *
 * DISCOVERY mode: proactively pushes Ada/Felix/Mira every 5 minutes until
 * they produce and submit a business idea for human approval. Once an
 * approved idea exists, normal event-driven logic takes over.
 *
 * All other modes: only wake agents when something meaningful changed.
 * Most cycles cost $0.
 */

import { getPrismaClient } from "../prisma";
import { getBudgetStatus } from "./budget";
import {
  getActiveRoster,
  checkAndAdvanceMilestone,
  resolveTargetAgents,
  type OrchestratorEvent,
  type AgentName,
  type WorldSnapshot,
} from "./roster";
import { runSingleAgent } from "./runner";
import type { ThinkResult } from "./think";

export interface OrchestratorResult {
  cycleAt: string;
  cycleCount: number;
  meaningful: boolean;
  reason: string;
  events: OrchestratorEvent[];
  agentsWoken: AgentName[];
  milestoneReached: string | null;
  budgetBlocked: boolean;
  costUsd: number;
  agentResults: Array<{ agentName: AgentName; result: ThinkResult | { skipped: true; reason: string } }>;
}

const COUNCIL_INTERVAL_MS = 4 * 60 * 60 * 1000;  // 4 hours
const DISCOVERY_COOLDOWN_MS = 5 * 60 * 1000;      // 5 minutes between agent re-runs in Discovery

export async function runOrchestrator(): Promise<OrchestratorResult> {
  const prisma = getPrismaClient();
  const cycleAt = new Date().toISOString();

  const empty: OrchestratorResult = {
    cycleAt,
    cycleCount: 0,
    meaningful: false,
    reason: "No meaningful changes detected — heartbeat only",
    events: [],
    agentsWoken: [],
    milestoneReached: null,
    budgetBlocked: false,
    costUsd: 0,
    agentResults: [],
  };

  if (!prisma) {
    return { ...empty, reason: "Database not connected" };
  }

  // ── Step 1: Budget check (Tier 0) ─────────────────────────────────────────
  const budget = await getBudgetStatus();
  if (budget.blocked) {
    return {
      ...empty,
      budgetBlocked: true,
      reason: `Monthly budget cap reached ($${budget.monthlySpend.toFixed(4)}/$${budget.hardCap}). No AI calls until next month.`,
    };
  }

  // ── Step 2: Load last orchestrator snapshot (Tier 0) ──────────────────────
  let snapshot = await (prisma as any).orchestratorState.findUnique({
    where: { id: "orchestrator-singleton" },
  });

  if (!snapshot) {
    snapshot = await (prisma as any).orchestratorState.create({
      data: { id: "orchestrator-singleton" },
    });
  }

  const cycleCount = (snapshot.cycleCount ?? 0) + 1;

  // ── Step 3: Scan current world state (Tier 0 — all DB reads, no AI) ───────
  const [
    agents,
    pendingApprovals,
    pendingTasks,
    recentSlackMessages,
    businessIdeas,
    worldState,
    revenueEvents,
    products,
  ] = await Promise.all([
    prisma.agent.findMany({
      select: { id: true, name: true, status: true, currentTask: true, updatedAt: true },
    }),
    prisma.approvalRequest.count({ where: { status: "PENDING" } }),
    prisma.task.count({ where: { status: "QUEUED" } }),
    prisma.slackMessage.count({ where: { createdAt: { gt: snapshot.lastCycleAt } } }),
    prisma.businessIdea.count(),
    prisma.worldState.findFirst({ where: { id: "world-singleton" } }),
    prisma.revenueEvent.count({ where: { occurredAt: { gt: snapshot.lastCycleAt } } }),
    prisma.product.count(),
  ]);

  // Build current agent status map
  const currentStatuses: Record<string, string> = {};
  for (const a of agents) {
    currentStatuses[a.id] = a.status;
  }

  // Build world snapshot for milestone checks
  const approvedIdeas = await prisma.businessIdea.count({ where: { status: "approved" } });
  const biz = await (prisma as any).businessIdentity.findUnique({ where: { id: "biz-identity" } });
  const worldSnap: WorldSnapshot = {
    grossRevenue: Number(worldState?.grossRevenue ?? 0),
    mrr: Number(worldState?.mrr ?? 0),
    leadCount: Number(worldState?.leads ?? 0),
    websitesLaunched: Number(worldState?.websitesLaunched ?? 0),
    productCount: products,
    approvedBusinessIdeas: approvedIdeas,
    businessIdentitySet: biz?.name?.length > 0 && biz?.approvedByHuman === true,
  };

  const businessStage = (worldState?.businessStage as string) ?? "DISCOVERY";

  // ── Step 4: Detect meaningful changes (Tier 0) ────────────────────────────
  const events: OrchestratorEvent[] = [];
  const lastStatuses = (snapshot.lastAgentStatuses as Record<string, string>) ?? {};

  if (pendingApprovals !== snapshot.lastPendingApprovals) {
    events.push("approval_resolved");
  }

  for (const a of agents) {
    const prev = lastStatuses[a.id];
    if (prev === "WAITING_APPROVAL" && a.status === "IDLE") {
      events.push("agent_unblocked");
    }
    if (a.status === "BLOCKED" && prev !== "BLOCKED") {
      events.push("agent_blocked");
    }
  }

  if (recentSlackMessages > 0) events.push("new_slack_message");
  if (businessIdeas > snapshot.lastBusinessIdeaCount) events.push("business_idea_created");
  if (revenueEvents > 0) events.push("revenue_event");
  if (pendingTasks > snapshot.lastPendingTasks) events.push("new_task_assigned");

  const msSinceCouncil = Date.now() - new Date(snapshot.lastCouncilAt).getTime();
  if (msSinceCouncil >= COUNCIL_INTERVAL_MS) events.push("alignment_council_due");

  const newStage = await checkAndAdvanceMilestone(worldSnap);
  if (newStage) events.push("milestone_reached");

  // ── Step 5: Update snapshot ───────────────────────────────────────────────
  await (prisma as any).orchestratorState.update({
    where: { id: "orchestrator-singleton" },
    data: {
      lastCycleAt: new Date(),
      lastAgentStatuses: currentStatuses,
      lastPendingApprovals: pendingApprovals,
      lastPendingTasks: pendingTasks,
      lastSlackMessageCount: (snapshot.lastSlackMessageCount ?? 0) + recentSlackMessages,
      lastBusinessIdeaCount: businessIdeas,
      lastRevenue: worldSnap.grossRevenue,
      cycleCount,
    },
  });

  // ── Step 6: Discovery push ────────────────────────────────────────────────
  // In DISCOVERY with no approved business idea, proactively push active roster
  // every 5 minutes so agents keep working toward a business decision.
  const uniqueEvents = [...new Set(events)] as OrchestratorEvent[];

  if (businessStage === "DISCOVERY" && approvedIdeas === 0) {
    const discoveryRoster = await getActiveRoster();
    const anyAgentReady = agents.some((a) => {
      const isPaused = (a.currentTask as string | null)?.startsWith("PAUSED:");
      const isIdle = a.status === "IDLE";
      const cooldownPassed =
        Date.now() - new Date(a.updatedAt as Date).getTime() >= DISCOVERY_COOLDOWN_MS;
      return discoveryRoster.includes(a.name as AgentName) && isIdle && !isPaused && cooldownPassed;
    });

    if (anyAgentReady && !uniqueEvents.includes("manual_trigger")) {
      uniqueEvents.push("manual_trigger");
    }
  }

  if (uniqueEvents.length === 0) {
    return {
      ...empty,
      cycleCount,
      reason: "No meaningful changes detected — heartbeat only",
    };
  }

  // ── Step 7: Resolve which agents to wake ──────────────────────────────────
  const agentsToWakeSet = new Set<AgentName>();

  for (const event of uniqueEvents) {
    if (event === "alignment_council_due") continue;
    const targets = await resolveTargetAgents(event);
    for (const t of targets) agentsToWakeSet.add(t);
  }

  // Wake specific unblocked agents by name
  for (const a of agents) {
    const prev = lastStatuses[a.id];
    if (prev === "WAITING_APPROVAL" && a.status === "IDLE") {
      agentsToWakeSet.add(a.name as AgentName);
    }
  }

  // Filter to IDLE, non-paused agents in active roster
  const activeRoster = await getActiveRoster();
  const idleAgentNames = new Set(
    agents
      .filter((a) => {
        const isPaused = (a.currentTask as string | null)?.startsWith("PAUSED:");
        return a.status === "IDLE" && !isPaused;
      })
      .map((a) => a.name as AgentName)
  );

  // In Discovery: also enforce the 5-min cooldown per agent
  const agentsToWake = [...agentsToWakeSet].filter((name) => {
    if (!activeRoster.includes(name) || !idleAgentNames.has(name)) return false;
    if (businessStage === "DISCOVERY") {
      const agentRecord = agents.find((a) => a.name === name);
      const msSinceRun = agentRecord
        ? Date.now() - new Date(agentRecord.updatedAt as Date).getTime()
        : Infinity;
      return msSinceRun >= DISCOVERY_COOLDOWN_MS;
    }
    return true;
  });

  if (agentsToWake.length === 0) {
    return {
      ...empty,
      cycleCount,
      meaningful: true,
      reason: `Events [${uniqueEvents.join(", ")}] detected — all eligible agents are busy or in cooldown`,
      events: uniqueEvents,
      milestoneReached: newStage,
    };
  }

  // ── Step 8: Wake agents sequentially (budget-aware) ───────────────────────
  const agentResults: OrchestratorResult["agentResults"] = [];
  let totalCost = 0;

  for (const agentName of agentsToWake) {
    const currentBudget = await getBudgetStatus();
    if (currentBudget.blocked) break;

    const agentRecord = agents.find((a) => a.name === agentName);
    if (!agentRecord) continue;

    const result = await runSingleAgent(agentRecord.id);
    agentResults.push({ agentName, result: result as ThinkResult });

    const cost = "costUsd" in result ? (result as ThinkResult).costUsd : 0;
    totalCost += cost;
  }

  if (uniqueEvents.includes("alignment_council_due")) {
    await (prisma as any).orchestratorState.update({
      where: { id: "orchestrator-singleton" },
      data: { lastCouncilAt: new Date() },
    });
  }

  return {
    cycleAt,
    cycleCount,
    meaningful: true,
    reason: `Events: [${uniqueEvents.join(", ")}] → woke ${agentsToWake.length} agent(s)`,
    events: uniqueEvents,
    agentsWoken: agentsToWake,
    milestoneReached: newStage,
    budgetBlocked: false,
    costUsd: totalCost,
    agentResults,
  };
}
