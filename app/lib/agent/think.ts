/**
 * think.ts
 * One agent reasoning turn: build prompt → call OpenAI → execute tools → persist AgentThought.
 */

import type OpenAI from "openai";
import { getOpenAIClient, MODELS } from "../ai/client";
import { calculateCostUsd } from "../ai/costs";
import { getPrismaClient } from "../prisma";
import { buildSystemPrompt } from "./system-prompt";
import { AGENT_TOOLS } from "./tool-definitions";
import { executeTool, type ToolCallArgs, type ToolResult } from "./tool-executor";
import { pruneStaleMemories } from "./memory";

export type ThinkResult = {
  agentId: string;
  agentName: string;
  thoughtId: string | null;
  model: string;
  tokensUsed: number;
  costUsd: number;
  reasoning: string;
  toolsExecuted: ToolResult[];
  approvalQueued: boolean;
  error?: string;
};

const MAX_TOOL_ROUNDS = 3; // Prevent runaway tool loops

export async function thinkAgentTurn(agentId: string): Promise<ThinkResult> {
  const prisma = getPrismaClient();
  const client = getOpenAIClient();

  const base: Omit<ThinkResult, "thoughtId"> = {
    agentId,
    agentName: agentId,
    model: MODELS.default,
    tokensUsed: 0,
    costUsd: 0,
    reasoning: "",
    toolsExecuted: [],
    approvalQueued: false,
  };

  if (!client) {
    return {
      ...base,
      thoughtId: null,
      error: "OPENAI_API_KEY not set — agent cannot think.",
    };
  }

  if (!prisma) {
    return {
      ...base,
      thoughtId: null,
      error: "DATABASE_URL not set — agent cannot load context.",
    };
  }

  // Load agent record
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) {
    return { ...base, thoughtId: null, error: `Agent ${agentId} not found in database.` };
  }

  // Skip agents already waiting for approval
  if (agent.status === "WAITING_APPROVAL") {
    return {
      ...base,
      agentName: agent.name,
      thoughtId: null,
      reasoning: `Agent ${agent.name} is waiting for approval — skipping this turn.`,
      approvalQueued: true,
    };
  }

  // Prune stale memories periodically
  await pruneStaleMemories(agentId).catch(() => null);

  // Mark agent as THINKING
  await prisma.agent.update({ where: { id: agentId }, data: { status: "THINKING" } });

  const systemPrompt = await buildSystemPrompt({
    agentId: agent.id,
    name: agent.name,
    role: agent.role,
    personality: agent.personality,
    currentGoal: agent.currentGoal,
    currentTask: agent.currentTask,
    trustScore: agent.trustScore,
  });

  const model = MODELS.default;
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `It's time for your turn, ${agent.name}. Review your context, identify the highest-leverage action, and use a tool to make progress. Think step by step.`,
    },
  ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const toolsExecuted: ToolResult[] = [];
  let finalReasoning = "";
  let approvalQueued = false;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.chat.completions.create({
        model,
        messages,
        tools: AGENT_TOOLS,
        // Round 0: force a tool call so agents always take action.
        // Subsequent rounds: auto so the agent can stop naturally.
        tool_choice: round === 0 ? "required" : "auto",
        temperature: 0.7,
        max_tokens: 1500,
      });

      const choice = response.choices[0];
      totalInputTokens += response.usage?.prompt_tokens ?? 0;
      totalOutputTokens += response.usage?.completion_tokens ?? 0;

      const assistantMessage = choice.message;
      messages.push(assistantMessage);

      // Capture any text reasoning
      if (assistantMessage.content) {
        finalReasoning += (finalReasoning ? "\n\n" : "") + assistantMessage.content;
      }

      // No tool calls — agent is done for this turn
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        break;
      }

      // Mark agent as WORKING now that it has tool calls to execute
      await prisma.agent.update({ where: { id: agentId }, data: { status: "WORKING" } }).catch(() => null);

      // Execute each tool call
      const toolResultMessages: OpenAI.Chat.ChatCompletionToolMessageParam[] = [];

      for (const toolCall of assistantMessage.tool_calls) {
        let args: ToolCallArgs = {};
        try {
          args = JSON.parse(toolCall.function.arguments) as ToolCallArgs;
        } catch {
          // malformed JSON from model
        }

        const result = await executeTool(agentId, toolCall.function.name, args);
        toolsExecuted.push(result);

        if (result.approvalQueued) approvalQueued = true;

        toolResultMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result.output,
        });
      }

      messages.push(...toolResultMessages);

      // If an approval was queued, end the turn — agent is now paused
      if (approvalQueued) break;
    }

    const costUsd = calculateCostUsd(model, totalInputTokens, totalOutputTokens);
    const tokensUsed = totalInputTokens + totalOutputTokens;

    // Persist AgentThought record
    const thoughtRecord = await (prisma as any).agentThought.create({
      data: {
        agentId,
        prompt: systemPrompt,
        reasoning: finalReasoning || "(no text reasoning — tool calls only)",
        toolCalls: toolsExecuted.map((t) => ({
          toolName: t.toolName,
          success: t.success,
          outputPreview: t.output.slice(0, 200),
        })),
        tokensUsed,
        costUsd,
      },
    });

    // Log the OpenAI API expense
    if (costUsd > 0) {
      await prisma.expenseEvent.create({
        data: {
          amount: costUsd,
          category: "openai_api",
          reason: `${agent.name} think() turn — ${tokensUsed} tokens (OpenAI)`,
          approved: true,
        },
      }).catch(() => null);
    }

    // If approval was queued, set WAITING_APPROVAL so UI shows the right state.
    // Otherwise return to IDLE so the agent can be picked up next tick.
    const newStatus = approvalQueued ? "WAITING_APPROVAL" : "IDLE";
    await prisma.agent.update({
      where: { id: agentId },
      data: { status: newStatus },
    });

    // Log to AgentLog for activity feed
    const summary = toolsExecuted.length > 0
      ? `Used ${toolsExecuted.map((t) => t.toolName).join(", ")}`
      : "Reasoned without tool use";

    await prisma.agentLog.create({
      data: {
        agentId,
        message: summary,
        rationale: finalReasoning.slice(0, 500),
        toolUsed: toolsExecuted[0]?.toolName ?? "none",
        result: toolsExecuted[0]?.output.slice(0, 300) ?? "",
        approvalNeeded: approvalQueued,
      },
    }).catch(() => null);

    return {
      agentId,
      agentName: agent.name,
      thoughtId: thoughtRecord.id,
      model,
      tokensUsed,
      costUsd,
      reasoning: finalReasoning,
      toolsExecuted,
      approvalQueued,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);

    // Reset agent status on error
    await prisma.agent.update({
      where: { id: agentId },
      data: { status: "IDLE" },
    }).catch(() => null);

    return {
      agentId,
      agentName: agent.name,
      thoughtId: null,
      model,
      tokensUsed: totalInputTokens + totalOutputTokens,
      costUsd: calculateCostUsd(model, totalInputTokens, totalOutputTokens),
      reasoning: finalReasoning,
      toolsExecuted,
      approvalQueued,
      error,
    };
  }
}
