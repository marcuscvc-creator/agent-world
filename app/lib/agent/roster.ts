/**
 * roster.ts
 * Manages which agents are active based on the current business stage.
 * Defines milestone progression and event → agent routing.
 */

import { getPrismaClient } from "../prisma";

export type BusinessStage =
  | "DISCOVERY"
  | "BUSINESS_CHOSEN"
  | "VALIDATION"
  | "BUILD"
  | "LAUNCH"
  | "FIRST_REVENUE"
  | "GROWTH";

// Agent names exactly as stored in DB
export type AgentName = "Ada" | "Felix" | "Kai" | "Mira" | "Nova" | "Rex" | "Sage" | "Vera";

export const ALL_AGENTS: AgentName[] = ["Ada", "Felix", "Kai", "Mira", "Nova", "Rex", "Sage", "Vera"];

// Which agents are active at each business stage
export const ROSTER_BY_STAGE: Record<BusinessStage, AgentName[]> = {
  DISCOVERY:       ["Ada", "Felix", "Mira"],
  BUSINESS_CHOSEN: ["Ada", "Felix", "Mira", "Kai", "Sage"],
  VALIDATION:      ["Ada", "Felix", "Mira", "Kai", "Sage", "Rex"],
  BUILD:           ["Ada", "Felix", "Mira", "Kai", "Sage", "Rex", "Vera"],
  LAUNCH:          ["Ada", "Felix", "Mira", "Kai", "Sage", "Rex", "Vera"],
  FIRST_REVENUE:   ["Ada", "Felix", "Kai", "Mira", "Nova", "Rex", "Sage", "Vera"],
  GROWTH:          ["Ada", "Felix", "Kai", "Mira", "Nova", "Rex", "Sage", "Vera"],
};

// Human-readable reason an agent unlocks at each stage
export const UNLOCK_REASONS: Partial<Record<BusinessStage, string>> = {
  BUSINESS_CHOSEN: "Business idea chosen — Kai starts positioning, Sage reviews compliance",
  VALIDATION:      "Validation phase — Rex starts early customer outreach",
  BUILD:           "Build phase — Vera starts website and brand presence",
  FIRST_REVENUE:   "First revenue received — Nova now has real numbers to track",
  GROWTH:          "Growth phase — all agents fully active",
};

// Milestone criteria — these are checked each orchestrator cycle
export const MILESTONE_CHECKS: Array<{
  fromStage: BusinessStage;
  toStage: BusinessStage;
  description: string;
  check: (snapshot: WorldSnapshot) => boolean;
}> = [
  {
    fromStage: "DISCOVERY",
    toStage: "BUSINESS_CHOSEN",
    description: "A business idea has been approved by human",
    check: (s) => s.approvedBusinessIdeas > 0,
  },
  {
    fromStage: "BUSINESS_CHOSEN",
    toStage: "VALIDATION",
    description: "Business model is defined and at least one product exists",
    check: (s) => s.productCount > 0 && s.businessIdentitySet,
  },
  {
    fromStage: "VALIDATION",
    toStage: "BUILD",
    description: "At least 3 leads or potential customers identified",
    check: (s) => s.leadCount >= 3,
  },
  {
    fromStage: "BUILD",
    toStage: "LAUNCH",
    description: "At least one website launched",
    check: (s) => s.websitesLaunched > 0,
  },
  {
    fromStage: "LAUNCH",
    toStage: "FIRST_REVENUE",
    description: "First revenue received (any amount > $0)",
    check: (s) => s.grossRevenue > 0,
  },
  {
    fromStage: "FIRST_REVENUE",
    toStage: "GROWTH",
    description: "MRR > $100",
    check: (s) => s.mrr > 100,
  },
];

export interface WorldSnapshot {
  grossRevenue: number;
  mrr: number;
  leadCount: number;
  websitesLaunched: number;
  productCount: number;
  approvedBusinessIdeas: number;
  businessIdentitySet: boolean;
}

