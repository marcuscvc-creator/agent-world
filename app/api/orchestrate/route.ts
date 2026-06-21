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

  // HARD STOP — agents are paused by owner. Remove this block when ready to reactivate.
  return NextResponse.json({ skipped: true, reason: "All agents paused by owner. Reactivate via DB before restarting." });
}

export async function GET() {
  // HARD STOP — agents are paused by owner. Remove this block when ready to reactivate.
  return NextResponse.json({ skipped: true, reason: "All agents paused by owner. Reactivate via DB before restarting." });
}
