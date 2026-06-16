import { NextResponse } from "next/server";
import { getPrismaClient } from "@/app/lib/prisma";
import { getStageForRevenue, revenueToNextStage } from "@/app/lib/world/stages";

export async function GET() {
  const prisma = getPrismaClient();

  if (!prisma) {
    return NextResponse.json({
      worldState: null,
      worldClock: null,
      stage: null,
      nextStage: null,
      error: "Database not connected.",
    }, { status: 424 });
  }

  const [worldState, worldClock, capitalAccount] = await Promise.all([
    prisma.worldState.findFirst({ where: { id: "world-singleton" } }),
    (prisma as any).worldClock.findFirst({ where: { id: "clock-singleton" } }),
    prisma.capitalAccount.findFirst({ where: { id: "capital-singleton" } }),
  ]);

  const gross = Number(worldState?.grossRevenue ?? 0);
  const stage = getStageForRevenue(gross);
  const progression = revenueToNextStage(gross);

  return NextResponse.json({
    worldState,
    worldClock,
    capitalAccount,
    stage,
    nextStage: progression.next,
    revenueToNextStage: progression.needed,
    stageProgress: progression.progress,
    checkedAt: new Date().toISOString(),
  });
}

export async function PATCH(request: Request) {
  const prisma = getPrismaClient();
  if (!prisma) {
    return NextResponse.json({ error: "Database not connected." }, { status: 424 });
  }

  const body = (await request.json()) as { timeOfDay?: number; dayNumber?: number };

  const updated = await (prisma as any).worldClock.update({
    where: { id: "clock-singleton" },
    data: {
      ...(body.timeOfDay !== undefined ? { timeOfDay: body.timeOfDay } : {}),
      ...(body.dayNumber !== undefined ? { dayNumber: body.dayNumber } : {}),
    },
  });

  return NextResponse.json({ worldClock: updated });
}
