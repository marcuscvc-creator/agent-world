/**
 * /api/orchestrate
 * The new cron target. Runs every minute.
 * Most cycles cost $0 — only wakes agents when something meaningful changed.
 */

import { NextResponse } from "next/server";
import { runOrchestrator } from "@/app/lib/agent/orchestrator";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Block callers that present a wrong CRON_SECRET, but allow browser POSTs (no auth header)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== null && auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await runOrchestrator();
  return NextResponse.json(result);
}

export async function GET() {
  // Allow manual GET trigger from dashboard
  const result = await runOrchestrator();
  return NextResponse.json(result);
}
