import { NextResponse } from "next/server";
import { getPrismaClient } from "@/app/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const prisma = getPrismaClient();
  if (!prisma) return NextResponse.json({ tasks: [], error: "Database not connected." }, { status: 424 });
  const tasks = await prisma.task.findMany({
    orderBy: { createdAt: "desc" },
    include: { agent: { select: { name: true, role: true } } },
  });
  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
  const prisma = getPrismaClient();
  if (!prisma) return NextResponse.json({ error: "Database not connected." }, { status: 424 });

  const body = (await request.json()) as { title: string; goal: string; agentId: string };
  if (!body.title || !body.goal || !body.agentId) {
    return NextResponse.json({ error: "title, goal, and agentId are required." }, { status: 400 });
  }

  const task = await prisma.task.create({
    data: { title: body.title, goal: body.goal, agentId: body.agentId },
  });

  return NextResponse.json({ task }, { status: 201 });
}
