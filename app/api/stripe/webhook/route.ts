/**
 * POST /api/stripe/webhook
 *
 * Receives Stripe webhook events, verifies the signature, and processes them.
 * Supported events:
 *   - checkout.session.completed  → log revenue
 *   - payment_intent.succeeded    → log revenue
 *   - charge.refunded             → log refund
 *   - invoice.payment_succeeded   → log subscription revenue
 *
 * Set STRIPE_WEBHOOK_SECRET in .env.local to the webhook signing secret
 * from your Stripe dashboard (Developers → Webhooks → your endpoint → Signing secret).
 *
 * In development, use the Stripe CLI to forward events:
 *   stripe listen --forward-to localhost:3000/api/stripe/webhook
 */

import { NextResponse } from "next/server";
import { handleStripeWebhook } from "@/app/lib/integrations";
import { logRevenue } from "@/app/lib/finance/ledger";

export const runtime = "nodejs"; // Required — Stripe needs raw body buffer

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const body = await request.text(); // Raw text for signature verification

  // Verify signature
  const verification = await handleStripeWebhook(body, signature);
  if (!verification.ok) {
    console.error("[stripe/webhook] Signature verification failed:", verification.rawError);
    return NextResponse.json({ error: verification.message }, { status: 400 });
  }

  // Parse event (already verified — safe to parse)
  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(body) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const obj = event.data.object;
  const isSandbox = process.env.STRIPE_MODE !== "live";

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = obj as {
          amount_total?: number;
          currency?: string;
          id?: string;
          payment_status?: string;
        };
        if (session.payment_status === "paid" && session.amount_total) {
          await logRevenue({
            amount: session.amount_total / 100, // Stripe amounts are in cents
            source: "stripe_payment",
            description: `Checkout session ${session.id}`,
            stripeFee: 0, // Fee details come from separate charge event
            sandbox: isSandbox,
          });
        }
        break;
      }

      case "payment_intent.succeeded": {
        const intent = obj as {
          amount?: number;
          id?: string;
        };
        if (intent.amount) {
          await logRevenue({
            amount: intent.amount / 100,
            source: "stripe_payment",
            description: `Payment intent ${intent.id}`,
            sandbox: isSandbox,
          });
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = obj as {
          amount_paid?: number;
          id?: string;
          subscription?: string;
        };
        if (invoice.amount_paid) {
          await logRevenue({
            amount: invoice.amount_paid / 100,
            source: "stripe",
            description: `Invoice ${invoice.id}${invoice.subscription ? ` (subscription ${invoice.subscription})` : ""}`,
            sandbox: isSandbox,
          });
        }
        break;
      }

      case "charge.refunded": {
        const charge = obj as {
          amount_refunded?: number;
          id?: string;
        };
        if (charge.amount_refunded) {
          await logRevenue({
            amount: 0,
            source: "stripe",
            description: `Refund on charge ${charge.id}`,
            refund: charge.amount_refunded / 100,
            sandbox: isSandbox,
          });
        }
        break;
      }

      default:
        // Acknowledge unhandled events without error
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[stripe/webhook] Failed to process ${event.type}:`, message);
    // Return 200 so Stripe doesn't retry — we'll log the error
    return NextResponse.json({ received: true, processed: false, error: message });
  }

  return NextResponse.json({ received: true, processed: true, type: event.type });
}
