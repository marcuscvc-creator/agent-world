import { NextResponse } from "next/server";
import { getPrismaClient } from "@/app/lib/prisma";
import { executeSandboxAction, sendSlackExecutedMessage } from "@/app/lib/integrations";
import type { ApprovalStatus } from "@/app/lib/types";

type SlackMessage = {
  ts: string;
  text?: string;
  type?: string;
  user?: string;
  bot_id?: string;
  thread_ts?: string;
};

function getSlackReadConfig() {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID ?? process.env.SLACK_APPROVAL_CHANNEL_ID;

  if (!token || !channel) {
    return {
      ok: false as const,
      message: "Slack reply sync requires SLACK_BOT_TOKEN and SLACK_CHANNEL_ID. Incoming webhook mode can send messages but cannot read replies."
    };
  }

  if (channel.startsWith("#")) {
    return {
      ok: false as const,
      message: "SLACK_CHANNEL_ID must be a Slack channel ID such as C0B9UN9V92B, not a #channel name."
    };
  }

  return { ok: true as const, token, channel };
}

function decisionFromText(text: string | undefined): Exclude<ApprovalStatus, "pending" | "executed"> | "approved" | null {
  const normalized = text?.trim().toUpperCase() ?? "";

  if (/^(YES|Y)\b/.test(normalized)) return "approved";
  if (/^(NO|N)\b/.test(normalized)) return "rejected";
  if (/^MODIFY\b/.test(normalized)) return "modification_requested";

  return null;
}

function messageMatchesApproval(message: SlackMessage, approval: { slackTs?: string | null; proposedAction: string; agent?: { name: string } | null }) {
  const text = message.text ?? "";
  const agentName = approval.agent?.name ?? "";
  return text.includes("APPROVAL REQUIRED") && text.includes(`Agent:* ${agentName}`) && text.includes(approval.proposedAction);
}

function isRealSlackTs(ts: string | undefined) {
  return Boolean(ts && /^\d+\.\d+$/.test(ts));
}

function isApprovalMessage(message: SlackMessage) {
  return (message.text ?? "").includes("APPROVAL REQUIRED");
}

async function slackApi<T>(path: string, token: string, params: Record<string, string>) {
  const url = new URL(`https://slack.com/api/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });

  const json = (await response.json()) as T & { ok: boolean; error?: string };
  if (!json.ok) throw new Error(json.error ?? `Slack API call failed: ${path}`);

  return json;
}

async function fetchThreadMessages(token: string, channel: string, ts: string) {
  const data = await slackApi<{ messages: SlackMessage[] }>("conversations.replies", token, { channel, ts, limit: "50" });
  return data.messages ?? [];
}

type DbApproval = {
  id: string;
  status: string;
  slackTs: string | null;
  proposedAction: string;
  reason: string;
  riskLevel: string;
  actionType: string;
  requiresApproval: boolean;
  previewOnly: boolean;
  expectedUpside: string;
  downside: string;
  exactExecution: string;
  agentId: string;
  agent: { name: string } | null;
};

async function syncApprovalFromSlack(approval: DbApproval, messages: SlackMessage[], token: string, channel: string) {
  if (approval.status !== "PENDING") return null;
  if (!isRealSlackTs(approval.slackTs ?? undefined)) return null;

  const prisma = getPrismaClient();
  if (!prisma) return null;

  const approvalMessage = messages.find((message) => message.ts === approval.slackTs && messageMatchesApproval(message, approval));
  if (!approvalMessage) return null;

  const nextApprovalMessage = messages.find((message) => Number(message.ts) > Number(approvalMessage.ts) && isApprovalMessage(message));
  const upperBound = nextApprovalMessage ? Number(nextApprovalMessage.ts) : Number.POSITIVE_INFINITY;
  const afterApproval = messages.filter((message) => Number(message.ts) > Number(approvalMessage.ts) && Number(message.ts) < upperBound);
  let decisionMessage = afterApproval.find((message) => !message.bot_id && decisionFromText(message.text));

  if (!decisionMessage) {
    const threadMessages = await fetchThreadMessages(token, channel, approvalMessage.ts);
    decisionMessage = threadMessages.find((message) => Number(message.ts) > Number(approvalMessage.ts) && !message.bot_id && decisionFromText(message.text));
  }

  const decision = decisionFromText(decisionMessage?.text);
  if (!decision || !decisionMessage) return null;

  const approvalShape = {
    ...approval,
    agentName: approval.agent?.name ?? "Unknown Agent",
    riskLevel: approval.riskLevel.toLowerCase() as "low" | "medium" | "high" | "critical",
    status: "approved" as ApprovalStatus,
    actionType: approval.actionType as never,
    channel: "slack" as const,
    slackTs: approval.slackTs ?? undefined,
    previewLink: undefined,
    contentPreview: undefined,
    slackChannelId: undefined,
    executedAt: undefined,
  };

  if (decision === "approved") {
    const result = await executeSandboxAction(approvalShape);
    const updated = await prisma.approvalRequest.update({
      where: { id: approval.id },
      data: { status: "EXECUTED", executedAt: new Date() },
    });
    const confirmation = await sendSlackExecutedMessage(approvalShape, result);
    return { approval: updated, decision, slackTs: decisionMessage.ts, result, confirmation };
  }

  const prismaStatus = decision === "rejected" ? "REJECTED" : "MODIFICATION_REQUESTED";
  const updated = await prisma.approvalRequest.update({
    where: { id: approval.id },
    data: { status: prismaStatus, resolvedAt: new Date() },
  });
  return {
    approval: updated,
    decision,
    slackTs: decisionMessage.ts,
    result: {
      ok: true,
      mode: "sandbox",
      message: decision === "rejected" ? "Slack reply rejected the action." : "Slack reply requested modification before execution.",
    },
  };
}

export async function POST() {
  const config = getSlackReadConfig();
  if (!config.ok) {
    return NextResponse.json({ ok: false, message: config.message }, { status: 424 });
  }

  const prisma = getPrismaClient();
  if (!prisma) {
    return NextResponse.json({ ok: false, message: "Database not connected." }, { status: 424 });
  }

  try {
    const data = await slackApi<{ messages: SlackMessage[] }>("conversations.history", config.token, {
      channel: config.channel,
      limit: "100",
    });

    const messages = [...(data.messages ?? [])].sort((a, b) => Number(a.ts) - Number(b.ts));
    const pendingApprovals = await prisma.approvalRequest.findMany({
      where: { status: "PENDING" },
      include: { agent: { select: { name: true } } },
    });

    const synced = [];
    for (const approval of pendingApprovals) {
      const result = await syncApprovalFromSlack(approval, messages, config.token, config.channel);
      if (result) synced.push(result);
    }

    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      channelId: config.channel,
      syncedCount: synced.length,
      synced,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, message: "Slack reply sync failed.", error: message }, { status: 424 });
  }
}
