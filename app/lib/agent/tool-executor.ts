/**
 * tool-executor.ts
 * Executes agent tool calls and returns string results back to the LLM.
 * All side effects (DB writes, HTTP calls) happen here.
 */

import { getPrismaClient } from "../prisma";
import { writeMemory } from "./memory";
import { logRevenue, logExpense } from "../finance/ledger";
import { sendSlackApprovalMessage, postToTwitter, deployToVercel, executeSandboxAction } from "../integrations";

export type ToolCallArgs = Record<string, unknown>;

export type ToolResult = {
  toolName: string;
  success: boolean;
  output: string; // Always a string — returned to the LLM as tool message content
  approvalQueued?: boolean;
  approvalId?: string;
};

// ── Individual tool implementations ─────────────────────────────────────────

async function execRequestApproval(agentId: string, args: ToolCallArgs): Promise<ToolResult> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return { toolName: "request_approval", success: false, output: "Database not connected — cannot queue approval." };
  }

  const {
    actionType,
    title,
    summary,
    proposedAction,
    reason,
    riskLevel,
    expectedUpside,
    downside,
    exactExecution,
    estimatedCostUsd = 0,
  } = args as {
    actionType: string;
    title: string;
    summary: string;
    proposedAction: string;
    reason: string;
    riskLevel: string;
    expectedUpside: string;
    downside: string;
    exactExecution: string;
    estimatedCostUsd?: number;
  };

  // Map string riskLevel to Prisma enum value
  const riskMap: Record<string, "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"> = {
    low: "LOW",
    medium: "MEDIUM",
    high: "HIGH",
    critical: "CRITICAL",
  };

  const normalizedRisk = riskMap[riskLevel.toLowerCase()] ?? "MEDIUM";

  // LOW and MEDIUM risk: auto-approve AND auto-execute immediately.
  // Only HIGH and CRITICAL require human sign-off.
  if (normalizedRisk === "LOW" || normalizedRisk === "MEDIUM") {
    const record = await prisma.approvalRequest.create({
      data: {
        agentId,
        actionType,
        title,
        summary,
        proposedAction,
        reason,
        riskLevel: normalizedRisk,
        expectedUpside,
        downside,
        exactExecution,
        requiresApproval: false,
        previewOnly: false,
        status: "APPROVED",
      },
    });

    // Execute the action immediately — no human needed for LOW/MEDIUM
    const agentRecord = await prisma.agent.findUnique({ where: { id: agentId }, select: { name: true } });
    const execResult = await executeSandboxAction({
      ...record,
      agentName: agentRecord?.name ?? "Agent",
      riskLevel: normalizedRisk.toLowerCase() as "low" | "medium",
      status: "approved",
      actionType: actionType as never,
      channel: "slack" as const,
    }).catch(() => null);

    if (execResult?.ok) {
      await prisma.approvalRequest.update({
        where: { id: record.id },
        data: { status: "EXECUTED", executedAt: new Date() },
      }).catch(() => null);
    }

    return {
      toolName: "request_approval",
      success: true,
      approvalQueued: false,
      output: `Auto-approved and executed (${normalizedRisk} risk). Title: "${title}". Result: ${execResult?.message ?? "executed"}`,
    };
  }

  // HIGH / CRITICAL: check for duplicate pending approval before creating a new one.
  const existing = await prisma.approvalRequest.findFirst({
    where: {
      agentId,
      title,
      status: "PENDING",
    },
    select: { id: true },
  });

  if (existing) {
    return {
      toolName: "request_approval",
      success: true,
      approvalQueued: true,
      approvalId: existing.id,
      output: `Approval already pending (ID: ${existing.id}). Title: "${title}" is awaiting human review — do not re-submit. Focus on other tasks until it is resolved.`,
    };
  }

  const approval = await prisma.approvalRequest.create({
    data: {
      agentId,
      actionType,
      title,
      summary,
      proposedAction,
      reason,
      riskLevel: normalizedRisk,
      expectedUpside,
      downside,
      exactExecution,
      requiresApproval: true,
      previewOnly: false,
      status: "PENDING",
    },
  });

  // Attempt to send to Slack (non-blocking)
  try {
    const agentRecord = await prisma.agent.findUnique({ where: { id: agentId }, select: { name: true } });
    const approvalShape = {
      id: approval.id,
      agentId: approval.agentId,
      agentName: agentRecord?.name ?? "Agent",
      actionType: approval.actionType as never,
      title: approval.title ?? undefined,
      summary: approval.summary ?? undefined,
      proposedAction: approval.proposedAction,
      reason: approval.reason,
      riskLevel: riskLevel.toLowerCase() as "low" | "medium" | "high" | "critical",
      requiresApproval: true,
      previewOnly: false,
      channel: "slack" as const,
      expectedUpside,
      downside,
      exactExecution,
      status: "pending" as const,
    };

    const slackResult = await sendSlackApprovalMessage(approvalShape);
    if (slackResult.ok && slackResult.slackTs) {
      await prisma.approvalRequest.update({
        where: { id: approval.id },
        data: { slackTs: slackResult.slackTs, slackChannelId: slackResult.slackChannelId },
      });
    }
  } catch {
    // Slack delivery failure is non-fatal
  }

  return {
    toolName: "request_approval",
    success: true,
    approvalQueued: true,
    approvalId: approval.id,
    output: `Approval request queued (ID: ${approval.id}). Risk level: ${normalizedRisk} — human sign-off required. Title: "${title}". A Slack notification has been sent. Do not re-submit this request.`,
  };
}

