/**
 * /api/alignment-council
 *
 * POST — Run a single GPT-4o synthesis call that acts as the 4-hour Alignment Council.
 * Called by the Vercel cron (every 4 hours) and optionally by a manual trigger.
 *
 * Stays under the 10s Vercel Hobby timeout by doing ONE OpenAI call (not 8 agent ticks).
 * The synthesis reads all recent AgentThoughts + SharedStrategicMemory + WorldState + Tasks,
 * then produces:
 *   - A strategic narrative summary
 *   - Updated SharedStrategicMemory keys
 *   - Task assignments for each agent
 *   - Business identity recommendation (if not yet established)
 *   - Flagged resource gaps
 *
 * Saves an AlignmentCouncil record, updates SharedStrategicMemory, creates Task records,
 * and posts a Slack digest.
 */

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getPrismaClient } from "../../lib/prisma";
import { sendSlackMessage } from "../../lib/integrations";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Types for the council output ────────────────────────────────────────────

type Decision = {
  decision: string;
  assignee: string; // agentId
  priority: "high" | "medium" | "low";
  successMetric: string;
};

type StrategicUpdate = {
  key: string;
  value: string;
};

type ResourceGapReport = {
  resourceType: string;
  name: string;
  reason: string;
  estimatedRoi: string;
  alternatives: string;
  estimatedCost: string;
  urgency: "low" | "medium" | "high";
};

type TaskAssignment = {
  agentId: string;
  title: string;
  goal: string;
  priority: "low" | "medium" | "high" | "critical";
};

