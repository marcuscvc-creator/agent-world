import Stripe from "stripe";
import { getAgentWorldConfig, toIntegrationConnection } from "./config";
import { buildSlackApprovalText, buildSlackPreviewText, buildSlackSpendingText } from "./safety";
import type { ApprovalRequest, IntegrationConnection, PreviewItem, SlackMessageType, SpendingRequest } from "./types";

export type ExecutionResult = {
  ok: boolean;
  mode: "mocked" | "live-slack" | "live-stripe" | "sandbox";
  message: string;
  rawError?: string;
  slackTs?: string;
  slackChannelId?: string;
  stripeId?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function maskError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function getExecutionMode() {
  return getAgentWorldConfig().runtimeMode;
}

export function getStripeMode() {
  return getAgentWorldConfig().stripeMode;
}

export function getIntegrationConnections(): IntegrationConnection[] {
  return [
    toIntegrationConnection("slack"),
    toIntegrationConnection("stripe"),
    toIntegrationConnection("vercel"),
    toIntegrationConnection("resend"),
    toIntegrationConnection("openai"),
    toIntegrationConnection("database"),
    toIntegrationConnection("web_search")
  ];
}

export async function testSlackConnection(): Promise<ExecutionResult> {
  return sendSlackMessage({
    type: "AGENT_REPORT",
    text: "Agent World test: your agents can now message you from the running app."
  });
}

export async function sendSlackMessage(input: { type: SlackMessageType | "SPENDING_REQUEST"; text: string }): Promise<ExecutionResult> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID ?? process.env.SLACK_APPROVAL_CHANNEL_ID;

  if (!webhookUrl && (!token || !channel)) {
    return {
      ok: false,
      mode: "sandbox",
      message: "Slack is not connected. Configure SLACK_WEBHOOK_URL or SLACK_BOT_TOKEN plus SLACK_CHANNEL_ID.",
      rawError: "Missing Slack environment variables"
    };
  }

  if (getExecutionMode() === "demo") {
    return {
      ok: true,
      mode: "mocked",
      message: `Sandbox Slack ${input.type} logged without external delivery.`,
      slackTs: `sandbox-${Date.now()}`,
      slackChannelId: channel ?? "sandbox"
    };
  }

  try {
    if (token && channel) {
      if (channel.startsWith("#")) {
        return {
          ok: false,
          mode: "live-slack",
          message: "Slack bot delivery requires SLACK_CHANNEL_ID to be a channel ID, not a #channel name.",
          rawError: "Invalid SLACK_CHANNEL_ID"
        };
      }

      const response = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=utf-8"
        },
        body: JSON.stringify({
          channel,
          text: input.text,
          blocks: [{ type: "section", text: { type: "mrkdwn", text: input.text } }]
        })
      });

      const json = (await response.json()) as { ok: boolean; error?: string; ts?: string; channel?: string };
      if (!json.ok) return { ok: false, mode: "live-slack", message: `Slack API rejected the message: ${json.error ?? "unknown error"}.`, rawError: json.error };

      return { ok: true, mode: "live-slack", message: "Slack bot message delivered.", slackTs: json.ts, slackChannelId: json.channel };
    }

    if (webhookUrl) {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input.text })
      });

      if (!response.ok) {
        const rawError = await response.text();
        return { ok: false, mode: "live-slack", message: `Slack webhook failed with ${response.status}.`, rawError };
      }

      return { ok: true, mode: "live-slack", message: "Slack webhook message delivered.", slackTs: `webhook-${Date.now()}`, slackChannelId: channel ?? "webhook" };
    }

    return { ok: false, mode: "sandbox", message: "Slack is not connected.", rawError: "Missing Slack environment variables" };
  } catch (error) {
    return { ok: false, mode: "live-slack", message: "Slack delivery failed.", rawError: maskError(error) };
  }
}

export async function sendSlackApprovalMessage(request: ApprovalRequest): Promise<ExecutionResult> {
  return sendSlackMessage({ type: "APPROVAL_REQUIRED", text: buildSlackApprovalText(request) });
}

export async function sendSlackExecutedMessage(request: ApprovalRequest, result: ExecutionResult): Promise<ExecutionResult> {
  return sendSlackMessage({
    type: "EXECUTED",
    text: [
      "*EXECUTED*",
      `*Agent:* ${request.agentName}`,
      `*Approval ID:* ${request.id}`,
      `*Action:* ${request.proposedAction}`,
      `*Execution result:* ${result.message}`,
      `*Mode:* ${result.mode}`,
      "*Status:* Agent World received approval and completed the approved execution step."
    ].join("\n")
  });
}

export async function sendSlackPreviewMessage(preview: PreviewItem): Promise<ExecutionResult> {
  return sendSlackMessage({ type: "PREVIEW_ONLY", text: buildSlackPreviewText(preview) });
}

export async function sendSlackSpendingRequest(request: SpendingRequest): Promise<ExecutionResult> {
  return sendSlackMessage({ type: "SPENDING_REQUEST", text: buildSlackSpendingText(request) });
}

export async function sendRevenueUpdate(text: string): Promise<ExecutionResult> {
  return sendSlackMessage({ type: "REVENUE_UPDATE", text });
}

export async function sendAgentReport(text: string): Promise<ExecutionResult> {
  return sendSlackMessage({ type: "AGENT_REPORT", text });
}

function stripeClient() {
  const secret = getStripeMode() === "live" ? process.env.STRIPE_LIVE_SECRET_KEY : process.env.STRIPE_SECRET_KEY;
  if (!secret) return null;
  return new Stripe(secret, { apiVersion: "2025-02-24.acacia" });
}