async function execSearchWeb(args: ToolCallArgs): Promise<ToolResult> {
  const { query, purpose, riskySite = false } = args as {
    query: string;
    purpose: string;
    riskySite?: boolean;
  };

  const apiKey = process.env.BRAVE_SEARCH_API_KEY ?? process.env.SERPER_API_KEY;

  if (!apiKey) {
    // No search key — return a helpful stub so the agent can reason forward
    return {
      toolName: "search_web",
      success: true,
      output: `[SEARCH STUB — no BRAVE_SEARCH_API_KEY set]\nQuery: "${query}"\nPurpose: ${purpose}\n\nTo enable real web search, set BRAVE_SEARCH_API_KEY in .env.local.\n\nBased on general knowledge, here is what is likely relevant to your query — treat this as unverified context only:\n- Market research should be validated with real data before acting on it.\n- Use draft_content to capture your analysis and flag it as research-pending.`,
    };
  }

  try {
    let results: Array<{ title: string; url: string; snippet: string }> = [];

    if (process.env.BRAVE_SEARCH_API_KEY) {
      const res = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
        { headers: { Accept: "application/json", "Accept-Encoding": "gzip", "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY } }
      );
      const data = (await res.json()) as { web?: { results?: Array<{ title: string; url: string; description?: string }> } };
      results = (data.web?.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: r.description ?? "" }));
    } else if (process.env.SERPER_API_KEY) {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": process.env.SERPER_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, num: 5 }),
      });
      const data = (await res.json()) as { organic?: Array<{ title: string; link: string; snippet?: string }> };
      results = (data.organic ?? []).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet ?? "" }));
    }

    if (results.length === 0) {
      return { toolName: "search_web", success: true, output: `No results found for "${query}".` };
    }

    const formatted = results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
      .join("\n\n");

    const warning = riskySite ? "\n⚠️ You flagged this search as potentially risky. Review URLs before citing them." : "";

    return {
      toolName: "search_web",
      success: true,
      output: `Search results for "${query}" (Purpose: ${purpose}):${warning}\n\n${formatted}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { toolName: "search_web", success: false, output: `Search failed: ${message}` };
  }
}

async function execDraftContent(agentId: string, args: ToolCallArgs): Promise<ToolResult> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return { toolName: "draft_content", success: false, output: "Database not connected." };
  }

  const {
    title,
    type,
    content,
    destination,
    previewOnly = true,
  } = args as {
    title: string;
    type: string;
    content: string;
    destination: string;
    previewOnly?: boolean;
  };

  // Map lowercase type to Prisma enum (EMAIL_SCRIPT etc.)
  const typeMap: Record<string, string> = {
    email_script: "EMAIL_SCRIPT",
    ad_copy: "AD_COPY",
    social_post_draft: "SOCIAL_POST_DRAFT",
    landing_page_copy: "LANDING_PAGE_COPY",
    product_description: "PRODUCT_DESCRIPTION",
    offer_presentation: "OFFER_PRESENTATION",
    sales_script: "SALES_SCRIPT",
    content_calendar: "CONTENT_CALENDAR",
    cold_dm_script: "COLD_DM_SCRIPT",
  };
  const prismaType = (typeMap[type] ?? "EMAIL_SCRIPT") as never;

  const item = await prisma.previewItem.create({
    data: {
      agentId,
      title,
      type: prismaType,
      content,
      destination,
      previewOnly,
      holdRequested: false,
    },
  });

  // Slack draft previews are disabled — only HIGH/CRITICAL approvals notify Slack.

  return {
    toolName: "draft_content",
    success: true,
    output: `Draft saved (ID: ${item.id}). Title: "${title}" (${type}). Destination: ${destination}. It is now in the human review queue — nothing has been sent. A Slack preview has been posted for your review. Write a memory note if you want to track this draft.`,
  };
}

async function execLogRevenue(agentId: string, args: ToolCallArgs): Promise<ToolResult> {
  const {
    amount,
    source,
    description,
    stripeFee = 0,
    businessId,
  } = args as {
    amount: number;
    source: string;
    description: string;
    stripeFee?: number;
    businessId?: string;
  };

  try {
    const event = await logRevenue({
      agentId,
      amount,
      source,
      description,
      stripeFee,
      businessId,
    });

    return {
      toolName: "log_revenue",
      success: true,
      output: `Revenue logged: $${amount.toFixed(2)} from ${source}. Description: "${description}". Stripe fee: $${stripeFee.toFixed(2)}. Event ID: ${event.id}. World state updated.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { toolName: "log_revenue", success: false, output: `Failed to log revenue: ${message}` };
  }
}

