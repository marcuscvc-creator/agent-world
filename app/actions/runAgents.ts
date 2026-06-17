"use server";

import { runAgentLoop, runSingleAgent } from "@/app/lib/agent/runner";

/**
 * Server action — called directly from client components.
 * Runs all eligible agents (or a single agent if agentId is supplied).
 * Executes on the server so it has full DB + env var access with no secret exposure.
 */
export async function triggerAgentRun(agentId?: string) {
  if (agentId) {
    return runSingleAgent(agentId);
  }
  return runAgentLoop();
}
