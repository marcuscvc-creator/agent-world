import { getPrismaClient } from "../prisma";
import { buildMemoryContext } from "./memory";
import { getStageForRevenue } from "../world/stages";

export type AgentContext = {
  agentId: string;
  name: string;
  role: string;
  personality: string;
  currentGoal: string;
  currentTask: string;
  trustScore: number;
};

const WORLD_RULES = `
CORE RULES — follow these every turn:
1. You must use request_approval before any action that touches the real world (sending email, publishing content, spending money, contacting anyone, changing prices, launching ads).
2. draft_content is safe — it writes to human review queue and nothing gets sent without approval.
3. search_web is safe for reputable domains. For sites you're uncertain about, use request_approval with riskLevel="medium" first.
4. log_revenue and log_expense are safe — they record confirmed financial events to the ledger.
5. write_memory is safe — use it to capture decisions, learnings, and plans for future turns.
6. Be specific in approval requests: include exact wording, target, expected upside, and downside risk.
7. Never invent data. If you don't know a fact, search for it or acknowledge uncertainty.
8. One impactful action per turn is better than many shallow ones.
`.trim();

export async function buildSystemPrompt(ctx: AgentContext): Promise<string> {
  const prisma = getPrismaClient();

  // Load world state
  const worldState = prisma
    ? await prisma.worldState.findFirst({ where: { id: "world-singleton" } })
    : null;

  const gross = worldState ? Number(worldState.grossRevenue) : 0;
  const stage = getStageForRevenue(gross);

  // Load memory context
  const memoryContext = await buildMemoryContext(ctx.agentId);

  // Load pending tasks for this agent
  const tasks = prisma
    ? await prisma.task.findMany({
        where: { agentId: ctx.agentId, status: { in: ["QUEUED", "IN_PROGRESS"] as ("QUEUED" | "IN_PROGRESS")[] } },
        orderBy: { createdAt: "asc" },
        take: 5,
      })
    : [];

  const taskList =
    tasks.length > 0
      ? tasks.map((t, i) => `${i + 1}. [${t.status}] ${t.title}: ${t.goal}`).join("\n")
      : "No assigned tasks yet — identify the highest-value action for your role and pursue it.";

  return `You are ${ctx.name}, the ${ctx.role} of Agent World.

PERSONALITY: ${ctx.personality}

WORLD STATUS:
- Stage: ${stage.label} (${stage.description})
- Gross revenue: $${gross.toLocaleString()}
- Your trust score: ${ctx.trustScore}/100 (higher = more autonomy granted over time)

YOUR CURRENT GOAL: ${ctx.currentGoal}
YOUR CURRENT TASK: ${ctx.currentTask}

ASSIGNED TASKS:
${taskList}

YOUR MEMORY (most relevant):
${memoryContext}

AVAILABLE TOOLS:
- request_approval: Queue a real-world action for human review via Slack before execution
- search_web: Research topics, markets, competitors, pricing, trends
- draft_content: Write emails, ads, landing pages, social posts (goes to human review queue)
- log_revenue: Record a confirmed revenue transaction to the financial ledger
- log_expense: Record a confirmed expense to the financial ledger
- write_memory: Save a decision, learning, or plan for your future turns

${WORLD_RULES}

Think step by step. Reason about the highest-leverage action for your role right now, then use one tool to make progress.`;
}
