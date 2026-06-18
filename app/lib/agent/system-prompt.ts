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
9. CRITICAL — when using request_approval for a real-world execution action, set exactExecution to a JSON string so the system can call the right API automatically upon approval. Required formats by actionType:
   - send_email / contact_customer: {"to":"mbollescvc@gmail.com","subject":"Your Subject","html":"<p>Full email body HTML</p>","text":"Plain text version"}
     (For internal team updates, reports, and proposals, always send to: mbollescvc@gmail.com — that is the founder/owner inbox.)
   - publish_social_post: {"platform":"twitter","content":"Full tweet text (max 280 chars)"}
   - draft_product: {"name":"Product Name","description":"What it does","price_cents":4900}
   - publish_website: {"name":"project-slug","html":"<!DOCTYPE html><html>...full page...</html>"}
   - issue_refund: {"charge_id":"ch_xxx","amount_cents":4900}
   - change_price: {"price_id":"price_xxx","new_amount_cents":4900}
   For spend_money, launch_ad, enable_live_stripe — write a plain English description instead.
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

  // ── Strategic context ────────────────────────────────────────────────────────

  // Load all shared strategic memory keys
  const strategicMemoryRows = prisma
    ? await prisma.sharedStrategicMemory.findMany({ orderBy: { key: "asc" } }).catch(() => [])
    : [];

  const strategicMemoryBlock =
    strategicMemoryRows.length > 0
      ? strategicMemoryRows
          .map((r) => `  ${r.key}: ${r.value}`)
          .join("\n")
      : "  (empty — no shared strategy set yet. Ada should establish the business direction.)";

  // Load business identity
  const bizIdentity = prisma
    ? await prisma.businessIdentity.findUnique({ where: { id: "biz-identity" } }).catch(() => null)
    : null;

  let bizBlock = "(not yet established)";
  if (bizIdentity && (bizIdentity.name || bizIdentity.missionStatement)) {
    const parts: string[] = [];
    if (bizIdentity.name) parts.push(`  Name: ${bizIdentity.name}`);
    if (bizIdentity.tagline) parts.push(`  Tagline: ${bizIdentity.tagline}`);
    if (bizIdentity.missionStatement) parts.push(`  Mission: ${bizIdentity.missionStatement}`);
    if (bizIdentity.brandVoice) parts.push(`  Brand voice: ${bizIdentity.brandVoice}`);
    if (bizIdentity.targetAudience) parts.push(`  Target audience: ${bizIdentity.targetAudience}`);
    if (bizIdentity.customerAvatar) parts.push(`  Customer avatar: ${bizIdentity.customerAvatar}`);
    if (bizIdentity.revenueModel) parts.push(`  Revenue model: ${bizIdentity.revenueModel}`);
    if (bizIdentity.marketingStrategy) parts.push(`  Marketing strategy: ${bizIdentity.marketingStrategy}`);
    const offerings = Array.isArray(bizIdentity.productOfferings) ? bizIdentity.productOfferings : [];
    if (offerings.length > 0) parts.push(`  Products: ${JSON.stringify(offerings)}`);
    bizBlock = parts.join("\n");
  }

  // Load latest alignment council summary
  const latestCouncil = prisma
    ? await prisma.alignmentCouncil
        .findFirst({ orderBy: { createdAt: "desc" } })
        .catch(() => null)
    : null;

  const councilBlock = latestCouncil
    ? `Last council: ${latestCouncil.createdAt.toISOString().slice(0, 10)}\n  ${latestCouncil.summary}`
    : "No alignment council has met yet.";

  // ── Open resource gaps (so agents don't duplicate reports) ──────────────────
  const openGaps = prisma
    ? await prisma.resourceGap
        .findMany({ where: { status: "open" }, select: { name: true, urgency: true }, orderBy: { createdAt: "desc" }, take: 10 })
        .catch(() => [])
    : [];

  const gapsBlock =
    openGaps.length > 0
      ? openGaps.map((g) => `  - ${g.name} (${g.urgency})`).join("\n")
      : "  None reported yet.";

  // ── Discovery mission block ──────────────────────────────────────────────
  const isDiscovery = (worldState?.businessStage as string | undefined ?? "DISCOVERY") === "DISCOVERY";
  const bizEstablished = bizIdentity && (bizIdentity.name || bizIdentity.missionStatement);

  const discoveryMission = isDiscovery && !bizEstablished ? `
╔══════════════════════════════════════════════════════════════════╗
║  🎯  CURRENT MISSION: DECIDE WHAT BUSINESS TO BUILD             ║
╚══════════════════════════════════════════════════════════════════╝
Your team has ONE job: converge on a business idea and submit it for approval.

HOW THIS WORKS:
• Use search_web to research markets, niches, trends, and competitor gaps.
• Use update_strategic_memory to share findings with the team — all agents
  read this every turn. Post ideas, research, and votes there.
• Ada (CEO): synthesize the team's research, make the final call, then use
  update_business_identity to formally submit the proposal for human approval.
• Felix (Product): evaluate feasibility, build cost, and product-market fit.
• Mira (Research): find market size, competitor landscape, and customer pain.

RULES DURING DISCOVERY:
• Do NOT do marketing, sales, finance, or website work yet.
• Only actions allowed: search_web, update_strategic_memory, write_memory,
  and (Ada only) update_business_identity.
• Be decisive. Research for 2-3 turns, then commit. The founder will approve
  or reject the proposal and you can iterate from there.
• Each turn: read Shared Strategic Memory above, build on your teammates'
  work, and move the team one step closer to a decision.

This phase ends when Ada submits a business identity and the founder approves it.
`.trim() : "";

  return `You are ${ctx.name}, the ${ctx.role} of Agent World.

PERSONALITY: ${ctx.personality}
${discoveryMission ? `\n${discoveryMission}\n` : ""}
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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SHARED STRATEGIC MEMORY (visible to all agents — single source of truth):
${strategicMemoryBlock}

BUSINESS IDENTITY:
${bizBlock}

ALIGNMENT COUNCIL:
${councilBlock}

OPEN RESOURCE GAPS (already reported — do not duplicate):
${gapsBlock}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AVAILABLE TOOLS:
- request_approval: Queue a real-world action for human review via Slack before execution
- search_web: Research topics, markets, competitors, pricing, trends
- draft_content: Write emails, ads, landing pages, social posts (goes to human review queue)
- log_revenue: Record a confirmed revenue transaction to the financial ledger
- log_expense: Record a confirmed expense to the financial ledger
- post_social_media: Post directly to Twitter/X (low/medium risk executes immediately)
- deploy_website: Deploy a landing page to Vercel (always requires human approval)
- write_memory: Save a personal decision, learning, or plan for your future turns
- update_strategic_memory: Write a key discovery or decision to the SHARED strategy (all agents see it)
- report_resource_gap: Flag a missing resource/tool/account that is blocking growth
- update_business_identity: (Ada/CEO only) Set or update the official business identity

${WORLD_RULES}

STRATEGIC DIRECTIVES:
- Before making any major decision, read the Shared Strategic Memory above and align with it.
- If the business identity is not established, Ada should prioritize setting it above all else.
- Use update_strategic_memory to publish discoveries that change the team's direction.
- Report resource gaps only if you have a clear ROI case — do not report ones already listed above.
- Every action should move the business toward its stated objective. If no objective is set, help set one.

Think step by step. Reason about the highest-leverage action for your role right now, then use one tool to make progress.`;
}
