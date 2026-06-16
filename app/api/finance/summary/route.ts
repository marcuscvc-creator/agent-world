import { NextResponse } from "next/server";
import { getPLStatement, getBurnRate, getMonthlyData, getPLByAgent, getPLByBusiness } from "@/app/lib/finance/reports";
import type { FinancialPeriod } from "@/app/lib/finance/reports";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const period = (searchParams.get("period") ?? "all") as FinancialPeriod;

  const validPeriods: FinancialPeriod[] = ["today", "7d", "30d", "monthly", "all"];
  if (!validPeriods.includes(period)) {
    return NextResponse.json({ error: `Invalid period. Use: ${validPeriods.join(", ")}` }, { status: 400 });
  }

  const [pl, burnRate, monthly, byAgent, byBusiness] = await Promise.all([
    getPLStatement(period),
    getBurnRate(),
    getMonthlyData(6),
    getPLByAgent(),
    getPLByBusiness(),
  ]);

  return NextResponse.json({
    period,
    pl,
    burnRate,
    monthly,
    byAgent,
    byBusiness,
    generatedAt: new Date().toISOString(),
  });
}
