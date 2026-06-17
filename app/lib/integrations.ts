import Stripe from "stripe";
import { getAgentWorldConfig, toIntegrationConnection } from "./config";
import { buildSlackApprovalText, buildSlackPreviewText, buildSlackSpendingText } from "./safety";
import type { ApprovalRequest, IntegrationConnection, PreviewItem, SlackMessageType, SpendingRequest } from "./types";

export type ExecutionResult = {
  ok: boolean;
  mode: "mocked" | "live-slack" | "live-stripe" | "live-resend" | "live-twitter" | "live-vercel" | "sandbox";
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

// ── Resend Email ──────────────────────────────────────────────────────────────

export async function sendEmailViaResend(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}): Promise<ExecutionResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = input.from ?? process.env.RESEND_FROM_EMAIL ?? "agents@agentworld.app";

  if (!apiKey) {
    return {
      ok: false,
      mode: "sandbox",
      message: "Resend not connected. Add RESEND_API_KEY (and optionally RESEND_FROM_EMAIL) to Vercel env vars.",
      rawError: "Missing RESEND_API_KEY",
    };
  }

  if (getExecutionMode() === "demo") {
    return { ok: true, mode: "mocked", message: `Demo: email to ${input.to} (subject: "${input.subject}") logged without delivery.` };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text ?? "",
      }),
    });

    const json = (await res.json()) as { id?: string; error?: { message?: string; name?: string } };

    if (!res.ok || json.error) {
      return {
        ok: false,
        mode: "live-resend",
        message: `Resend failed: ${json.error?.message ?? "unknown error"}`,
        rawError: JSON.stringify(json.error),
      };
    }

    return {
      ok: true,
      mode: "live-resend",
      message: `Email sent to ${input.to} (subject: "${input.subject}"). Resend ID: ${json.id}`,
    };
  } catch (error) {
    return { ok: false, mode: "live-resend", message: "Email delivery failed.", rawError: maskError(error) };
  }
}

// ── Twitter/X ────────────────────────────────────────────────────────────────

async function buildTwitterOAuth1Header(
  method: string,
  url: string,
  apiKey: string,
  apiSecret: string,
  accessToken: string,
  accessSecret: string
): Promise<string> {
  const nonce = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA256",
    oauth_timestamp: timestamp,
    oauth_token: accessToken,
    oauth_version: "1.0",
  };

  const pctEncode = (s: string) => encodeURIComponent(s).replace(/!/g, "%21").replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\*/g, "%2A");

  const sortedParams = Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${pctEncode(k)}=${pctEncode(v)}`)
    .join("&");

  const baseString = [method.toUpperCase(), pctEncode(url), pctEncode(sortedParams)].join("&");
  const signingKey = `${pctEncode(apiSecret)}&${pctEncode(accessSecret)}`;

  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(baseString));
  const sig = Buffer.from(sigBuffer).toString("base64");

  oauthParams["oauth_signature"] = sig;

  const header =
    "OAuth " +
    Object.entries(oauthParams)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${pctEncode(k)}="${pctEncode(v)}"`)
      .join(", ");

  return header;
}

export async function postToTwitter(input: { content: string }): Promise<ExecutionResult> {
  const apiKey = process.env.TWITTER_API_KEY;
  const apiSecret = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    return {
      ok: false,
      mode: "sandbox",
      message: "Twitter not connected. Add TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET to Vercel env vars.",
      rawError: "Missing Twitter credentials",
    };
  }

  if (getExecutionMode() === "demo") {
    return { ok: true, mode: "mocked", message: `Demo: tweet logged (${input.content.length} chars)` };
  }

  const url = "https://api.twitter.com/2/tweets";

  try {
    const authHeader = await buildTwitterOAuth1Header("POST", url, apiKey, apiSecret, accessToken, accessSecret);

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ text: input.content }),
    });

    const json = (await res.json()) as {
      data?: { id?: string; text?: string };
      errors?: Array<{ message: string; title?: string }>;
    };

    if (!res.ok || json.errors?.length) {
      const errMsg = json.errors?.[0]?.message ?? json.errors?.[0]?.title ?? "Unknown Twitter error";
      return { ok: false, mode: "live-twitter", message: `Twitter post failed: ${errMsg}`, rawError: errMsg };
    }

    return {
      ok: true,
      mode: "live-twitter",
      message: `Tweet posted (ID: ${json.data?.id}). Content: "${input.content.slice(0, 60)}${input.content.length > 60 ? "…" : ""}"`,
    };
  } catch (error) {
    return { ok: false, mode: "live-twitter", message: "Twitter post failed.", rawError: maskError(error) };
  }
}

