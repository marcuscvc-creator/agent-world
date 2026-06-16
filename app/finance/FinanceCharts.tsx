"use client";

import type { MonthlyDataPoint } from "@/app/lib/finance/reports";

export function FinanceCharts({ data }: { data: MonthlyDataPoint[] }) {
  if (data.length === 0) return null;

  const maxVal = Math.max(...data.flatMap((d) => [d.revenue, d.expenses]), 1);

  return (
    <div className="space-y-4">
      {/* Bar chart */}
      <div className="flex items-end gap-2" style={{ height: 120 }}>
        {data.map((d) => (
          <div key={d.month} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full items-end gap-0.5" style={{ height: 90 }}>
              <div
                className="flex-1 rounded-t bg-[#4ade80]/60"
                style={{ height: `${(d.revenue / maxVal) * 100}%` }}
                title={`Revenue: $${d.revenue.toFixed(2)}`}
              />
              <div
                className="flex-1 rounded-t bg-rose-400/50"
                style={{ height: `${(d.expenses / maxVal) * 100}%` }}
                title={`Expenses: $${d.expenses.toFixed(2)}`}
              />
            </div>
            <span className="font-mono text-xs text-[#4a4060]">{d.month.split(" ")[0]}</span>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex gap-4 font-mono text-xs text-[#7a7090]">
        <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-[#4ade80]/60" /> Revenue</span>
        <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-rose-400/50" /> Expenses</span>
      </div>

      {/* Table */}
      <div className="space-y-1">
        {data.map((d) => (
          <div key={d.month} className="flex items-center gap-3 text-xs">
            <span className="w-20 font-mono text-[#7a7090]">{d.month}</span>
            <span className="font-mono text-[#4ade80]">${d.revenue.toFixed(2)}</span>
            <span className="font-mono text-rose-300">-${d.expenses.toFixed(2)}</span>
            <span className={`font-mono ${d.profit >= 0 ? "text-[#4ade80]" : "text-rose-300"}`}>
              = ${d.profit.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