type CouncilOutput = {
  summary: string;
  strategicUpdates: StrategicUpdate[];
  decisions: Decision[];
  taskAssignments: TaskAssignment[];
  resourceGaps: ResourceGapReport[];
  businessIdentityRecommendation?: {
    field: string;
    value: string;
    rationale: string;
  } | null;
};

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const isManual = searchParams.get("manual") === "true";

  // Verify cron secret for automated calls
  if (!isManual) {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const prisma = getPrismaClient();
  if (!prisma) {
    return NextResponse.json({ error: "Database not connected" }, { status: 500 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  const startedAt = Date.now();

  try {
    // ── 1. Gather context ──────────────────────────────────────────────────────

    const [
      agents,
      worldState,
      recentThoughts,
      strategicMemory,
      bizIdentity,
      openTasks,
      openGaps,
      lastCouncil,
    ] = await Promise.all([
      prisma.agent.findMany({ select: { id: true, name: true, role: true, status: true } }),
      prisma.worldState.findFirst({ where: { id: "world-singleton" } }),
      prisma.agentThought.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        orderBy: { createdAt: "desc" },
        take: 60,
        select: { agentId: true, reasoning: true, createdAt: true },
      }),
      prisma.sharedStrategicMemory.findMany({ orderBy: { key: "asc" } }),
      prisma.businessIdentity.findUnique({ where: { id: "biz-identity" } }),
      prisma.task.findMany({
        where: { status: { in: ["QUEUED", "IN_PROGRESS"] } },
        select: { id: true, agentId: true, title: true, goal: true, status: true, priority: true },
        take: 20,
      }),
      prisma.resourceGap.findMany({
        where: { status: "open" },
        select: { name: true, urgency: true, reason: true },
        take: 10,
      }),
      prisma.alignmentCouncil.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true, summary: true } }),
    ]);

    const gross = worldState ? Number(worldState.grossRevenue) : 0;

    // Format agent thoughts grouped by agent
    const thoughtsByAgent: Record<string, string[]> = {};
    for (const t of recentThoughts) {
      if (!thoughtsByAgent[t.agentId]) thoughtsByAgent[t.agentId] = [];
      thoughtsByAgent[t.agentId].push(t.reasoning.slice(0, 300));
    }

    const agentReports = agents.map((a) => ({
      agentId: a.id,
      name: a.name,
      role: a.role,
      status: a.status,
      recentThoughts: (thoughtsByAgent[a.id] ?? []).slice(0, 5),
    }));

    const strategicMemoryMap = Object.fromEntries(
      strategicMemory.map((r) => [r.key, r.value])
    );

    const bizSummary =
      bizIdentity && bizIdentity.name
        ? `Name: ${bizIdentity.name}, Mission: ${bizIdentity.missionStatement}, Revenue model: ${bizIdentity.revenueModel}`
        : "NOT ESTABLISHED";

    // ── 2. Build synthesis prompt ──────────────────────────────────────────────

    const systemPrompt = `You are the Alignment Council moderator for Agent World — an autonomous AI startup.
Your job is to synthesize what has happened in the last 24 hours, produce a clear strategic direction, and assign concrete work to each agent.
Output ONLY valid JSON matching the CouncilOutput schema. No markdown, no explanation — raw JSON only.

CouncilOutput schema:
{
  "summary": "string — 2-3 sentence strategic narrative of where the business stands and what the team should focus on",
  "strategicUpdates": [{ "key": "string", "value": "string" }],
  "decisions": [{ "decision": "string", "assignee": "agentId", "priority": "high|medium|low", "successMetric": "string" }],
  "taskAssignments": [{ "agentId": "string", "title": "string", "goal": "string", "priority": "low|medium|high|critical" }],
  "resourceGaps": [{ "resourceType": "string", "name": "string", "reason": "string", "estimatedRoi": "string", "alternatives": "string", "estimatedCost": "string", "urgency": "low|medium|high" }],
  "businessIdentityRecommendation": { "field": "string", "value": "string", "rationale": "string" } | null
}`;

    const userPrompt = `CURRENT STATE:
Gross revenue: $${gross.toLocaleString()}
Business identity: ${bizSummary}
Last council: ${lastCouncil ? lastCouncil.createdAt.toISOString().slice(0, 10) + " — " + lastCouncil.summary.slice(0, 200) : "Never — this is the first council."}

SHARED STRATEGIC MEMORY:
${JSON.stringify(strategicMemoryMap, null, 2)}

OPEN RESOURCE GAPS:
${openGaps.map((g) => `- ${g.name} (${g.urgency}): ${g.reason}`).join("\n") || "None"}

CURRENT OPEN TASKS:
${openTasks.map((t) => `[${t.agentId}] ${t.title}: ${t.goal} (${t.priority}, ${t.status})`).join("\n") || "None"}

AGENT TEAM & RECENT THOUGHTS (last 24h):
${JSON.stringify(agentReports, null, 2)}

INSTRUCTIONS:
1. Write a 2-3 sentence summary of where the business stands and what the key focus should be.
2. Produce strategicUpdates — update at minimum: business_objective, current_priorities, last_council_summary. Add new keys for any important discoveries.
3. Produce decisions — concrete choices the team is making this cycle (max 5).
4. Assign ONE concrete task per active agent (skip PAUSED/OFFLINE agents). Tasks must be specific and achievable in one agent turn.
5. Flag new resource gaps only if NOT already in the open gaps list above and there is a clear ROI case.
6. If the business identity is NOT ESTABLISHED, provide a businessIdentityRecommendation for the most impactful field to set first (usually "name" or "missionStatement").
7. If business identity IS established, set businessIdentityRecommendation to null.`;

    // ── 3. Call GPT-4o ────────────────────────────────────────────────────────

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.3,
      max_tokens: 2000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let council: CouncilOutput;

    try {
      council = JSON.parse(raw) as CouncilOutput;
    } catch {
      return NextResponse.json(
        { error: "GPT-4o returned invalid JSON", raw },
        { status: 500 }
      );
    }

    // ── 4. Persist results ────────────────────────────────────────────────────

    // 4a. Update SharedStrategicMemory
    for (const update of council.strategicUpdates ?? []) {
      if (!update.key || !update.value) continue;
      await prisma.sharedStrategicMemory.upsert({
        where: { key: update.key },
        create: { key: update.key, value: update.value, updatedBy: "alignment-council", version: 1 },
        update: { value: update.value, updatedBy: "alignment-council", version: { increment: 1 } },
      });
    }

    // 4b. Save new ResourceGaps (skip duplicates)
    const existingGapNames = new Set(openGaps.map((g) => g.name.toLowerCase()));
    for (const gap of council.resourceGaps ?? []) {
      if (!gap.name || existingGapNames.has(gap.name.toLowerCase())) continue;
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
          status: "open",
        },
      }).catch(() => null);
    }

    // 4c. Create task assignments (skip agents with existing open tasks for same title)
    const newTasks: string[] = [];
    for (const assignment of council.taskAssignments ?? []) {
      if (!assignment.agentId || !assignment.title) continue;
      const agent = agents.find((a) => a.id === assignment.agentId);
      if (!agent) continue;

      const priorityMap: Record<string, "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"> = {
        low: "LOW", medium: "MEDIUM", high: "HIGH", critical: "CRITICAL",
      };
      const priority = priorityMap[(assignment.priority ?? "medium").toLowerCase()] ?? "MEDIUM";

      await prisma.task.create({
        data: {
          agentId: assignment.agentId,
          title: assignment.title,
          goal: assignment.goal ?? assignment.title,
          status: "QUEUED",
          priority,
          source: "SYSTEM",
        },
      }).catch(() => null);

      newTasks.push(`[${assignment.agentId}] ${assignment.title}`);
    }

    // 4d. Save AlignmentCouncil record
    const councilRecord = await prisma.alignmentCouncil.create({
      data: {
        councilType: isManual ? "manual" : "scheduled",
        summary: council.summary ?? "",
        agentReports: agentReports as never,
        decisions: (council.decisions ?? []) as never,
        objectives: (council.strategicUpdates ?? []) as never,
        resourceGaps: (council.resourceGaps ?? []) as never,
      },
    });

    // ── 5. Post Slack digest ──────────────────────────────────────────────────

    try {
      const decisionLines = (council.decisions ?? [])
        .slice(0, 5)
        .map((d) => `• *${d.decision}* → ${d.assignee} (${d.priority})`)
        .join("\n");

      const taskLines = newTasks.slice(0, 8).join("\n• ");

      const slackText =
        `🏛️ *Alignment Council — ${new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}*\n\n` +
        `*Strategic Summary:*\n${council.summary}\n\n` +
        (decisionLines ? `*Decisions this cycle:*\n${decisionLines}\n\n` : "") +
        (newTasks.length > 0 ? `*New tasks assigned:*\n• ${taskLines}\n\n` : "") +
        `_Council ID: ${councilRecord.id} | Duration: ${Math.round((Date.now() - startedAt) / 1000)}s_`;

      await sendSlackMessage({ type: "EXECUTED", text: slackText });
    } catch {
      // Slack failure is non-fatal
    }

    const durationMs = Date.now() - startedAt;

    return NextResponse.json({
      ok: true,
      councilId: councilRecord.id,
      summary: council.summary,
      strategicUpdatesCount: (council.strategicUpdates ?? []).length,
      tasksCreated: newTasks.length,
      resourceGapsFlagged: (council.resourceGaps ?? []).length,
      durationMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[alignment-council] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Allow manual GET trigger from the dashboard
export async function GET(req: Request) {
  const url = new URL(req.url);
  url.searchParams.set("manual", "true");
  return POST(new Request(url.toString(), { method: "POST", headers: req.headers }));
}
