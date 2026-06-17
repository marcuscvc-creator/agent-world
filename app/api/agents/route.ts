import { NextResponse } from "next/server";
import { getPrismaClient } from "@/app/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const prisma = getPrismaClient();

  if (!prisma) {
    return NextResponse.json({ agents: [], error: "Database not connected." }, { status: 424 });
  }

  try {
    const agents = await prisma.agent.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: {
            tasks: true,
            approvals: true,
          },
        },
      },
    });
    return NextResponse.json({ agents });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/agents] Prisma error:", message);
    return NextResponse.json({ agents: [], error: message }, { status: 500 });
  }
}