// ── Vercel Deploy ─────────────────────────────────────────────────────────────

export async function deployToVercel(input: { name: string; html: string }): Promise<ExecutionResult> {
  const accessToken = process.env.VERCEL_TOKEN ?? process.env.VERCEL_ACCESS_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;

  if (!accessToken) {
    return {
      ok: false,
      mode: "sandbox",
      message: "Vercel deploy not connected. Add VERCEL_ACCESS_TOKEN to Vercel env vars.",
      rawError: "Missing VERCEL_ACCESS_TOKEN",
    };
  }

  if (getExecutionMode() === "demo") {
    return { ok: true, mode: "mocked", message: `Demo: landing page "${input.name}" would be deployed to Vercel.` };
  }

  try {
    const htmlBytes = new TextEncoder().encode(input.html);

    // Compute SHA-1 of the file content for Vercel's digest header
    const shaBuffer = await crypto.subtle.digest("SHA-1", htmlBytes);
    const shaHex = Array.from(new Uint8Array(shaBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Step 1 — upload the file
    const fileRes = await fetch("https://api.vercel.com/v2/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "text/html",
        "x-vercel-digest": shaHex,
        ...(teamId ? { "x-vercel-team-id": teamId } : {}),
      },
      body: input.html,
    });

    // 200 = already uploaded (fine), 201 = uploaded now — anything else is an error
    if (fileRes.status !== 200 && fileRes.status !== 201) {
      const errText = await fileRes.text();
      return { ok: false, mode: "live-vercel", message: "Vercel file upload failed.", rawError: errText };
    }

    // Step 2 — create deployment
    const deployPayload: Record<string, unknown> = {
      name: input.name.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 100),
      files: [{ file: "index.html", sha: shaHex, size: htmlBytes.byteLength }],
      projectSettings: { framework: null, outputDirectory: null },
      target: "production",
    };

    if (teamId) deployPayload.teamId = teamId;

    const deployRes = await fetch("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(deployPayload),
    });

    const deployJson = (await deployRes.json()) as {
      id?: string;
      url?: string;
      error?: { message?: string; code?: string };
    };

    if (!deployRes.ok || deployJson.error) {
      return {
        ok: false,
        mode: "live-vercel",
        message: `Vercel deploy failed: ${deployJson.error?.message ?? "unknown error"}`,
        rawError: JSON.stringify(deployJson.error),
      };
    }

    const siteUrl = `https://${deployJson.url}`;
    return { ok: true, mode: "live-vercel", message: siteUrl };
  } catch (error) {
    return { ok: false, mode: "live-vercel", message: "Vercel deploy failed.", rawError: maskError(error) };
  }
}

// ── Real-World Action Router ──────────────────────────────────────────────────

