"use server";

import { runNextAgent, runSingleAgent } from "@/app/lib/agent/runner";

/**
 * Server action — called directly from client components.
 * Runs a single specific agent by ID.
 */
export async function triggerAgentRun(agentId: string) {
  return runSingleAgent(agentId);
}

/**
 * Server action — picks the next IDLE agent (round-robin by oldest updatedAt)
 * and runs it. One call = one agent, designed to stay under Vercel Hobby's 10s limit.
 * Call this 8 times from the client to cycle through all agents.
 */
export async function triggerNextAgent() {
  return runNextAgent();
}
