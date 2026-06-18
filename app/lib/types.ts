export type AgentRole =
  | "CEO Agent"
  | "Research Agent"
  | "Product Agent"
  | "Website Agent"
  | "Marketing Agent"
  | "Sales Agent"
  | "Finance Agent"
  | "Compliance Agent";

export type AgentStatus =
  | "idle"
  | "thinking"
  | "working"
  | "waiting_approval"
  | "executing"
  | "blocked";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "modification_requested" | "executed";

export type ApprovalChannel = "slack";

export type ExecutionMode = "demo" | "local" | "supervised_live" | "production" | "sandbox" | "supervised" | "live";

export type IntegrationProvider = "slack" | "stripe" | "vercel" | "resend" | "openai" | "database" | "web_search";

export type IntegrationStatus = "connected" | "not_connected" | "needs_configuration" | "failed";

export type TestStatus = "not_tested" | "passed" | "failed";

export type SlackMessageType =
  | "APPROVAL_REQUIRED"
  | "PREVIEW_ONLY"
  | "EXECUTED"
  | "BLOCKED"
  | "NEEDS_MODIFICATION"
  | "REVENUE_UPDATE"
  | "AGENT_REPORT";

export type PreviewItemType =
  | "email_script"
  | "ad_copy"
  | "social_post_draft"
  | "landing_page_copy"
  | "product_description"
  | "offer_presentation"
  | "sales_script"
  | "content_calendar"
  | "cold_dm_script";

export type AgentActionType =
  | "draft_email"
  | "draft_ad"
  | "draft_social_post"
  | "draft_landing_page"
  | "draft_product"
  | "send_email"
  | "send_dm"
  | "publish_website"
  | "deploy_website"
  | "publish_social_post"
  | "launch_ad"
  | "spend_money"
  | "change_price"
  | "issue_refund"
  | "contact_customer"
  | "enable_live_stripe";

export type LocationKey =
  | "camp"
  | "research_lab"
  | "product_workshop"
  | "marketing_studio"
  | "sales_office"
  | "compliance_office"
  | "finance_bank"
  | "website_factory";

export type Agent = {
  id: string;
  name: string;
  role: AgentRole;
  personality: string;
  memory: string[];
  goals: string[];
  taskQueue: string[];
  currentGoal: string;
  currentTask: string;
  status: AgentStatus;
  location: LocationKey;
  taskHistory: string[];
  performanceHistory: Array<{ label: string; value: string }>;
  revenueInfluenced: number;
  costIncurred: number;
  riskLevel: RiskLevel;
  approvalRequired: boolean;
  trustScore: number;
  complianceScore: number;
  customerSatisfactionScore: number;
  spamRiskScore: number;
  brandSafetyScore: number;
  reliabilityScore: number;
  logs: string[];
};

export type Building = {
  id: LocationKey;
  name: string;
  purpose: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};

export type Activity = {
  id: string;
  agentId: string;
  agentName: string;
  message: string;
  rationale: string;
  toolUsed: string;
  result: string;
  approvalNeeded: boolean;
  revenueImpact: number;
  costImpact: number;
  timestamp: string;
};

export type ApprovalRequest = {
  id: string;
  agentId: string;
  agentName: string;
  actionType: AgentActionType;
  title?: string | null;
  summary?: string | null;
  proposedAction: string;
  reason: string;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  previewOnly: boolean;
  channel: ApprovalChannel;
  expectedUpside: string;
  downside: string;
  exactExecution: string;
  previewLink?: string | null;
  contentPreview?: string | null;
  status: ApprovalStatus;
  slackTs?: string | null;
  slackChannelId?: string | null;
  requestedAt?: string | Date;
  resolvedAt?: string | Date | null;
  executedAt?: string | Date | null;
};

export type PreviewItem = {
  id: string;
  agentId: string;
  agentName: string;
  title: string;
  type: PreviewItemType;
  content: string;
  destination: string;
  previewOnly: boolean;
  holdRequested: boolean;
  sentToSlackAt?: string;
};

export type SlackMessage = {
  id: string;
  type: SlackMessageType;
  agentId?: string;
  agentName?: string;
  approvalRequestId?: string;
  previewItemId?: string;
  channelId: string;
  ts: string;
  title: string;
  body: string;
  statusBadge: "Needs Approval" | "Preview Sent" | "Executed" | "Held" | "Rejected" | "Needs Modification" | "Blocked";
};

export type AgentAction = {
  id: string;
  agentId: string;
  actionType: AgentActionType;
  title: string;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  previewOnly: boolean;
  status: "drafted" | "preview_sent" | "pending_approval" | "executed" | "blocked";
};

