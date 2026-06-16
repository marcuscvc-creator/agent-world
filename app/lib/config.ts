import type { AgentActionType, IntegrationConnection } from "./types";

export type RuntimeMode = "demo" | "local" | "supervised_live" | "production";

export type IntegrationKey = "database" | "openai" | "slack" | "stripe" | "vercel" | "email" | "webSearch";

export type AgentWorldConfig = {
  runtimeMode: RuntimeMode;
  allowRealWorldActions: boolean;
  requireHumanApproval: boolean;
  allowWebSearch: boolean;
  requireApprovalForWebSearch: boolean;
  defaultModel: string;
  openaiMonthlyBudget: number;
  maxAgentRunsPerDay: number;
  maxWebSearchesPerDay: number;
  maxDailySpendWithoutApproval: number;
  stripeMode: "test" | "live";
  appUrl?: string;
  integrations: Record<IntegrationKey, {
    configured: boolean;
    mode: string;
    missing: string[];
  }>;
};

function boolEnv(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function runtimeMode(): RuntimeMode {
  const explicit = process.env.EXECUTION_MODE?.toLowerCase();
  if (explicit === "demo" || explicit === "local" || explicit === "supervised_live" || explicit === "production") return explicit;
  if (explicit === "sandbox") return "demo";
  if (explicit === "supervised" || explicit === "live") return "supervised_live";
  if (process.env.DATABASE_URL || process.env.OPENAI_API_KEY || process.env.SLACK_BOT_TOKEN || process.env.STRIPE_SECRET_KEY) return "supervised_live";
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") return "supervised_live";
  return "local";
}

function missing(vars: string[]) {
  return vars.filter((key) => !process.env[key]);
}

export function getAgentWorldConfig(): AgentWorldConfig {
  const stripeMode = process.env.STRIPE_MODE === "live" ? "live" : "test";
  const stripeRequired = stripeMode === "live"
    ? ["STRIPE_LIVE_SECRET_KEY", "STRIPE_LIVE_PUBLISHABLE_KEY"]
    : ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY"];
  const slackMissing = process.env.SLACK_BOT_TOKEN
    ? missing(["SLACK_BOT_TOKEN", "SLACK_CHANNEL_ID"])
    : missing(["SLACK_WEBHOOK_URL"]);

  return {
    runtimeMode: runtimeMode(),
    allowRealWorldActions: boolEnv("ALLOW_REAL_WORLD_ACTIONS", true),
    requireHumanApproval: boolEnv("REQUIRE_HUMAN_APPROVAL", true),
    allowWebSearch: boolEnv("ALLOW_WEB_SEARCH", true),
    requireApprovalForWebSearch: boolEnv("REQUIRE_APPROVAL_FOR_WEB_SEARCH", true),
    defaultModel: process.env.DEFAULT_MODEL || "gpt-4o-mini",
    openaiMonthlyBudget: numberEnv("OPENAI_MONTHLY_BUDGET", 10),
    maxAgentRunsPerDay: numberEnv("MAX_AGENT_RUNS_PER_DAY", 20),
    maxWebSearchesPerDay: numberEnv("MAX_WEB_SEARCHES_PER_DAY", 5),
    maxDailySpendWithoutApproval: numberEnv("MAX_DAILY_SPEND_WITHOUT_APPROVAL", 0),
    stripeMode,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
    integrations: {
      database: {
        configured: missing(["DATABASE_URL"]).length === 0,
        mode: "postgres",
        missing: missing(["DATABASE_URL"])
      },
      openai: {
        configured: missing(["OPENAI_API_KEY"]).length === 0,
        mode: "api",
        missing: missing(["OPENAI_API_KEY"])
      },
      slack: {
        configured: slackMissing.length === 0,
        mode: process.env.SLACK_BOT_TOKEN ? "bot_token" : process.env.SLACK_WEBHOOK_URL ? "webhook" : "none",
        missing: slackMissing
      },
      stripe: {
        configured: missing(stripeRequired).length === 0,
        mode: stripeMode,
        missing: missing(stripeRequired)
      },
      vercel: {
        configured: missing(["VERCEL_TOKEN"]).length === 0,
        mode: "api",
        missing: missing(["VERCEL_TOKEN"])
      },
      email: {
        configured: missing(["RESEND_API_KEY"]).length === 0,
        mode: "resend",
        missing: missing(["RESEND_API_KEY"])
      },
      webSearch: {
        configured: boolEnv("ALLOW_WEB_SEARCH", true),
        mode: boolEnv("ALLOW_WEB_SEARCH", true) ? "enabled" : "disabled",
        missing: []
      }
    }
  };
}

export function hasRealCredentials() {
  const config = getAgentWorldConfig();
  return Object.values(config.integrations).some((integration) => integration.configured);
}

export function toIntegrationConnection(provider: IntegrationConnection["provider"], config = getAgentWorldConfig()): IntegrationConnection {
  const key = provider === "resend" ? "email" : provider === "web_search" ? "webSearch" : provider === "database" || provider === "openai" || provider === "slack" || provider === "stripe" || provider === "vercel" ? provider : "webSearch";
  const integration = config.integrations[key as keyof typeof config.integrations];
  return {
    id: `integration-${provider}`,
    provider,
    status: integration.configured ? "connected" : "not_connected",
    mode: integration.mode,
    lastTestStatus: "not_tested",
    metadataJson: {
      configured: integration.configured,
      missingCount: integration.missing.length,
      realService: integration.configured,
      runtimeMode: config.runtimeMode
    }
  };
}

export function isRealWorldAction(actionType: AgentActionType | string) {
  return [
    "send_email",
    "send_dm",
    "publish_website",
    "publish_social_post",
    "launch_ad",
    "spend_money",
    "change_price",
    "issue_refund",
    "contact_customer",
    "enable_live_stripe"
  ].includes(actionType);
}
