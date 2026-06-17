import { NextResponse } from "next/server";
import { getAgentWorldConfig } from "@/app/lib/config";
import { getPrismaClient } from "@/app/lib/prisma";
import { executeSandboxAction, sendSlackExecutedMessage } from "@/app/lib/integrations";
import type { ApprovalStatus } from "@/app/lib/types";

export const dynamic = "force-dynamic";

function decisionFromAction(actionId: string): ApprovalStatus | "hold" | null {
  if (actionId === "approval_yes") return "approved";
  if (actionId === "approval_no") return "rejected";
  if (actionId === "approval_modify") return "modification_requested";
  if (actionId === "preview_hold") return "hold";
  return null;
}

function decisionFromText(text: string | undefined): Exclude<ApprovalStatus, "pending" | "executed"> | "approved" | null {
  const normalized = text?.trim().toUpperCase() ?? "";

  if (/^(YES|Y)\b/.test(normalized)) return "approved";
  if (/^(NO|N)\b/.test(normalized)) return "rejected";
  if (/^MODIFY\b/.test(normalized)) return "modification_requested";

  return null;
}

function commandFromText(text: string | undefined) {
  const normalized = text?.trim().toUpperCase() ?? "";
  if (normalized === "STATUS") return "STATUS";
  if (normalized === "RUN DAILY") return "RUN_DAILY";
  if (normalized === "RUN AGENTS") return "RUN_AGENTS";
  if (normalized === "STOP AGENTS") return "STOP_AGENTS";
  if (normalized === "PAUSE") return "PAUSE";
  if (normalized === "REVISE") return "REVISE";
  return null;
}

function handleCommand(command: ReturnType<typeof commandFromText>, pendingCount = 0) {
  const config = getAgentWorldConfig();

  if (command === "STATUS") {
    return {
      command,
      message: `Agent World status: ${config.runtimeMode}. Pending approvals: ${pendingCount}. Real actions: ${config.allowRealWorldActions ? "enabled" : "blocked"}. Human approval: ${config.requireHumanApproval ? "required" : "not required"}.`,
    };
  }

  if (command === "RUN_DAILY" || command === "RUN_AGENTS") {
    return {
      command,
      message: "Agent run command received. Agent execution remains supervised; real-world actions still require approval records."
    };
  }

  if (command === "STOP_AGENTS" || command === "PAUSE") {
    return {
      command,
      message: "Agent pause command received. New autonomous runs should be paused until resumed."
    };
  }

  if (command === "REVISE") {
    return {
      command,
      message: "Revision command received. The current approval should be treated as needing modification."
    };
  }

  return null;
}

function isRealSlackTs(ts: string | undefined | null) {
  return Boolean(ts && /^\d+\.\d+$/.test(ts));
}

async function findCurrentApprovalForReply(input: { channel?: string; eventTs?: string; threadTs?: string }) {
  const prisma = getPrismaClient();
  if (!prisma) return null;

  const eventTime = Number(input.eventTs);
  const approvals = await prisma.approvalRequest.findMany({
    where: { status: "PENDING" },
    include: { agent: { select: { name: true } } },
  });

  const valid = approvals.filter((a) => isRealSlackTs(a.slackTs));

  if (input.threadTs) {
    return valid.find((a) => a.slackChannelId === input.channel && a.slackTs === input.threadTs) ?? null;
  }

  const earlier = valid
    .filter((a) => a.slackChannelId === input.channel && Number(a.slackTs) < eventTime)
    .sort((a, b) => Number(b.slackTs) - Number(a.slackTs));

  return earlier[0] ?? null;
}

type DbApproval = Awaited<ReturnType<typeof findCurrentApprovalForReply>>;