async function execLogExpense(agentId: string, args: ToolCallArgs): Promise<ToolResult> {
  const {
    amount,
    category,
    description,
    vendorName,
    businessId,
  } = args as {
    amount: number;
    category: string;
    description: string;
    vendorName?: string;
    businessId?: string;
  };

  try {
    const event = await logExpense({
      agentId,
      amount,
      category,
      description,
      vendorName,
      businessId,
    });

    return {
      toolName: "log_expense",
      success: true,
      output: `Expense logged: $${amount.toFixed(2)} (${category}). Description: "${description}". Vendor: ${vendorName ?? "N/A"}. Event ID: ${event.id}.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { toolName: "log_expense", success: false, output: `Failed to log expense: ${message}` };
  }
}

async function execWriteMemory(agentId: string, args: ToolCallArgs): Promise<ToolResult> {
  const {
    type,
    content,
    relevance = 50,
  } = args as {
    type: "observation" | "decision" | "learning" | "goal";
    content: string;
    relevance?: number;
  };

  try {
    const memory = await writeMemory(agentId, { type, content, relevance });
    if (!memory) throw new Error("writeMemory returned null");
    return {
      toolName: "write_memory",
      success: true,
      output: `Memory saved (ID: ${memory.id}). Type: ${type}. Relevance: ${relevance}/100. Content: "${content.slice(0, 100)}${content.length > 100 ? "…" : ""}"`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { toolName: "write_memory", success: false, output: `Failed to write memory: ${message}` };
  }
}

async function execPostSocialMedia(agentId: string, args: ToolCallArgs): Promise<ToolResult> {
  const { platform, content, purpose, riskLevel = "medium" } = args as {
    platform: string;
    content: string;
    purpose: string;
    riskLevel?: string;
  };

  const normalizedRisk = riskLevel.toLowerCase();

  // HIGH risk → route through approval inbox
  if (normalizedRisk === "high" || normalizedRisk === "critical") {
    return execRequestApproval(agentId, {
      actionType: "publish_social_post",
      title: `Post on ${platform}: ${content.slice(0, 60)}${content.length > 60 ? "…" : ""}`,
      summary: purpose,
      proposedAction: `Post to ${platform}: "${content}"`,
      reason: purpose,
      riskLevel,
      expectedUpside: "Brand visibility and audience engagement",
      downside: "Public-facing content — cannot be unposted easily",
      exactExecution: JSON.stringify({ content, platform }),
    });
  }

  // LOW/MEDIUM → post directly
  const result = await postToTwitter({ content });

  // Log it
  const prisma = getPrismaClient();
  if (prisma) {
    await prisma.approvalRequest.create({
      data: {
        agentId,
        actionType: "publish_social_post",
        title: `${platform} post: ${content.slice(0, 80)}`,
        summary: purpose,
        proposedAction: `Posted to ${platform}`,
        reason: purpose,
        riskLevel: normalizedRisk === "low" ? "LOW" : "MEDIUM",
        expectedUpside: "Brand visibility",
        downside: "None for informational content",
        exactExecution: JSON.stringify({ content, platform }),
        requiresApproval: false,
        previewOnly: false,
        status: result.ok ? "EXECUTED" : "REJECTED",
        executedAt: result.ok ? new Date() : undefined,
      },
    }).catch(() => null);
  }

  return {
    toolName: "post_social_media",
    success: result.ok,
    output: result.ok
      ? `Posted to ${platform}: "${content.slice(0, 80)}${content.length > 80 ? "…" : ""}". ${result.message}`
      : `Failed to post to ${platform}: ${result.message}`,
  };
}

async function execDeployWebsite(agentId: string, args: ToolCallArgs): Promise<ToolResult> {
  const { siteName, htmlContent, purpose, estimatedRevenueImpact = "" } = args as {
    siteName: string;
    htmlContent: string;
    purpose: string;
    estimatedRevenueImpact?: string;
  };

  // Website deploys always require human approval — they're public-facing and irreversible
  return execRequestApproval(agentId, {
    actionType: "publish_website",
    title: `Deploy website: ${siteName}`,
    summary: purpose,
    proposedAction: `Deploy "${siteName}" to Vercel as a live public website`,
    reason: purpose,
    riskLevel: "high",
    expectedUpside: estimatedRevenueImpact || "Drive traffic and conversions for the business",
    downside: "Publicly visible — represents the brand. Cannot be easily unpublished.",
    exactExecution: JSON.stringify({ name: siteName, html: htmlContent }),
  });
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

export async function executeTool(
  agentId: string,
  toolName: string,
  args: ToolCallArgs
): Promise<ToolResult> {
  switch (toolName) {
    case "request_approval":
      return execRequestApproval(agentId, args);
    case "search_web":
      return execSearchWeb(args);
    case "draft_content":
      return execDraftContent(agentId, args);
    case "log_revenue":
      return execLogRevenue(agentId, args);
    case "log_expense":
      return execLogExpense(agentId, args);
    case "write_memory":
      return execWriteMemory(agentId, args);
    case "post_social_media":
      return execPostSocialMedia(agentId, args);
    case "deploy_website":
      return execDeployWebsite(agentId, args);
    default:
      return {
        toolName,
        success: false,
        output: `Unknown tool: "${toolName}". Available: request_approval, search_web, draft_content, log_revenue, log_expense, write_memory.`,
      };
  }
}
