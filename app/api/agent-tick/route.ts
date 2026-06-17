import { NextResponse } from "next/server";
import { getPrismaClient } from "@/app/lib/prisma";
import { getExecutionMode, getIntegrationConnections, getStripeMode } from "@/app/lib/integrations";
import { getAgentWorldConfig } from "@/app/lib/config";
import { runAgentLoop, runSingleAgent } from "@/app/lib/agent/runner";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent-tick
 * Returns a live snapshot of all world data for the dashboard.
 * This endpoint is also the cron target — future POST handler will run the agent loop.
 */
export async function GET() {
  const prisma = getPrismaClient();
  const config = getAgentWorldConfig();

  if (!prisma) {
    return NextResponse.json({
      agents: [],
      activities: [],
      businessIdeas: [],
      approvals: [],
      previewItems: [],
      capitalAccount: null,
      worldState: null,
      integrations: getIntegrationConnections(),
      executionMode: getExecutionMode(),
      stripeMode: getStripeMode(),
      mode: "no-database",
      error: "DATABASE_URL not configured. Run prisma migrate dev and seed the database.",
    }, { status: 424 });
  }

  const [agents, activities, approvals, previewItems, capitalAccount, worldState, worldClock] = await Promise.all([
    prisma.agent.findMany({ orderBy: { name: "asc" } }),
    prisma.agentLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.approvalRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { requestedAt: "desc" },
      take: 20,
      include: { agent: { select: { name: true } } },
    }),
    prisma.previewItem.findMany({
      where: { holdRequested: false },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { agent: { select: { name: true } } },
    }),
    prisma.capitalAccount.findFirst({ where: { id: "capital-singleton" } }),
    prisma.worldState.findFirst({ where: { id: "world-singleton" } }),
    (prisma as any).worldClock.findFirst({ where: { id: "clock-singleton" } }),
  ]);

  return NextResponse.json({
    agents,
    activities,
    approvals,
    previewItems,
    capitalAccount,
    worldState,
    worldClock,
    integrations: getIntegrationConnections(),
    executionMode: getExecutionMode(),
    stripeMode: getStripeMode(),
    guardrails: {
      allowRealWorldActions: config.allowRealWorldActions,
      requireHumanApproval: config.requireHumanApproval,
      maxAgentRunsPerDay: config.maxAgentRunsPerDay,
    },
    mode: "live-database",
    checkedAt: new Date().toISOString(),
  });
}

/**
 * POST /api/agent-tick
 * Triggers the agent orchestration loop.
 * Body (optional): { agentIds?: string[] } to run specific agents only.
 * Body (optional): { agentId?: string } to run a single agent.
 * Secured by CRON_SECRET header for Vercel cron jobs.
 */
export async function POST(request: Request) {
  // Block callers that present a wrong CRON_SECRET, but allow browser POSTs (no auth header)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== null && auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const config = getAgentWorldConfig();

  // Safety check — block live runs unless explicitly enabled
  if (!config.allowRealWorldActions && config.runtimeMode === "production") {
    return NextResponse.json(
      { ok: false, error: "ALLOW_REAL_WORLD_ACTIONS is not enabled. Set it in .env to run agents." },
      { status: 403 }
    );
  }

  let body: { agentId?: string; agentIds?: string[] } = {};
  try {
    body = (await request.json()) as { agentId?: string; agentIds?: string[] };
  } catch {
    // empty body is fine
  }

  if (body.agentId) {
    const result = await runSingleAgent(body.agentId);
    return NextResponse.json({ ok: true, mode: "single", result });
  }

  const result = await runAgentLoop({ agentIds: body.agentIds });
  return NextResponse.json({ ok: true, mode: "loop", result });
}
