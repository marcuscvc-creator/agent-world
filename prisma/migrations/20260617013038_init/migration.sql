-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('IDLE', 'THINKING', 'WORKING', 'WAITING_APPROVAL', 'EXECUTING', 'BLOCKED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'MODIFICATION_REQUESTED', 'EXECUTED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('QUEUED', 'IN_PROGRESS', 'WAITING_APPROVAL', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "ApprovalChannel" AS ENUM ('SLACK');

-- CreateEnum
CREATE TYPE "SlackMessageType" AS ENUM ('APPROVAL_REQUIRED', 'PREVIEW_ONLY', 'EXECUTED', 'BLOCKED', 'NEEDS_MODIFICATION', 'REVENUE_UPDATE', 'AGENT_REPORT');

-- CreateEnum
CREATE TYPE "PreviewItemType" AS ENUM ('EMAIL_SCRIPT', 'AD_COPY', 'SOCIAL_POST_DRAFT', 'LANDING_PAGE_COPY', 'PRODUCT_DESCRIPTION', 'OFFER_PRESENTATION', 'SALES_SCRIPT', 'CONTENT_CALENDAR', 'COLD_DM_SCRIPT');

-- CreateEnum
CREATE TYPE "AgentActionStatus" AS ENUM ('DRAFTED', 'PREVIEW_SENT', 'PENDING_APPROVAL', 'EXECUTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('CONNECTED', 'NOT_CONNECTED', 'NEEDS_CONFIGURATION', 'FAILED');

-- CreateEnum
CREATE TYPE "TestStatus" AS ENUM ('NOT_TESTED', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExecutionMode" AS ENUM ('DEMO', 'LOCAL', 'SUPERVISED_LIVE', 'PRODUCTION', 'SANDBOX', 'SUPERVISED', 'LIVE');

-- CreateEnum
CREATE TYPE "SpendingRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'MODIFICATION_REQUESTED');

-- CreateEnum
CREATE TYPE "ExternalActionStatus" AS ENUM ('SUCCESS', 'FAILED', 'BLOCKED', 'MOCKED');

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "personality" TEXT NOT NULL,
    "memory" JSONB NOT NULL DEFAULT '[]',
    "goals" JSONB NOT NULL DEFAULT '[]',
    "taskQueue" JSONB NOT NULL DEFAULT '[]',
    "currentGoal" TEXT NOT NULL,
    "currentTask" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'IDLE',
    "locationX" INTEGER NOT NULL,
    "locationY" INTEGER NOT NULL,
    "revenueInfluenced" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costIncurred" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'LOW',
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "performanceHistory" JSONB NOT NULL DEFAULT '[]',
    "trustScore" INTEGER NOT NULL DEFAULT 90,
    "complianceScore" INTEGER NOT NULL DEFAULT 90,
    "customerSatisfactionScore" INTEGER NOT NULL DEFAULT 90,
    "spamRiskScore" INTEGER NOT NULL DEFAULT 10,
    "brandSafetyScore" INTEGER NOT NULL DEFAULT 90,
    "reliabilityScore" INTEGER NOT NULL DEFAULT 90,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "niche" TEXT NOT NULL,
    "businessModel" TEXT NOT NULL,
    "ownerAgentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "expenses" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "profit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "growthRate" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "traffic" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "conversionRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "products" JSONB NOT NULL DEFAULT '[]',
    "websites" JSONB NOT NULL DEFAULT '[]',
    "campaigns" JSONB NOT NULL DEFAULT '[]',
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "reputationScore" INTEGER NOT NULL DEFAULT 90,
    "trustScore" INTEGER NOT NULL DEFAULT 90,
    "customerSatisfactionScore" INTEGER NOT NULL DEFAULT 90,
    "brandScore" INTEGER NOT NULL DEFAULT 90,
    "complaintCount" INTEGER NOT NULL DEFAULT 0,
    "refundRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "spamRiskScore" INTEGER NOT NULL DEFAULT 10,
    "complianceScore" INTEGER NOT NULL DEFAULT 90,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentCommunication" (
    "id" TEXT NOT NULL,
    "fromAgentId" TEXT NOT NULL,
    "toAgentId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentCommunication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'QUEUED',
    "toolUsed" TEXT,
    "result" TEXT,
    "approvalNeeded" BOOLEAN NOT NULL DEFAULT false,
    "revenueImpact" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costImpact" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentLog" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "taskId" TEXT,
    "message" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "toolUsed" TEXT,
    "result" TEXT,
    "approvalNeeded" BOOLEAN NOT NULL DEFAULT false,
    "revenueImpact" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costImpact" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "taskId" TEXT,
    "actionType" TEXT NOT NULL,
    "title" TEXT,
    "summary" TEXT,
    "proposedAction" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "previewOnly" BOOLEAN NOT NULL DEFAULT false,
    "channel" "ApprovalChannel" NOT NULL DEFAULT 'SLACK',
    "expectedUpside" TEXT NOT NULL,
    "downside" TEXT NOT NULL,
    "exactExecution" TEXT NOT NULL,
    "executionPlanJson" JSONB,
    "previewLink" TEXT,
    "contentPreview" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "slackTs" TEXT,
    "slackMessageTs" TEXT,
    "slackChannelId" TEXT,
    "humanResponse" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'NOT_CONNECTED',
    "mode" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3),
    "lastTestedAt" TIMESTAMP(3),
    "lastTestStatus" "TestStatus" NOT NULL DEFAULT 'NOT_TESTED',
    "lastError" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalActionLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "agentId" TEXT,
    "status" "ExternalActionStatus" NOT NULL,
    "requestPayloadJson" JSONB NOT NULL DEFAULT '{}',
    "responsePayloadJson" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpendingRequest" (
    "id" TEXT NOT NULL,
    "requestingAgentId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "expectedReturn" TEXT NOT NULL,
    "expectedPaybackTime" TEXT NOT NULL,
    "freeAlternativesTried" JSONB NOT NULL DEFAULT '[]',
    "riskLevel" "RiskLevel" NOT NULL,
    "urgency" TEXT NOT NULL,
    "status" "SpendingRequestStatus" NOT NULL DEFAULT 'PENDING',
    "slackMessageTs" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpendingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapitalAccount" (
    "id" TEXT NOT NULL,
    "availableCapital" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "generatedRevenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "approvedUserFunding" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reinvestmentBudget" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "requestedSpending" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "approvedSpending" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "rejectedSpending" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currentExpenses" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netProfit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapitalAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreviewItem" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "PreviewItemType" NOT NULL,
    "content" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "previewOnly" BOOLEAN NOT NULL DEFAULT true,
    "holdRequested" BOOLEAN NOT NULL DEFAULT false,
    "sentToSlackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlackMessage" (
    "id" TEXT NOT NULL,
    "type" "SlackMessageType" NOT NULL,
    "agentId" TEXT,
    "approvalRequestId" TEXT,
    "previewItemId" TEXT,
    "channelId" TEXT NOT NULL,
    "ts" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "statusBadge" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlackMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "channel" "ApprovalChannel" NOT NULL DEFAULT 'SLACK',
    "slackChannelId" TEXT NOT NULL,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
    "previewOnly" BOOLEAN NOT NULL DEFAULT true,
    "revenueUpdates" BOOLEAN NOT NULL DEFAULT true,
    "agentReports" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAction" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "approvalRequestId" TEXT,
    "previewItemId" TEXT,
    "actionType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL,
    "previewOnly" BOOLEAN NOT NULL,
    "status" "AgentActionStatus" NOT NULL DEFAULT 'DRAFTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessIdea" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "niche" TEXT NOT NULL,
    "businessModel" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "marketDemand" INTEGER NOT NULL,
    "competition" INTEGER NOT NULL,
    "startupCost" DECIMAL(12,2) NOT NULL,
    "timeToRevenue" TEXT NOT NULL,
    "timeToFirstDollar" TEXT NOT NULL,
    "complianceRisk" "RiskLevel" NOT NULL,
    "scalability" INTEGER NOT NULL,
    "demandScore" INTEGER NOT NULL,
    "competitionScore" INTEGER NOT NULL,
    "scalabilityScore" INTEGER NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "reputationRiskScore" INTEGER NOT NULL,
    "complianceRiskScore" INTEGER NOT NULL,
    "probabilityOfRevenue" INTEGER NOT NULL,
    "canStartForZero" BOOLEAN NOT NULL DEFAULT true,
    "expectedProfit" DECIMAL(12,2) NOT NULL,
    "pathToFirstDollar" TEXT NOT NULL,
    "expectedTimeToFirstDollar" TEXT NOT NULL,
    "minimumViableOffer" TEXT NOT NULL,
    "firstCustomerStrategy" TEXT NOT NULL,
    "validationMethod" TEXT NOT NULL,
    "freeDistributionPlan" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessIdea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "businessIdeaId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "launchApproval" "ApprovalStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Website" (
    "id" TEXT NOT NULL,
    "businessIdeaId" TEXT,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "copy" TEXT NOT NULL,
    "launchApproval" "ApprovalStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Website_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "businessIdeaId" TEXT,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "budget" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachMessage" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "recipient" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "approvalStatus" "ApprovalStatus",
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueEvent" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "stripeFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refund" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sandbox" BOOLEAN NOT NULL DEFAULT true,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseEvent" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldState" (
    "id" TEXT NOT NULL,
    "grossRevenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netRevenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "mrr" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "arr" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "expenses" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "profit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'campsite',
    "websitesLaunched" INTEGER NOT NULL DEFAULT 0,
    "productsLaunched" INTEGER NOT NULL DEFAULT 0,
    "businesses" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "traffic" INTEGER NOT NULL DEFAULT 0,
    "conversionRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "executionMode" "ExecutionMode" NOT NULL DEFAULT 'SUPERVISED_LIVE',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMemory" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "relevance" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentThought" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "taskId" TEXT,
    "prompt" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "toolCalls" JSONB NOT NULL DEFAULT '[]',
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(8,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentThought_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldClock" (
    "id" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL DEFAULT 1,
    "timeOfDay" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldClock_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_ownerAgentId_fkey" FOREIGN KEY ("ownerAgentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCommunication" ADD CONSTRAINT "AgentCommunication_fromAgentId_fkey" FOREIGN KEY ("fromAgentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCommunication" ADD CONSTRAINT "AgentCommunication_toAgentId_fkey" FOREIGN KEY ("toAgentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentLog" ADD CONSTRAINT "AgentLog_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentLog" ADD CONSTRAINT "AgentLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalActionLog" ADD CONSTRAINT "ExternalActionLog_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpendingRequest" ADD CONSTRAINT "SpendingRequest_requestingAgentId_fkey" FOREIGN KEY ("requestingAgentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreviewItem" ADD CONSTRAINT "PreviewItem_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackMessage" ADD CONSTRAINT "SlackMessage_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackMessage" ADD CONSTRAINT "SlackMessage_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackMessage" ADD CONSTRAINT "SlackMessage_previewItemId_fkey" FOREIGN KEY ("previewItemId") REFERENCES "PreviewItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_previewItemId_fkey" FOREIGN KEY ("previewItemId") REFERENCES "PreviewItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_businessIdeaId_fkey" FOREIGN KEY ("businessIdeaId") REFERENCES "BusinessIdea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Website" ADD CONSTRAINT "Website_businessIdeaId_fkey" FOREIGN KEY ("businessIdeaId") REFERENCES "BusinessIdea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_businessIdeaId_fkey" FOREIGN KEY ("businessIdeaId") REFERENCES "BusinessIdea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMemory" ADD CONSTRAINT "AgentMemory_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentThought" ADD CONSTRAINT "AgentThought_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