async function applyDecision(approval: NonNullable<DbApproval>, decision: ApprovalStatus | "approved") {
  const prisma = getPrismaClient();
  if (!prisma) return null;

  const approvalShape = {
    ...approval,
    agentName: approval.agent?.name ?? "Unknown Agent",
    riskLevel: approval.riskLevel.toLowerCase() as "low" | "medium" | "high" | "critical",
    status: "approved" as ApprovalStatus,
    actionType: approval.actionType as never,
    channel: "slack" as const,
    previewLink: approval.previewLink ?? undefined,
    contentPreview: approval.contentPreview ?? undefined,
    slackTs: approval.slackTs ?? undefined,
    slackChannelId: approval.slackChannelId ?? undefined,
    executedAt: approval.executedAt?.toISOString() ?? undefined,
  };

  if (decision === "approved") {
    const result = await executeSandboxAction(approvalShape);
    const updated = await prisma.approvalRequest.update({
      where: { id: approval.id },
      data: { status: "EXECUTED", executedAt: new Date() },
    });
    const confirmation = await sendSlackExecutedMessage(approvalShape, result);
    return { approval: updated, decision, result, confirmation };
  }

  const prismaStatus = decision === "rejected" ? "REJECTED" : "MODIFICATION_REQUESTED";
  const updated = await prisma.approvalRequest.update({
    where: { id: approval.id },
    data: { status: prismaStatus, resolvedAt: new Date() },
  });
  return {
    approval: updated,
    decision,
    result: {
      ok: true,
      mode: "sandbox",
      message: decision === "rejected" ? "Slack reply rejected the action." : "Slack reply requested modification before execution.",
    },
  };
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    const slashText = String(form.get("text") ?? "").trim();
    const slashCommand = commandFromText(slashText);
    if (slashCommand) {
      const prisma = getPrismaClient();
      const pendingCount = prisma ? await prisma.approvalRequest.count({ where: { status: "PENDING" } }) : 0;
      return NextResponse.json({ ok: true, source: "slack_command", ...handleCommand(slashCommand, pendingCount) });
    }

    const payloadRaw = String(form.get("payload") ?? "{}");
    const payload = JSON.parse(payloadRaw) as { actions?: Array<{ action_id: string }>; channel?: { id: string }; message?: { ts: string } };
    const decision = decisionFromAction(payload.actions?.[0]?.action_id ?? "");

    if (decision === "approved" || decision === "rejected" || decision === "modification_requested") {
      const approval = await findCurrentApprovalForReply({
        channel: payload.channel?.id,
        eventTs: payload.message?.ts,
        threadTs: payload.message?.ts,
      });

      if (approval) {
        const result = await applyDecision(approval, decision);
        return NextResponse.json({ ok: true, source: "slack_interaction", ...result });
      }
    }

    return NextResponse.json({
      ok: true,
      decision,
      slackChannelId: payload.channel?.id,
      slackTs: payload.message?.ts,
      note: "Webhook stub received the Slack interaction. Persist the matching ApprovalRequest or PreviewItem status here."
    });
  }

  let body: {
    type?: string;
    challenge?: string;
    event?: { text?: string; channel?: string; ts?: string; thread_ts?: string; bot_id?: string; subtype?: string };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true, ignored: "invalid_json" });
  }

  if (body.type === "url_verification" && body.challenge) {
    return NextResponse.json({ challenge: body.challenge });
  }

  const holdRequested = body.event?.text?.trim().toUpperCase() === "HOLD";
  const decision = decisionFromText(body.event?.text);
  const command = commandFromText(body.event?.text);

  if (body.event?.bot_id || body.event?.subtype === "bot_message") {
    return NextResponse.json({ ok: true, ignored: "bot_message" });
  }

  if (decision) {
    const approval = await findCurrentApprovalForReply({
      channel: body.event?.channel,
      eventTs: body.event?.ts,
      threadTs: body.event?.thread_ts,
    });

    if (approval) {
      const result = await applyDecision(approval, decision);
      return NextResponse.json({
        ok: true,
        source: "slack_event",
        slackChannelId: body.event?.channel,
        slackTs: body.event?.ts,
        ...result
      });
    }
  }

  if (command) {
    return NextResponse.json({
      ok: true,
      source: "slack_event_command",
      slackChannelId: body.event?.channel,
      slackTs: body.event?.ts,
      ...handleCommand(command)
    });
  }

  return NextResponse.json({
    ok: true,
    type: body.type,
    decision,
    command,
    holdRequested,
    slackChannelId: body.event?.channel,
    slackTs: body.event?.ts
  });
}
