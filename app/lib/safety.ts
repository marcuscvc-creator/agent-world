import type { AgentActionType, ApprovalRequest, BusinessIdea, PreviewItem, RiskLevel, SpendingRequest } from "./types";

export const highRiskActions = [
  "send_email",
  "send_dm",
  "publish_website",
  "publish_social_post",
  "launch_ad",
  "spend_money",
  "change_price",
  "issue_refund",
  "contact_customer",
  "enable_live_stripe",
  "create_live_payment_link",
  "purchase_domain",
  "use_paid_tool",
  "subscribe_software"
];

export const previewOnlyActions = [
  "draft_email",
  "draft_ad",
  "draft_social_post",
  "draft_landing_page",
  "draft_product"
];

export const safetyRules = [
  "Do not spam.",
  "Do not bypass platform rules.",
  "Do not make fake claims.",
  "Do not impersonate people.",
  "Do not fake reviews.",
  "Do not scrape private data.",
  "Do not send misleading financial, medical, or legal claims.",
  "Do not spend money without approval.",
  "Do not use live Stripe keys until explicitly enabled."
];

export function requiresApproval(action: string, riskLevel: RiskLevel) {
  const normalized = action.toLowerCase();
  return riskLevel === "high" || riskLevel === "critical" || highRiskActions.some((risky) => normalized.includes(risky));
}

export function actionRequiresApproval(actionType: AgentActionType, riskLevel: RiskLevel) {
  return riskLevel === "high" || riskLevel === "critical" || highRiskActions.includes(actionType);
}

export function actionIsPreviewOnly(actionType: AgentActionType) {
  return previewOnlyActions.includes(actionType);
}

export function buildSlackApprovalText(input: ApprovalRequest) {
  return [
    "*APPROVAL REQUIRED*",
    `*Agent:* ${input.agentName}`,
    `*Action:* ${input.proposedAction}`,
    `*Reason:* ${input.reason}`,
    `*Risk:* ${input.riskLevel.toUpperCase()}`,
    `*Expected upside:* ${input.expectedUpside}`,
    `*Possible downside:* ${input.downside}`,
    `*Exact execution plan:* ${input.exactExecution}`,
    "*Cost:* $0 unless separately approved",
    "*Customer/prospect impact:* Potential external/public action",
    "*Free alternatives considered:* Drafting and previewing only",
    `*Reputation risk:* ${input.riskLevel.toUpperCase()}`,
    `*Compliance risk:* ${input.riskLevel.toUpperCase()}`,
    input.previewLink ? `*Preview link:* ${input.previewLink}` : undefined,
    input.contentPreview ? `*Content preview:* ${input.contentPreview}` : undefined,
    "Reply YES, NO, or MODIFY."
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildSlackPreviewText(input: PreviewItem) {
  return [
    "*PREVIEW ONLY — NO APPROVAL REQUIRED*",
    `*Agent:* ${input.agentName}`,
    `*Task:* ${input.title}`,
    `*Content type:* ${input.type.replaceAll("_", " ")}`,
    `*Destination:* ${input.destination}`,
    `*Content preview:* ${input.content}`,
    "*Next planned action:* Continue no-cost draft work unless HOLD is received.",
    "*Estimated cost:* $0",
    "*Expected upside:* Faster validation without spending money.",
    "Reply HOLD in Slack if you want to pause this action."
  ].join("\n");
}

export function buildSlackSpendingText(input: SpendingRequest) {
  return [
    "*SPENDING APPROVAL REQUIRED*",
    `*Agent:* ${input.requestingAgentName}`,
    `*Requested amount:* $${input.amount.toFixed(2)}`,
    `*Purpose:* ${input.category}`,
    `*Why this is necessary:* ${input.reason}`,
    `*Free alternatives tried:* ${input.freeAlternativesTried.join(", ")}`,
    `*Expected return:* ${input.expectedReturn}`,
    `*Expected payback time:* ${input.expectedPaybackTime}`,
    `*Risk level:* ${input.riskLevel.toUpperCase()}`,
    "*What happens if approved:* The Finance Agent logs approved spending and executes only the approved purchase.",
    "*What happens if rejected:* Agents continue with free alternatives.",
    "Reply YES, NO, or MODIFY."
  ].join("\n");
}

export function scoreBootstrapOpportunity(idea: BusinessIdea) {
  const zeroCostBonus = idea.canStartForZero ? 20 : -20;
  const costPenalty = Math.min(25, idea.startupCost);
  return Math.round(
    idea.demandScore * 0.22 +
      idea.probabilityOfRevenue * 0.22 +
      idea.scalabilityScore * 0.12 +
      zeroCostBonus -
      costPenalty -
      idea.reputationRiskScore * 0.12 -
      idea.complianceRiskScore * 0.12 -
      idea.competitionScore * 0.08
  );
}
