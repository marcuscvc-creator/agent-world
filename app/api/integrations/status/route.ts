import { NextResponse } from "next/server";
import { getAgentWorldConfig } from "@/app/lib/config";
import { getPrismaClient } from "@/app/lib/prisma";
import { getExecutionMode, getIntegrationConnections } from "@/app/lib/integrations";

export async function GET() {
  const config = getAgentWorldConfig();
  const integrations = getIntegrationConnections();
  const slack = integrations.find((item) => item.provider === "slack");
  const prisma = getPrismaClient();

  const [capital, spendingRequests, externalActionLogs] = prisma
    ? await Promise.all([
        prisma.capitalAccount.findFirst({ where: { id: "capital-singleton" } }),
        prisma.spendingRequest.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
        prisma.externalActionLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
      ])
    : [null, [], []];

  return NextResponse.json({
    executionMode: getExecutionMode(),
    guardrails: {
      allowRealWorldActions: config.allowRealWorldActions,
      requireHumanApproval: config.requireHumanApproval,
      allowWebSearch: config.allowWebSearch,
      requireApprovalForWebSearch: config.requireApprovalForWebSearch,
      openaiMonthlyBudget: config.openaiMonthlyBudget,
      maxAgentRunsPerDay: config.maxAgentRunsPerDay,
      maxWebSearchesPerDay: config.maxWebSearchesPerDay,
      maxDailySpendWithoutApproval: config.maxDailySpendWithoutApproval,
    },
    integrations,
    slackBlocking: {
      ok: slack?.status !== "not_connected",
      message:
        slack?.status === "not_connected"
          ? "Slack is not connected. Agents cannot send approvals or previews until Slack is working."
          : "Slack is configured but still needs a delivery test.",
      diagnostics:
        slack?.status === "not_connected"
          ? ["Missing SLACK_WEBHOOK_URL or SLACK_BOT_TOKEN plus SLACK_CHANNEL_ID.", "Approval workflows are disabled until Slack passes a test."]
          : ["Run Send Test Slack Message to verify delivery."],
    },
    capital,
    spendingRequests,
    externalActionLogs,
  });
}
