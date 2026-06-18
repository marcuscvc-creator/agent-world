/**
 * /api/alignment-council
 *
 * POST — Option A round-robin Alignment Council.
 * Each active roster agent gets a sequential OpenAI call and sees
 * the full transcript of what previous agents said.
 * Ada goes last to synthesize and make final decisions.
 *
 * Called by the Vercel cron (every 6 hours) and optionally manually.
 * Output stored in SharedStrategicMemory and posted to Slack.
 */

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getPrismaClient } from "../../lib/prisma";
import { sendSlackMessage } from "../../lib/integrations";
import { getActiveRoster, type AgentName } from "../../lib/agent/roster";
import { recordSpend, getBudgetStatus } from "../../lib/agent/budget";
import { calculateCostUsd } from "../../lib/ai/costs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const COUNCIL_MODEL = "gpt-4o-mini"; // Tier 2 per agent
const ADA_MODEL = "gpt-4o-mini";     // Ada synthesizes — same tier, just different prompt

type AgentContribution = {
  agentName: AgentName;
  role: string;
  contribution: string;
  topPriority: string;
  concerns: string;
};

type CouncilDecision = {
  decision: string;
  assignee: string;
  priority: "high" | "medium" | "low";
  successMetric: string;
};

type CouncilOutput = {
  summary: string;
  strategicUpdates: Array<{ key: string; value: string }>;
  decisions: CouncilDecision[];
  taskAssignments: Array<{ agentId: string; title: string; goal: string; priority: string }>;
  resourceGaps: Array<{
    resourceType: string; name: string; reason: string;
    estimatedRoi: string; alternatives: string; estimatedCost: string; urgency: string;
  }>;
};

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const isManual = searchParams.get("manual") === "true";

  if (!isManual) {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const prisma = getPrismaClient();
  if (!prisma) return NextResponse.json({ error: "Database not connected" }, { status: 500 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  // Budget check
  const budget = await getBudgetStatus();
  if (budget.blocked) {
    return NextResponse.json({
      ok: false,
      reason: `Monthly budget cap reached — council skipped`,
    });
  }

  const startedAt = Date.now();

  try {
    // ── 1. Load context ──────────────────────────────────────────────────────

    const [
      allAgents,
      worldState,
      recentThoughts,
      strategicMemory,
      bizIdentity,
      openTasks,
      pendingApprovals,
      lastCouncil,
    ] = await Promise.all([
      prisma.agent.findMany({ select: { id: true, name: true, role: true, personality: true, status: true, currentGoal: true } }),
      prisma.worldState.findFirst({ where: { id: "world-singleton" } }),
      (prisma as any).agentThought.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) } },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { agentId: true, reasoning: true, createdAt: true },
      }),
      prisma.sharedStrategicMemory.findMany({ orderBy: { key: "asc" } }),
      (prisma as any).businessIdentity.findUnique({ where: { id: "biz-identity" } }),
      prisma.task.findMany({
        where: { status: { in: ["QUEUED", "IN_PROGRESS"] } },
        select: { agentId: true, title: true, priority: true, status: true },
        take: 15,
        orderBy: { createdAt: "desc" },
      }),
      prisma.approvalRequest.count({ where: { status: "PENDING" } }),
      prisma.alignmentCouncil.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true, summary: true } }),
    ]);

    const activeRoster = await getActiveRoster();

    // Build context strings
    const strategicMemoryStr = strategicMemory
      .map((m) => `${m.key}: ${m.value.slice(0, 200)}`)
      .join("\n") || "No strategic memory yet.";

    const businessContext =
      bizIdentity?.name
        ? `Business: ${bizIdentity.name} — ${bizIdentity.missionStatement || "(no mission yet)"}`
        : "No business established yet. Agents are in DISCOVERY phase.";

    const worldContext = `Revenue: $${Number(worldState?.grossRevenue ?? 0).toFixed(2)} | Stage: ${worldState?.businessStage ?? "DISCOVERY"} | Pending approvals: ${pendingApprovals}`;

    const openTasksStr = openTasks.length > 0
      ? openTasks.map((t) => `- [${t.agentId}] ${t.title} (${t.priority}, ${t.status})`).join("\n")
      : "No open tasks.";

    // Group recent thoughts by agent
    const thoughtsByAgent: Record<string, string[]> = {};
    for (const t of recentThoughts) {
      if (!thoughtsByAgent[t.agentId]) thoughtsByAgent[t.agentId] = [];
      thoughtsByAgent[t.agentId].push(t.reasoning.slice(0, 200));
    }

    // ── 2. Round-robin: each active agent contributes ────────────────────────
    // Non-Ada agents go first, Ada synthesizes last

    const contributions: AgentContribution[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const transcript: string[] = [];

    const nonAdaRoster = activeRoster.filter((n) => n !== "Ada");
    const orderedRoster: AgentName[] = ([...nonAdaRoster, "Ada" as AgentName].filter((n) =>
      activeRoster.includes(n as AgentName)
    )) as AgentName[];

    for (const agentName of orderedRoster) {
      const agentRecord = allAgents.find((a) => a.name === agentName);
      if (!agentRecord) continue;

      const isAda = agentName === "Ada";
      const agentThoughts = (thoughtsByAgent[agentRecord.id] ?? []).slice(0, 3).join(" | ") || "No recent activity.";

      const transcriptSoFar = transcript.length > 0
        ? `\nCOUNCIL TRANSCRIPT SO FAR:\n${transcript.join("\n\n")}\n`
        : "\nYou are the first to speak in this council.\n";

      const systemMsg = isAda
        ? `You are Ada, CEO of Agent World. You have heard from your team in the council above. Your job is to synthesize their input, make final strategic decisions, and produce a concrete action plan.
Output ONLY valid JSON:
{
  "summary": "2-3 sentence strategic narrative",
  "topPriority": "single most important focus this cycle",
  "concerns": "any risks or blockers you see",
  "strategicUpdates": [{"key": "string", "value": "string"}],
  "decisions": [{"decision": "string", "assignee": "agentId string", "priority": "high|medium|low", "successMetric": "string"}],
  "taskAssignments": [{"agentId": "string", "title": "string", "goal": "string", "priority": "low|medium|high|critical"}],
  "resourceGaps": [{"resourceType": "string", "name": "string", "reason": "string", "estimatedRoi": "string", "alternatives": "string", "estimatedCost": "string", "urgency": "low|medium|high"}]
}`
        : `You are ${agentName}, ${agentRecord.role} at Agent World. You are participating in the Alignment Council.
Be direct and specific. Focus on what matters from your role's perspective.
Output ONLY valid JSON:
{
  "contribution": "2-3 sentences on your current situation and what you're working on",
  "topPriority": "the single most important thing for the business right now from your perspective",
  "concerns": "any blockers, risks, or things the team should know"
}`;

      const userMsg = `${businessContext}
${worldContext}
Last council: ${lastCouncil ? lastCouncil.summary.slice(0, 150) : "First council ever."}

SHARED STRATEGY:
${strategicMemoryStr}

OPEN TASKS:
${openTasksStr}

YOUR RECENT ACTIVITY:
${agentThoughts}
${transcriptSoFar}
${isAda ? "Now synthesize the team's input and produce the final council output." : `As ${agentName}, share your contribution to this council.`}`;

      try {
        const response = await openai.chat.completions.create({
          model: isAda ? ADA_MODEL : COUNCIL_MODEL,
          temperature: 0.5,
          max_tokens: isAda ? 1500 : 400,
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: userMsg },
          ],
          response_format: { type: "json_object" },
        });

        totalInputTokens += response.usage?.prompt_tokens ?? 0;
        totalOutputTokens += response.usage?.completion_tokens ?? 0;

        const raw = response.choices[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(raw);

        if (isAda) {
          // Ada's output IS the final council output
          const adaOutput = parsed as CouncilOutput & { topPriority: string; concerns: string };
          contributions.push({
            agentName: "Ada",
            role: agentRecord.role,
            contribution: adaOutput.summary ?? "",
            topPriority: adaOutput.topPriority ?? "",
            concerns: adaOutput.concerns ?? "",
          });
          transcript.push(`ADA (CEO — synthesis):\n${adaOutput.summary}`);

          // Record spend
          const cost = calculateCostUsd(ADA_MODEL, totalInputTokens, totalOutputTokens);
          await recordSpend(cost);

          // ── 3. Persist results ────────────────────────────────────────────

          // Update SharedStrategicMemory
          for (const update of adaOutput.strategicUpdates ?? []) {
            if (!update.key || !update.value) continue;
            await prisma.sharedStrategicMemory.upsert({
              where: { key: update.key },
              create: { key: update.key, value: update.value, updatedBy: "alignment-council", version: 1 },
              update: { value: update.value, updatedBy: "alignment-council", version: { increment: 1 } },
            });
          }

          // Save ResourceGaps
          const existingGaps = await prisma.resourceGap.findMany({ where: { status: "open" }, select: { name: true } });
          const existingNames = new Set(existingGaps.map((g) => g.name.toLowerCase()));
          for (const gap of adaOutput.resourceGaps ?? []) {
            if (!gap.name || existingNames.has(gap.name.toLowerCase())) continue;
            await prisma.resourceGap.create({
              data: {
                reportedBy: "alignment-council",
                resourceType: gap.resourceType ?? "other",
                name: gap.name,
                reason: gap.reason ?? "",
                estimatedRoi: gap.estimatedRoi ?? "",
                alternatives: gap.alternatives ?? "",
                estimatedCost: gap.estimatedCost ?? "",
                urgency: gap.urgency ?? "medium",
              },
            }).catch(() => null);
          }

          // Create task assignments
          const createdTasks: string[] = [];
          for (const t of adaOutput.taskAssignments ?? []) {
            if (!t.agentId || !t.title) continue;
            const priorityMap: Record<string, string> = { low: "LOW", medium: "MEDIUM", high: "HIGH", critical: "CRITICAL" };
            await prisma.task.create({
              data: {
                agentId: t.agentId,
                title: t.title,
                goal: t.goal ?? t.title,
                status: "QUEUED",
                priority: priorityMap[(t.priority ?? "medium").toLowerCase()] ?? "MEDIUM",
                source: "SYSTEM",
              },
            }).catch(() => null);
            createdTasks.push(t.title);
          }

          // Save council record
          const councilRecord = await prisma.alignmentCouncil.create({
            data: {
              councilType: isManual ? "manual" : "scheduled",
              summary: adaOutput.summary ?? "",
              agentReports: contributions as never,
              decisions: (adaOutput.decisions ?? []) as never,
              objectives: (adaOutput.strategicUpdates ?? []) as never,
              resourceGaps: (adaOutput.resourceGaps ?? []) as never,
            },
          });

          // Post Slack digest
          try {
            const contributionLines = contributions
              .filter((c) => c.agentName !== "Ada")
              .map((c) => `• *${c.agentName}*: ${c.topPriority}`)
              .join("\n");

            const slackText =
              `🏛️ *Alignment Council — ${new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}*\n\n` +
              `*Ada's Summary:*\n${adaOutput.summary}\n\n` +
              (contributionLines ? `*Team priorities:*\n${contributionLines}\n\n` : "") +
              `_${orderedRoster.length} agents participated | ${createdTasks.length} tasks created | Council ID: ${councilRecord.id} | ${Math.round((Date.now() - startedAt) / 1000)}s_`;

            await sendSlackMessage({ type: "EXECUTED", text: slackText });
          } catch {
            // non-fatal
          }

          return NextResponse.json({
            ok: true,
            councilId: councilRecord.id,
            agentsParticipated: orderedRoster.length,
            summary: adaOutput.summary,
            decisionsCount: (adaOutput.decisions ?? []).length,
            tasksCreated: createdTasks.length,
            tokensUsed: totalInputTokens + totalOutputTokens,
            costUsd: calculateCostUsd(COUNCIL_MODEL, totalInputTokens, totalOutputTokens),
            durationMs: Date.now() - startedAt,
          });
        } else {
          // Non-Ada agents: capture their contribution and add to transcript
          const contribution: AgentContribution = {
            agentName,
            role: agentRecord.role,
            contribution: parsed.contribution ?? "",
            topPriority: parsed.topPriority ?? "",
            concerns: parsed.concerns ?? "",
          };
          contributions.push(contribution);
          transcript.push(`${agentName.toUpperCase()} (${agentRecord.role}):\nView: ${parsed.contribution}\nPriority: ${parsed.topPriority}\nConcerns: ${parsed.concerns}`);
        }
      } catch (err) {
        // If one agent fails, continue with the rest
        console.error(`[alignment-council] Agent ${agentName} failed:`, err);
        transcript.push(`${agentName.toUpperCase()}: [failed to contribute — skipped]`);
      }
    }

    // Fallback if Ada wasn't in the roster somehow
    return NextResponse.json({
      ok: false,
      reason: "Ada not in active roster — council incomplete",
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[alignment-council] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  url.searchParams.set("manual", "true");
  return POST(new Request(url.toString(), { method: "POST", headers: req.headers }));
}