export async function executeSandboxAction(request: ApprovalRequest): Promise<ExecutionResult> {
  // Parse exactExecution as JSON for structured params — agents are instructed to write JSON here
  let params: Record<string, unknown> = {};
  try {
    if (request.exactExecution?.trim().startsWith("{")) {
      params = JSON.parse(request.exactExecution) as Record<string, unknown>;
    }
  } catch {
    // Not JSON — params stays empty, fall through to text-based handling
  }

  const str = (key: string, fallback = "") => String(params[key] ?? fallback);

  switch (request.actionType) {
    // ── Email ──
    case "send_email":
    case "contact_customer": {
      const to = str("to");
      if (!to) {
        return {
          ok: false,
          mode: "sandbox",
          message: `Email action missing "to" address. Agent must set exactExecution to JSON: {"to":"...","subject":"...","html":"..."}`,
        };
      }
      return sendEmailViaResend({
        to,
        subject: str("subject", request.title ?? "Message from Agent World"),
        html: str("html", str("body", `<p>${request.exactExecution}</p>`)),
        text: str("text"),
      });
    }

    // ── Social Posting ──
    case "publish_social_post": {
      const content = str("content", request.exactExecution ?? "");
      const platform = str("platform", "twitter").toLowerCase();
      if (platform === "twitter" || platform === "x") {
        return postToTwitter({ content });
      }
      return {
        ok: false,
        mode: "sandbox",
        message: `Social platform "${platform}" not yet wired. Currently supports: twitter/x. Add Instagram or LinkedIn credentials to expand.`,
      };
    }

    // ── Product / Stripe ──
    case "draft_product": {
      const name = str("name", request.title ?? "New Product");
      const description = str("description", request.summary ?? "");
      const priceCents = Number(params.price_cents ?? params.priceCents ?? 4900);

      const productResult = await createStripeProduct({ name, description });
      if (!productResult.ok || !productResult.stripeId) return productResult;

      const priceResult = await createStripePrice({ productId: productResult.stripeId, unitAmount: priceCents });
      if (!priceResult.ok || !priceResult.stripeId) return priceResult;

      const linkResult = await createStripePaymentLink({ priceId: priceResult.stripeId, approved: true });
      return {
        ...linkResult,
        message: `Product "${name}" ($${(priceCents / 100).toFixed(2)}) created on Stripe. Payment link: ${linkResult.message}`,
      };
    }

    // ── Website Deploy ──
    case "publish_website": {
      const projectName = str("name", request.title ?? "agent-landing").toLowerCase().replace(/\s+/g, "-");
      const html = str("html", "<h1>Coming soon</h1>");
      return deployToVercel({ name: projectName, html });
    }

    // ── Stripe Refund ──
    case "issue_refund": {
      const stripe = stripeClient();
      if (!stripe) return { ok: false, mode: "sandbox", message: "Stripe not connected for refunds." };

      const chargeId = str("charge_id", str("chargeId"));
      if (!chargeId) {
        return {
          ok: false,
          mode: "sandbox",
          message: `Refund missing "charge_id". Agent must set exactExecution to JSON: {"charge_id":"ch_xxx","amount_cents":4900}`,
        };
      }

      const amountCents = Number(params.amount_cents ?? params.amountCents ?? 0);
      try {
        const refund = await stripe.refunds.create({
          charge: chargeId,
          ...(amountCents > 0 ? { amount: amountCents } : {}),
        });
        return {
          ok: true,
          mode: "live-stripe",
          message: `Refund of $${(refund.amount / 100).toFixed(2)} issued (ID: ${refund.id}).`,
          stripeId: refund.id,
        };
      } catch (error) {
        return { ok: false, mode: "live-stripe", message: "Stripe refund failed.", rawError: maskError(error) };
      }
    }

    // ── Stripe Price Change ──
    case "change_price": {
      const stripe = stripeClient();
      if (!stripe) return { ok: false, mode: "sandbox", message: "Stripe not connected for price changes." };

      const priceId = str("price_id", str("priceId"));
      const newAmountCents = Number(params.new_amount_cents ?? params.newAmountCents ?? 0);

      if (!priceId || !newAmountCents) {
        return {
          ok: false,
          mode: "sandbox",
          message: `Price change missing params. Agent must set exactExecution to JSON: {"price_id":"price_xxx","new_amount_cents":4900}`,
        };
      }

      try {
        const existing = await stripe.prices.retrieve(priceId);
        const newPrice = await stripe.prices.create({
          product: String(existing.product),
          unit_amount: newAmountCents,
          currency: existing.currency,
        });
        await stripe.prices.update(priceId, { active: false });
        return {
          ok: true,
          mode: "live-stripe",
          message: `Price updated to $${(newAmountCents / 100).toFixed(2)}. New price ID: ${newPrice.id}. Old price archived.`,
          stripeId: newPrice.id,
        };
      } catch (error) {
        return { ok: false, mode: "live-stripe", message: "Stripe price change failed.", rawError: maskError(error) };
      }
    }

    // ── Spend Money (meta action — no direct API call, logs intent) ──
    case "spend_money": {
      return {
        ok: true,
        mode: "sandbox",
        message: `Spending approved: ${request.exactExecution}. Complete the purchase manually, then have the agent log it with log_expense.`,
      };
    }

    // ── Ads (not yet wired) ──
    case "launch_ad": {
      return {
        ok: false,
        mode: "sandbox",
        message: "Ad platform not yet connected. Add GOOGLE_ADS_DEVELOPER_TOKEN or META_ADS_ACCESS_TOKEN to enable ad launching.",
      };
    }

    // ── DMs (Twitter DM requires separate OAuth scope) ──
    case "send_dm": {
      return {
        ok: false,
        mode: "sandbox",
        message: "Direct messaging not yet wired. Twitter DMs require an additional OAuth scope beyond basic posting.",
      };
    }

    // ── Enable Live Stripe ──
    case "enable_live_stripe": {
      return {
        ok: true,
        mode: "sandbox",
        message: "To go live on Stripe: set STRIPE_MODE=live and add STRIPE_LIVE_SECRET_KEY in Vercel → Settings → Environment Variables, then redeploy.",
      };
    }

    // ── Draft actions: should be handled by draft_content tool, not approval ──
    case "draft_email":
    case "draft_ad":
    case "draft_social_post":
    case "draft_landing_page":
      return {
        ok: true,
        mode: "sandbox",
        message: `Draft action "${request.actionType}" saved. Use draft_content tool to route drafts to the review queue, not request_approval.`,
      };

    default:
      return {
        ok: true,
        mode: "sandbox",
        message: `Action "${request.actionType}" executed in sandbox: ${request.exactExecution}`,
      };
  }
}

