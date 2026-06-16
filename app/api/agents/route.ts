import { NextResponse } from "next/server";
import { getPrismaClient } from "@/app/lib/prisma";

export async function GET() {
  const prisma = getPrismaClient();

  if (!prisma) {
    return NextResponse.json({ agents: [], error: "Database not connected." }, { status: 424 });
  }

  const agents = await prisma.agent.findMany({
    orderBy: { name: "asc" },
    include: {
      // memories count requires `prisma generate` to be run first after schema update
      _count: {
        select: {
          tasks: true,
          approvals: true,
        },
      },
    },
  });

  return NextResponse.json({ agents });
}
