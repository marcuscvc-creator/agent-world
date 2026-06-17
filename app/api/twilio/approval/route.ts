/**
 * POST /api/twilio/approval
 *
 * Receives SMS replies from Twilio and maps them to approval decisions.
 * Twilio sends a form-encoded POST when someone texts the number.
 *
 * To enable:
 *   1. Get a Twilio number at https://twilio.com
 *   2. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in .env.local
 *   3. Point the Twilio number's "Messaging" webhook to:
 *      https://your-domain.com/api/twilio/approval
 *
 * Supported reply texts (case-insensitive):
 *   YES / APPROVE  → approve the most recent pending approval
 *   NO / REJECT    → reject the most recent pending approval
 *   MODIFY         → request modification
 *   STATUS         → get count of pending approvals
 */

import { NextResponse } from "next/server";
import { getPrismaClient } from "@/app/lib/prisma";

export const dynamic = "force-dynamic";

function parseDecision(body: string): "approved" | "rejected" | "modification_requested" | "status" | null {
  const t = body.trim().toUpperCase();
  if (t === "YES" || t === "APPROVE") return "approved";
  if (t === "NO" || t === "REJECT") return "rejected";
  if (t === "MODIFY") return "modification_requested";
  if (t === "STATUS") return "status";
  return null;
}

function twimlResponse(message: string): Response {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`,
    { headers: { "Content-Type": "text/xml" } }
  );
}

export async function POST(request: Request) {
  // Only enabled if Twilio creds are set
  if (!process.env.TWILIO_ACCOUNT_SID) {
    return NextResponse.json({ error: "Twilio not configured." }, { status: 503 });
  }

  const formData = await request.formData();
  const body = formData.get("Body")?.toString() ?? "";
  const from = formData.get("From")?.toString() ?? "unknown";

  const decision = parseDecision(body);
  if (!decision) {
    return twimlResponse("Unknown command. Reply YES, NO, MODIFY, or STATUS.");
  }

  const prisma = getPrismaClient();
  if (!prisma) {
    return twimlResponse("Database not connected. Cannot process approval.");
  }

  if (decision === "status") {
    const count = await prisma.approvalRequest.count({ where: { status: "PENDING" } });
    return twimlResponse(`Agent World: ${count} approval(s) pending.`);
  }

  // Find the oldest pending approval to action
  const approval = await prisma.approvalRequest.findFirst({
    where: { status: "PENDING" },
    orderBy: { requestedAt: "asc" },
  });

  if (!approval) {
    return twimlResponse("No pending approvals right now.");
  }

  const prismaStatus =
    decision === "approved"
      ? "EXECUTED"
      : decision === "rejected"
        ? "REJECTED"
        : "MODIFICATION_REQUESTED";

  await prisma.approvalRequest.update({
    where: { id: approval.id },
    data: {
      status: prismaStatus,
      resolvedAt: new Date(),
    },
  });

  await prisma.agentLog.create({
    data: {
      agentId: approval.agentId,
      message: `Approval ${decision} via SMS from ${from}`,
      rationale: `Twilio SMS decision on approval ${approval.id}`,
      toolUsed: "twilio_sms",
      result: decision,
      approvalNeeded: false,
    },
  }).catch(() => null);

  const reply =
    decision === "approved"
      ? `✅ Approved: "${approval.title ?? approval.proposedAction}". Agent will execute.`
      : decision === "rejected"
        ? `❌ Rejected: "${approval.title ?? approval.proposedAction}". Action blocked.`
        : `✏️ Modification requested on: "${approval.title ?? approval.proposedAction}".`;

  return twimlResponse(reply);
}
