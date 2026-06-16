import { getPrismaClient } from "@/app/lib/prisma";
import { PageHeader, Badge, StatCard, EmptyState, riskTone } from "@/app/components/ui";
import { ApprovalQueue } from "./ApprovalQueue";

export default async function ApprovalsPage() {
  const prisma = getPrismaClient();

  const [pending, resolved] = prisma
    ? await Promise.all([
        prisma.approvalRequest.findMany({
          where: { status: "PENDING" },
          orderBy: { requestedAt: "desc" },
          include: { agent: { select: { name: true, role: true } } },
        }),
        prisma.approvalRequest.findMany({
          where: { status: { not: "PENDING" } },
          orderBy: { requestedAt: "desc" },
          take: 50,
          include: { agent: { select: { name: true, role: true } } },
        }),
      ])
    : [[], []];

  const executed = resolved.filter((a) => a.status === "EXECUTED").length;
  const rejected = resolved.filter((a) => a.status === "REJECTED").length;
  const modified = resolved.filter((a) => a.status === "MODIFICATION_REQUESTED").length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Approvals"
        subtitle="All agent actions requiring human sign-off before execution"
      />

      {!prisma && (
        <EmptyState icon="⚡" title="Database not connected" description="Run pnpm db:setup to activate the approval system." />
      )}

      {prisma && (
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Pending" value={pending.length} accent="amber" />
            <StatCard label="Executed" value={executed} accent="green" />
            <StatCard label="Rejected" value={rejected} accent="rose" />
            <StatCard label="Modification" value={modified} accent="blue" />
          </div>

          {/* Pending queue — interactive client component */}
          <section>
            <p className="mb-3 font-mono text-xs uppercase tracking-widest text-[#8fe0ff]">
              Pending ({pending.length})
            </p>
            {pending.length === 0 ? (
              <EmptyState icon="✓" title="Nothing pending" description="All clear — agents are working or idle." />
            ) : (
              <ApprovalQueue approvals={pending as never} />
            )}
          </section>

          {/* Resolved history */}
          {resolved.length > 0 && (
            <section>
              <p className="mb-3 font-mono text-xs uppercase tracking-widest text-[#8fe0ff]">
                History ({resolved.length})
              </p>
              <div className="space-y-2">
                {resolved.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 rounded border border-[#2a1f3d] bg-[#0f0d1a] px-4 py-3"
                  >
                    <Badge
                      label={a.status.replace("_", " ")}
                      tone={
                        a.status === "EXECUTED" ? "good"
                        : a.status === "REJECTED" ? "danger"
                        : "warn"
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-sm text-[#d7ddc8]">
                        {a.title ?? a.actionType}
                      </p>
                      <p className="text-xs text-[#7a7090]">
                        {a.agent?.name ?? "Agent"} · {new Date(a.requestedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge label={a.riskLevel} tone={riskTone(a.riskLevel)} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