// Event types the orchestrator can detect
export type OrchestratorEvent =
  | "approval_resolved"      // approval approved/rejected
  | "new_task_assigned"      // new task created for an agent
  | "agent_unblocked"        // agent returned to IDLE from WAITING_APPROVAL
  | "new_slack_message"      // new Slack message arrived
  | "business_idea_created"  // new business idea in DB
  | "revenue_event"          // new revenue recorded
  | "milestone_reached"      // business stage advanced
  | "alignment_council_due"  // 4 hours since last council
  | "agent_blocked"          // agent entered BLOCKED status
  | "resource_gap_reported"  // new resource gap filed
  | "manual_trigger";        // human pressed "Run Now"

// Maps event types to which agent(s) should handle them
export const EVENT_ROUTING: Record<OrchestratorEvent, AgentName[]> = {
  approval_resolved:      ["Ada"],           // CEO reviews what was approved and directs next step
  new_task_assigned:      [],                // Determined dynamically by task.agentId
  agent_unblocked:        [],                // Wake the specific unblocked agent
  new_slack_message:      ["Ada"],           // CEO screens messages, delegates if needed
  business_idea_created:  ["Ada", "Felix", "Mira"],  // All three evaluate
  revenue_event:          ["Ada", "Nova"],   // CEO + Finance notified
  milestone_reached:      ["Ada"],           // CEO handles stage transition
  alignment_council_due:  [],                // All active roster — handled separately
  agent_blocked:          ["Ada"],           // CEO resolves blockages
  resource_gap_reported:  ["Ada"],           // CEO decides on resource requests
  manual_trigger:         [],                // Wake all IDLE agents in active roster
};

/**
 * Get the current active roster from WorldState.
 * Falls back to DISCOVERY roster if not set.
 */
export async function getActiveRoster(): Promise<AgentName[]> {
  const prisma = getPrismaClient();
  if (!prisma) return ROSTER_BY_STAGE.DISCOVERY;

  const worldState = await prisma.worldState.findFirst({
    where: { id: "world-singleton" },
    select: { activeRoster: true, businessStage: true },
  });

  if (!worldState) return ROSTER_BY_STAGE.DISCOVERY;

  const stage = (worldState.businessStage as BusinessStage) ?? "DISCOVERY";
  const stored = worldState.activeRoster as string[];

  // Validate stored roster against expected — use expected if mismatch
  const expected = ROSTER_BY_STAGE[stage];
  return stored?.length > 0 ? (stored as AgentName[]) : expected;
}

/**
 * Get the current business stage.
 */
export async function getBusinessStage(): Promise<BusinessStage> {
  const prisma = getPrismaClient();
  if (!prisma) return "DISCOVERY";

  const worldState = await prisma.worldState.findFirst({
    where: { id: "world-singleton" },
    select: { businessStage: true },
  });

  return (worldState?.businessStage as BusinessStage) ?? "DISCOVERY";
}

/**
 * Check if a milestone has been reached and advance the stage if so.
 * Returns the new stage if advanced, null if no change.
 */
export async function checkAndAdvanceMilestone(snapshot: WorldSnapshot): Promise<BusinessStage | null> {
  const prisma = getPrismaClient();
  if (!prisma) return null;

  const currentStage = await getBusinessStage();

  const next = MILESTONE_CHECKS.find(
    (m) => m.fromStage === currentStage && m.check(snapshot)
  );

  if (!next) return null;

  const newRoster = ROSTER_BY_STAGE[next.toStage];

  await prisma.worldState.updateMany({
    where: { id: "world-singleton" },
    data: {
      businessStage: next.toStage as any,
      activeRoster: newRoster,
    },
  });

  return next.toStage;
}

/**
 * Given an event type, return the agent names to wake — filtered
 * to only those currently in the active roster.
 */
export async function resolveTargetAgents(
  event: OrchestratorEvent,
  context?: { agentName?: AgentName }
): Promise<AgentName[]> {
  const roster = await getActiveRoster();

  if (event === "agent_unblocked" || event === "new_task_assigned") {
    // Wake the specific agent if they're on the roster
    if (context?.agentName && roster.includes(context.agentName)) {
      return [context.agentName];
    }
    return [];
  }

  if (event === "manual_trigger" || event === "alignment_council_due") {
    return roster;
  }

  const targets = EVENT_ROUTING[event];
  return targets.filter((name) => roster.includes(name));
}
