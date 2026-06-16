import { getAgentWorldConfig, isRealWorldAction, type IntegrationKey } from "./config";
import type { AgentActionType, ApprovalRequest, RiskLevel } from "./types";

export type ExecutionDecision = {
  allowed: boolean;
  mode: "demo" | "local" | "supervised_live" | "production";
  reasons: string[];
};

type ExecutionCheckInput = {
  actionType: AgentActionType | string;
  riskLevel: RiskLevel;
  requiredIntegration?: IntegrationKey;
  approval?: Pick<ApprovalRequest, "id" | "status" | "requestedAt" | "executedAt"> & { requestedAt?: string | Date; executedAt?: string | Date };
  spendingAmount?: number;
  target?: string;
  irreversible?: boolean;
};

const APPROVAL_TTL_MS = 1000 * 60 * 60 * 24;

function approvalExpired(approval: ExecutionCheckInput["approval"]) {
  if (!approval?.requestedAt) return false;
  const requestedAt = new Date(approval.requestedAt).getTime();
  if (!Number.isFinite(requestedAt)) return false;
  return Date.now() - requestedAt > APPROVAL_TTL_MS;
}

export function checkExecutionAllowed(input: ExecutionCheckInput): ExecutionDecision {
  const config = getAgentWorldConfig();
  const reasons: string[] = [];
  const isLiveImpact = isRealWorldAction(input.actionType) || input.irreversible || (input.spendingAmount ?? 0) > 0;

  if (config.runtimeMode === "demo") {
    reasons.push("Demo mode cannot execute real-world actions.");
  }

  if (isLiveImpact && !config.allowRealWorldActions) {
    reasons.push("ALLOW_REAL_WORLD_ACTIONS is not enabled.");
  }

  if (input.requiredIntegration && !config.integrations[input.requiredIntegration].configured) {
    reasons.push(`${input.requiredIntegration} credentials are missing.`);
  }

  if ((input.spendingAmount ?? 0) > config.maxDailySpendWithoutApproval && input.approval?.status !== "approved") {
    reasons.push("Spending requires approval because MAX_DAILY_SPEND_WITHOUT_APPROVAL is 0.");
  }

  if (config.requireHumanApproval && isLiveImpact) {
    if (!input.approval) reasons.push("Approval record is required.");
    if (input.approval && input.approval.status !== "approved") reasons.push(`Approval status must be approved; current status is ${input.approval.status}.`);
    if (input.approval?.executedAt) reasons.push("Approval has already been executed.");
    if (approvalExpired(input.approval)) reasons.push("Approval is expired.");
  }

  if (config.stripeMode === "live" && input.requiredIntegration === "stripe") {
    const hasLiveKeys = config.integrations.stripe.configured;
    if (!hasLiveKeys) reasons.push("Stripe live mode requires STRIPE_LIVE_SECRET_KEY and STRIPE_LIVE_PUBLISHABLE_KEY.");
    if (!config.requireHumanApproval) reasons.push("Live Stripe requires REQUIRE_HUMAN_APPROVAL=true.");
  }

  return {
    allowed: reasons.length === 0,
    mode: config.runtimeMode,
    reasons
  };
}