// ── Slack Draft Previews ─────────────────────────────────────────────────────

/** Content types that also get a DALL-E concept image */
const VISUAL_CONTENT_TYPES = new Set([
  "email_script",
  "ad_copy",
  "social_post_draft",
  "landing_page_copy",
  "product_description",
  "offer_presentation",
  "cold_dm_script",
]);

const CONTENT_TYPE_LABELS: Record<string, string> = {
  email_script: "📧 Email Draft",
  ad_copy: "📣 Ad Copy",
  social_post_draft: "📱 Social Post",
  landing_page_copy: "🌐 Landing Page",
  product_description: "📦 Product",
  offer_presentation: "💰 Offer",
  sales_script: "💬 Sales Script",
  content_calendar: "📅 Content Calendar",
  cold_dm_script: "✉️ Cold DM",
};

const DALLE_PROMPTS: Record<string, string> = {
  ad_copy: 'Clean professional marketing ad visual. Modern bold graphic design, bright accent colors, business focused. No text, no words.',
  social_post_draft: 'Eye-catching social media post background. Vibrant lifestyle photography feel, engaging composition. No text, no words.',
  landing_page_copy: 'Minimal modern website hero image. Clean gradient background, professional product photography mood. No text, no words.',
  email_script: 'Professional email marketing header visual. Clean corporate aesthetic, warm inviting tone. No text, no words.',
  product_description: 'Clean product photography on white background. Studio lighting, premium quality feel. No text, no words.',
  offer_presentation: 'Premium business offer visual. Bold high-contrast design, sense of value and urgency. No text, no words.',
  cold_dm_script: 'Professional business handshake or connection visual. Trustworthy clean corporate. No text, no words.',
};

