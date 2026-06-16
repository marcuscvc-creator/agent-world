import { NextResponse } from "next/server";
import { getAgentWorldConfig } from "@/app/lib/config";
import { getExecutionMode, getIntegrationConnections, getStripeMode } from "@/app/lib/integrations";

export async function GET() {
  const config = getAgentWorldConfig();
  const integrations = getIntegrationConnections();
  const required = ["slack", "database", "openai"];
  const missing = integrations
    .filter((integration) => required.includes(integration.provider))
    .filter((integration) => integration.status === "not_connected")
    .map((integration) => integration.provider);

  return NextResponse.json({
    ok: missing.length === 0,
    app: "agent-world",
    executionMode: getExecutionMode(),
    stripeMode: getStripeMode(),
    guardrails: {
      allowRealWorldActions: config.allowRealWorldActions,
      requireHumanApproval: config.requireHumanApproval,
      allowWebSearch: config.allowWebSearch,
      requireApprovalForWebSearch: config.requireApprovalForWebSearch,
      openaiMonthlyBudget: config.openaiMonthlyBudget,
      maxAgentRunsPerDay: config.maxAgentRunsPerDay,
      maxWebSearchesPerDay: config.maxWebSearchesPerDay,
      maxDailySpendWithoutApproval: config.maxDailySpendWithoutApproval
    },
    missing,
    checkedAt: new Date().toISOString()
  }, { status: missing.length === 0 ? 200 : 424 });
}
