import { NextResponse } from "next/server";
import { getPrismaClient } from "@/app/lib/prisma";
import { writeMemory } from "@/app/lib/agent/memory";
import type { MemoryType } from "@/app/lib/agent/memory";

export async function GET(request: Request) {
  const prisma = getPrismaClient();
  if (!prisma) {
    return NextResponse.json({ memories: [], error: "Database not connected." }, { status: 424 });
  }

  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId");

  const memories = await (prisma as any).agentMemory.findMany({
    where: agentId ? { agentId } : {},
    orderBy: [{ relevance: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: { agent: { select: { id: true, name: true, role: true } } },
  });

  return NextResponse.json({ memories });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    agentId: string;
    type: MemoryType;
    content: string;
    relevance?: number;
  };

  if (!body.agentId || !body.type || !body.content) {
    return NextResponse.json({ error: "agentId, type, and content are required." }, { status: 400 });
  }

  const memory = await writeMemory(body.agentId, {
    type: body.type,
    content: body.content,
    relevance: body.relevance,
  });

  if (!memory) {
    return NextResponse.json({ error: "Database not connected." }, { status: 424 });
  }

  return NextResponse.json({ memory }, { status: 201 });
}