export async function testStripeConnection(): Promise<ExecutionResult> {
  const stripe = stripeClient();
  if (!stripe) return { ok: false, mode: "sandbox", message: `Stripe is not connected. Configure ${getStripeMode() === "live" ? "STRIPE_LIVE_SECRET_KEY" : "STRIPE_SECRET_KEY"}.`, rawError: "Missing Stripe secret key" };

  try {
    const account = await stripe.accounts.retrieve();
    return { ok: true, mode: "live-stripe", message: `Stripe connected in ${getStripeMode()} mode for account ${account.id}.`, stripeId: account.id };
  } catch (error) {
    return { ok: false, mode: "live-stripe", message: "Stripe connection test failed.", rawError: maskError(error) };
  }
}

export async function createStripeProduct(input: { name: string; description?: string }): Promise<ExecutionResult> {
  const stripe = stripeClient();
  if (!stripe) return { ok: false, mode: "sandbox", message: "Stripe is not connected.", rawError: "Missing Stripe secret key" };
  if (getExecutionMode() === "demo" || getExecutionMode() === "local") return { ok: true, mode: "mocked", message: `Demo product draft created: ${input.name}` };

  try {
    const product = await stripe.products.create({ name: input.name, description: input.description });
    return { ok: true, mode: "live-stripe", message: "Stripe product created.", stripeId: product.id };
  } catch (error) {
    return { ok: false, mode: "live-stripe", message: "Stripe product creation failed.", rawError: maskError(error) };
  }
}

export async function createStripePrice(input: { productId: string; unitAmount: number; currency?: string }): Promise<ExecutionResult> {
  const stripe = stripeClient();
  if (!stripe) return { ok: false, mode: "sandbox", message: "Stripe is not connected.", rawError: "Missing Stripe secret key" };
  if (getExecutionMode() === "demo" || getExecutionMode() === "local") return { ok: true, mode: "mocked", message: `Demo price draft created for ${input.productId}` };

  try {
    const price = await stripe.prices.create({ product: input.productId, unit_amount: input.unitAmount, currency: input.currency ?? "usd" });
    return { ok: true, mode: "live-stripe", message: "Stripe price created.", stripeId: price.id };
  } catch (error) {
    return { ok: false, mode: "live-stripe", message: "Stripe price creation failed.", rawError: maskError(error) };
  }
}

export async function createStripePaymentLink(input: { priceId: string; approved: boolean }): Promise<ExecutionResult> {
  const stripe = stripeClient();
  if (!stripe) return { ok: false, mode: "sandbox", message: "Stripe is not connected.", rawError: "Missing Stripe secret key" };
  if (getStripeMode() === "live" && !input.approved) return { ok: false, mode: "live-stripe", message: "Live payment links require approval before creation.", rawError: "Approval required" };
  if (getExecutionMode() === "demo" || getExecutionMode() === "local") return { ok: true, mode: "mocked", message: `Demo payment link draft created for ${input.priceId}` };

  try {
    const link = await stripe.paymentLinks.create({ line_items: [{ price: input.priceId, quantity: 1 }] });
    return { ok: true, mode: "live-stripe", message: link.url, stripeId: link.id };
  } catch (error) {
    return { ok: false, mode: "live-stripe", message: "Stripe payment link creation failed.", rawError: maskError(error) };
  }
}

export async function listStripeProducts(): Promise<ExecutionResult> {
  const stripe = stripeClient();
  if (!stripe) return { ok: false, mode: "sandbox", message: "Stripe is not connected.", rawError: "Missing STRIPE_SECRET_KEY" };

  try {
    const products = await stripe.products.list({ limit: 10 });
    return { ok: true, mode: "live-stripe", message: `${products.data.length} Stripe products found.` };
  } catch (error) {
    return { ok: false, mode: "live-stripe", message: "Stripe product list failed.", rawError: maskError(error) };
  }
}

export async function syncStripeRevenue(): Promise<ExecutionResult> {
  const stripe = stripeClient();
  if (!stripe) return { ok: false, mode: "sandbox", message: "Stripe is not connected.", rawError: "Missing STRIPE_SECRET_KEY" };

  try {
    const charges = await stripe.charges.list({ limit: 10 });
    const gross = charges.data.reduce((sum, charge) => sum + charge.amount, 0) / 100;
    return { ok: true, mode: "live-stripe", message: `Synced ${charges.data.length} recent charges totaling $${gross.toFixed(2)} gross.` };
  } catch (error) {
    return { ok: false, mode: "live-stripe", message: "Stripe revenue sync failed.", rawError: maskError(error) };
  }
}

export async function handleStripeWebhook(payload: string | Buffer, signature: string | null): Promise<ExecutionResult> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripe = stripeClient();
  if (!stripe || !secret || !signature) return { ok: false, mode: "sandbox", message: "Stripe webhook is not configured.", rawError: "Missing Stripe webhook configuration" };

  try {
    const event = stripe.webhooks.constructEvent(payload, signature, secret);
    return { ok: true, mode: "live-stripe", message: `Stripe webhook received: ${event.type}` };
  } catch (error) {
    return { ok: false, mode: "live-stripe", message: "Stripe webhook verification failed.", rawError: maskError(error) };
  }
}

export async function executeSandboxAction(request: ApprovalRequest): Promise<ExecutionResult> {
  return {
    ok: true,
    mode: "sandbox",
    message: `Sandbox executed: ${request.exactExecution}`
  };
}