async function generateDraftImage(type: string, title: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !VISUAL_CONTENT_TYPES.has(type)) return null;

  const basePrompt = DALLE_PROMPTS[type] ?? "Professional business visual. Clean modern design. No text, no words.";
  const prompt = `${basePrompt} Context: ${title.slice(0, 80)}.`;

  try {
    // 25s timeout — DALL-E 3 typically responds in 10-20s
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "dall-e-3", prompt, n: 1, size: "1024x1024", quality: "standard", response_format: "url" }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    if (!response.ok) return null;
    const data = (await response.json()) as { data?: Array<{ url?: string }> };
    return data.data?.[0]?.url ?? null;
  } catch {
    return null;
  }
}

function buildDraftBlocks(input: { agentName: string; title: string; type: string; content: string; destination: string; draftId: string }, typeLabel: string, imageUrl?: string | null): object[] {
  const preview = input.content.length > 800 ? input.content.slice(0, 800) + "…" : input.content;

  const blocks: object[] = [
    { type: "header", text: { type: "plain_text", text: `${typeLabel}: ${input.title}`, emoji: true } },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `*Agent:* ${input.agentName}  ·  *For:* ${input.destination}  ·  *Draft ID:* \`${input.draftId.slice(-8)}\`` }],
    },
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text: `*Draft:*\n\`\`\`${preview}\`\`\`` } },
  ];

  if (imageUrl) {
    blocks.push({
      type: "image",
      image_url: imageUrl,
      alt_text: `AI concept image for "${input.title}"`,
      title: { type: "plain_text", text: "✨ AI Concept Image", emoji: true },
    });
  }

  blocks.push(
    { type: "divider" },
    { type: "context", elements: [{ type: "mrkdwn", text: `⏳ *Awaiting review* — nothing has been sent. Reply \`YES\`, \`NO\`, or \`MODIFY\`.` }] }
  );

  return blocks;
}

export async function sendSlackDraftPreview(input: {
  agentName: string;
  title: string;
  type: string;
  content: string;
  destination: string;
  draftId: string;
}): Promise<ExecutionResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;

  if (!token || !channel) return { ok: false, mode: "sandbox", message: "Slack not configured for draft previews." };
  if (getExecutionMode() === "demo") return { ok: true, mode: "mocked", message: "Demo: draft preview skipped.", slackTs: `sandbox-${Date.now()}`, slackChannelId: channel };

  const typeLabel = CONTENT_TYPE_LABELS[input.type] ?? `📄 ${input.type}`;
  const isVisual = VISUAL_CONTENT_TYPES.has(input.type);

  // Step 1 — post text card immediately (never delayed by image generation)
  try {
    const textBlocks = buildDraftBlocks(input, typeLabel, isVisual ? null : undefined);
    const textResponse = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        channel,
        text: `${typeLabel}: "${input.title}" by ${input.agentName} — awaiting your review`,
        blocks: textBlocks,
      }),
    });

    const textJson = (await textResponse.json()) as { ok: boolean; error?: string; ts?: string; channel?: string };
    if (!textJson.ok) return { ok: false, mode: "live-slack", message: `Slack draft preview failed: ${textJson.error}`, rawError: textJson.error };

    const messageTs = textJson.ts;
    const slackChannel = textJson.channel;

    // Step 2 — generate DALL-E image and update the message (non-blocking for the caller)
    if (isVisual && messageTs) {
      generateDraftImage(input.type, input.title).then(async (imageUrl) => {
        if (!imageUrl) return;
        const updatedBlocks = buildDraftBlocks(input, typeLabel, imageUrl);
        await fetch("https://slack.com/api/chat.update", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({ channel: slackChannel, ts: messageTs, blocks: updatedBlocks, text: `${typeLabel}: "${input.title}" — ✨ concept image added` }),
        }).catch(() => { /* non-fatal */ });
      }).catch(() => { /* non-fatal */ });
    }

    return { ok: true, mode: "live-slack", message: `Draft preview posted to Slack${isVisual ? " (concept image generating…)" : ""}.`, slackTs: messageTs, slackChannelId: slackChannel };
  } catch (error) {
    return { ok: false, mode: "live-slack", message: "Draft Slack preview delivery failed.", rawError: maskError(error) };
  }
}
