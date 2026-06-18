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
    include: { agent: { select: { id: true, name: true, currentTask: true } } },
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

    // ── Business identity update: write to DB and advance world stage ──────────
    if (approval.actionType === "update_business_identity" && result.ok) {
      try {
        let params: Record<string, string> = {};
        try { params = JSON.parse(approval.exactExecution ?? "{}") as Record<string, string>; } catch { /* ignore */ }
        const { field, value } = params;

        if (field && value !== undefined) {
          const majorFields = ["name", "missionStatement", "revenueModel"];
          const isNameSet = field === "name";

          // Upsert the specific field
          const updateData: Record<string, unknown> = { [field]: value };
          if (majorFields.includes(field)) {
            updateData.approvedByHuman = true;
            if (isNameSet) updateData.establishedAt = new Date();
          }

          await (prisma as any).businessIdentity.upsert({
            where: { id: "biz-identity" },
            create: { id: "biz-identity", ...updateData },
            update: updateData,
          });

          // Mirror to shared strategic memory
          await (prisma as any).sharedStrategicMemory.upsert({
            where: { key: `identity_${field}` },
            create: { key: `identity_${field}`, value, updatedBy: "human-approval", version: 1 },
            update: { value, updatedBy: "human-approval", version: { increment: 1 } },
          }).catch(() => null);

          // Advance world stage to BUSINESS_CHOSEN when name is approved
          if (isNameSet) {
            await (prisma as any).worldState.update({
              where: { id: "world-singleton" },
              data: { businessStage: "BUSINESS_CHOSEN" },
            }).catch(() => null);
          }
        }
      } catch (err) {
        console.error("[approvals] Failed to persist business identity update:", err);
        // Non-fatal — approval is still marked EXECUTED
      }
    }

    const updated = await prisma.approvalRequest.update({
      where: { id: body.approvalId },
      data: { status: "EXECUTED", executedAt: new Date() },
    });
    // PAUSED agents go back to BLOCKED after execution; others go to IDLE
    const isPausedAgent = (approval.agent as unknown as { currentTask?: string })?.currentTask?.startsWith("PAUSED:") ?? false;
    await prisma.agent.update({
      where: { id: approval.agentId },
      data: { status: isPausedAgent ? "BLOCKED" : "IDLE" },
    }).catch(() => null);
    const confirmation = await sendSlackExecutedMessage(approvalShape, result);
    return NextResponse.json({ approval: updated, result, confirmation });
  }

  if (body.decision === "modification_requested") {
    const updated = await prisma.approvalRequest.update({
      where: { id: body.approvalId },
      data: { status: "MODIFICATION_REQUESTED" },
    });
    // PAUSED agents go back to BLOCKED; others go to IDLE to retry with modification feedback
    const isPausedMod = (approval.agent as unknown as { currentTask?: string })?.currentTask?.startsWith("PAUSED:") ?? false;
    await prisma.agent.update({
      where: { id: approval.agentId },
      data: { status: isPausedMod ? "BLOCKED" : "IDLE" },
    }).catch(() => null);
    return NextResponse.json({
      approval: updated,
      result: { ok: true, mode: "sandbox", message: "Action paused. Agent needs human changes before retrying." },
    });
  }

  const updated = await prisma.approvalRequest.update({
    where: { id: body.approvalId },
    data: { status: "REJECTED", resolvedAt: new Date() },
  });
  // PAUSED agents go back to BLOCKED on rejection so they can't re-run
  const isPausedReject = (approval.agent as unknown as { currentTask?: string })?.currentTask?.startsWith("PAUSED:") ?? false;
  await prisma.agent.update({
    where: { id: approval.agentId },
    data: { status: isPausedReject ? "BLOCKED" : "IDLE" },
  }).catch(() => null);
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
