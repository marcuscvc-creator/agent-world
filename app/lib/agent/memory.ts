import { getPrismaClient } from "../prisma";

export type MemoryType = "observation" | "decision" | "learning" | "goal";

export type MemoryEntry = {
  id: string;
  agentId: string;
  type: MemoryType;
  content: string;
  relevance: number;
  createdAt: Date;
};

/**
 * Read the most relevant memories for an agent.
 * By default returns the 20 highest-relevance entries.
 */
export async function readMemory(
  agentId: string,
  options: { limit?: number; type?: MemoryType } = {}
): Promise<MemoryEntry[]> {
  const prisma = getPrismaClient();
  if (!prisma) return [];

  const entries = await (prisma as any).agentMemory.findMany({
    where: {
      agentId,
      ...(options.type ? { type: options.type } : {}),
    },
    orderBy: [{ relevance: "desc" }, { createdAt: "desc" }],
    take: options.limit ?? 20,
  });

  return entries as MemoryEntry[];
}

/**
 * Write a new memory entry for an agent.
 */
export async function writeMemory(
  agentId: string,
  entry: { type: MemoryType; content: string; relevance?: number }
): Promise<MemoryEntry | null> {
  const prisma = getPrismaClient();
  if (!prisma) return null;

  const created = await (prisma as any).agentMemory.create({
    data: {
      agentId,
      type: entry.type,
      content: entry.content,
      relevance: entry.relevance ?? 50,
    },
  });

  return created as MemoryEntry;
}

/**
 * Build a compact memory context string to inject into agent prompts.
 * Summarises the agent's most relevant memories as bullet points.
 */
export async function buildMemoryContext(agentId: string): Promise<string> {
  const memories = await readMemory(agentId, { limit: 12 });
  if (memories.length === 0) return "No prior memories.";

  return memories
    .map((m) => `[${m.type.toUpperCase()}] ${m.content}`)
    .join("\n");
}

/**
 * Decay old low-relevance memories to keep the memory footprint clean.
 * Deletes entries with relevance < 20 that are older than 30 days.
 */
export async function pruneStaleMemories(agentId: string): Promise<number> {
  const prisma = getPrismaClient();
  if (!prisma) return 0;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await (prisma as any).agentMemory.deleteMany({
    where: {
      agentId,
      relevance: { lt: 20 },
      createdAt: { lt: thirtyDaysAgo },
    },
  });

  return result.count;
}