export type NotificationPreference = {
  id: string;
  channel: ApprovalChannel;
  slackChannelId: string;
  approvalRequired: boolean;
  previewOnly: boolean;
  revenueUpdates: boolean;
  agentReports: boolean;
};

export type BusinessIdea = {
  id: string;
  title: string;
  niche: string;
  businessModel: string;
  category: string;
  marketDemand: number;
  competition: number;
  startupCost: number;
  timeToRevenue: string;
  timeToFirstDollar: string;
  complianceRisk: RiskLevel;
  scalability: number;
  demandScore: number;
  competitionScore: number;
  scalabilityScore: number;
  riskScore: number;
  reputationRiskScore: number;
  complianceRiskScore: number;
  probabilityOfRevenue: number;
  canStartForZero: boolean;
  expectedProfit: number;
  pathToFirstDollar: string;
  expectedTimeToFirstDollar: string;
  minimumViableOffer: string;
  firstCustomerStrategy: string;
  validationMethod: string;
  freeDistributionPlan: string;
  rationale: string;
};

export type Business = {
  id: string;
  name: string;
  niche: string;
  businessModel: string;
  ownerAgentId: string;
  status: "active" | "paused" | "shut_down" | "draft";
  stage: "stall" | "shop" | "office" | "tower" | "district";
  category: string;
  health: "watch" | "healthy" | "growing" | "at_risk";
  revenue: number;
  expenses: number;
  profit: number;
  growthRate: number;
  traffic: number;
  leads: number;
  conversionRate: number;
  products: string[];
  websites: string[];
  campaigns: string[];
  riskScore: number;
  reputationScore: number;
  trustScore: number;
  customerSatisfactionScore: number;
  brandScore: number;
  complaintCount: number;
  refundRate: number;
  spamRiskScore: number;
  complianceScore: number;
  createdAt: string;
  updatedAt: string;
  activeProjects: string[];
  opportunities: string[];
  risks: string[];
};

export type AgentCommunication = {
  id: string;
  fromAgent: string;
  toAgent: string;
  message: string;
  outcome: string;
  timestamp: string;
};

export type RevenueMetrics = {
  grossRevenue: number;
  netRevenue: number;
  mrr: number;
  arr: number;
  expenses: number;
  profit: number;
  refunds: number;
  stripeFees: number;
  adSpend: number;
  softwareCosts: number;
  leads: number;
  traffic: number;
  conversionRate: number;
  productsLaunched: number;
  websitesLaunched: number;
  businesses: number;
  outreachSent: number;
  approvedActions: number;
  rejectedActions: number;
};

export type CapitalAccount = {
  id: string;
  availableCapital: number;
  generatedRevenue: number;
  approvedUserFunding: number;
  reinvestmentBudget: number;
  requestedSpending: number;
  approvedSpending: number;
  rejectedSpending: number;
  currentExpenses: number;
  netProfit: number;
};

export type SpendingRequestStatus = "pending" | "approved" | "rejected" | "modification_requested";

export type SpendingRequest = {
  id: string;
  requestingAgentId: string;
  requestingAgentName: string;
  amount: number;
  reason: string;
  category: string;
  expectedReturn: string;
  expectedPaybackTime: string;
  freeAlternativesTried: string[];
  riskLevel: RiskLevel;
  urgency: "low" | "medium" | "high";
  status: SpendingRequestStatus;
  slackMessageTs?: string;
};

export type IntegrationConnection = {
  id: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  mode: string;
  connectedAt?: string;
  lastTestedAt?: string;
  lastTestStatus: TestStatus;
  lastError?: string;
  metadataJson: Record<string, string | number | boolean>;
};

export type ExternalActionLog = {
  id: string;
  provider: IntegrationProvider;
  actionType: string;
  agentId?: string;
  status: "success" | "failed" | "blocked" | "mocked";
  requestPayloadJson: Record<string, unknown>;
  responsePayloadJson?: Record<string, unknown>;
  errorMessage?: string;
  createdAt: string;
};

export type SetupStatus = {
  executionMode: ExecutionMode;
  guardrails?: {
    allowRealWorldActions: boolean;
    requireHumanApproval: boolean;
    allowWebSearch: boolean;
    requireApprovalForWebSearch: boolean;
    openaiMonthlyBudget: number;
    maxAgentRunsPerDay: number;
    maxWebSearchesPerDay: number;
    maxDailySpendWithoutApproval: number;
  };
  integrations: IntegrationConnection[];
  slackBlocking: {
    ok: boolean;
    message: string;
    diagnostics: string[];
  };
  capital: CapitalAccount;
  externalActionLogs: ExternalActionLog[];
};
