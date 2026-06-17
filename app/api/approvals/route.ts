import { NextResponse } from "next/server";
import { getPrismaClient } from "@/app/lib/prisma";
import { executeSandboxAction, sendSlackApprovalMessage, sendSlackExecutedMessage } from "@/app/lib/integrations";
import type { ApprovalStatus } from "@/app/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const prisma = getPrismaClient();
  if (!prisma) {
    return NextResponse.json({ approvals: [], previewItems: [], error: "Database not connected." }, { status: 424 });
  }

  const [approvals, previewItems] = await Promise.all([
    prisma.approvalRequest.findMany({
      orderBy: { requestedAt: "desc" },
      take: 100,
      include: { agent: { select: { id: true, name: true, role: true } } },
    }),
    prisma.previewItem.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { agent: { select: { id: true, name: true, role: true } } },
    }),
  ]);

  return NextResponse.json({ approvals, previewItems });
}

export async function POST(request: Request) {
  const prisma = getPrismaClient();
  if (!prisma) {
    return NextResponse.json({ error: "Database not connected." }, { status: 424 });
  }

  const body = (await request.json()) as { approvalId: string; decision: ApprovalStatus };

  const approval = await prisma.approvalRequest.findUnique({
    where: { id: body.approvalId },
    include: { agent: { select: { id: true, name: true } } },
  });

  if (!approval) {
    return NextResponse.json({ error: "Approval request not found." }, { status: 404 });
  }

  const approvalShape = {
    ...approval,
    agentName: approval.agent?.name ?? "Unknown Agent",
    riskLevel: approval.riskLevel.toLowerCase() as "low" | "medium" | "high" | "critical",
    status: approval.status.toLowerCase() as ApprovalStatus,
    actionType: approval.actionType as never,
    channel: "slack" as const,
    previewLink: approval.previewLink ?? undefined,
    contentPreview: approval.contentPreview ?? undefined,
    slackTs: approval.slackTs ?? undefined,
    slackChannelId: approval.slackChannelId ?? undefined,
    executedAt: approval.executedAt?.toISOString() ?? undefined,
  };

  if (body.decision === "approved") {
    const result = await executeSandboxAction({ ...approvalShape, status: "approved" });
    const updated = await prisma.approvalRequest.update({
      where: { id: body.approvalId },
      data: { status: "EXECUTED", executedAt: new Date() },
    });
    const confirmation = await sendSlackExecutedMessage(approvalShape, result);
    return NextResponse.json({ approval: updated, result, confirmation });
  }

  if (body.decision === "modification_requested") {
    const updated = await prisma.approvalRequest.update({
      where: { id: body.approvalId },
      data: { status: "MODIFICATION_REQUESTED" },
    });
    return NextResponse.json({
      approval: updated,
      result: { ok: true, mode: "sandbox", message: "Action paused. Agent needs human changes before retrying." },
    });
  }

  const updated = await prisma.approvalRequest.update({
    where: { id: body.approvalId },
    data: { status: "REJECTED", resolvedAt: new Date() },
  });
  return NextResponse.json({
    approval: updated,
    result: { ok: true, mode: "sandbox", message: "Action rejected and logged." },
  });
}

export async function PUT(request: Request) {
  const prisma = getPrismaClient();
  if (!prisma) {
    return NextResponse.json({ error: "Database not connected." }, { status: 424 });
  }

  const body = (await request.json()) as { approvalId: string };

  const approval = await prisma.approvalRequest.findUnique({
    where: { id: body.approvalId },
    include: { agent: { select: { name: true } } },
  });

  if (!approval) {
    return NextResponse.json({ error: "Approval request not found." }, { status: 404 });
  }

  const approvalShape = {
    ...approval,
    agentName: approval.agent?.name ?? "Unknown Agent",
    riskLevel: approval.riskLevel.toLowerCase() as "low" | "medium" | "high" | "critical",
    status: approval.status.toLowerCase() as ApprovalStatus,
    actionType: approval.actionType as never,
    channel: "slack" as const,
    previewLink: approval.previewLink ?? undefined,
    contentPreview: approval.contentPreview ?? undefined,
    slackTs: approval.slackTs ?? undefined,
    slackChannelId: approval.slackChannelId ?? undefined,
    executedAt: approval.executedAt?.toISOString() ?? undefined,
  };

  const result = await sendSlackApprovalMessage(approvalShape);

  if (result.ok && result.slackTs) {
    const updated = await prisma.approvalRequest.update({
      where: { id: body.approvalId },
      data: { slackTs: result.slackTs, slackChannelId: result.slackChannelId },
    });
    return NextResponse.json({ approval: updated, result });
  }

  return NextResponse.json({ approval, result });
}
