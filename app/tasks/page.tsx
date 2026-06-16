import { getPrismaClient } from "@/app/lib/prisma";
import { PageHeader, Badge, StatCard, EmptyState } from "@/app/components/ui";
import { CreateTaskForm } from "./CreateTaskForm";

const COLUMNS = [
  { status: "QUEUED", label: "Queued", tone: "neutral" as const },
  { status: "IN_PROGRESS", label: "In Progress", tone: "info" as const },
  { status: "WAITING_APPROVAL", label: "Waiting Approval", tone: "warn" as const },
  { status: "COMPLETED", label: "Completed", tone: "good" as const },
  { status: "FAILED", label: "Failed", tone: "danger" as const },
];

export default async function TasksPage() {
  const prisma = getPrismaClient();

  const [tasks, agents] = prisma
    ? await Promise.all([
        prisma.task.findMany({
          orderBy: { createdAt: "desc" },
          include: { agent: { select: { name: true, role: true } } },
        }),
        prisma.agent.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, role: true } }),
      ])
    : [[], []];

  const byStatus = (status: string) => tasks.filter((t) => t.status === status);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Tasks"
        subtitle={`${tasks.length} total · ${byStatus("IN_PROGRESS").length} in progress`}
        action={<CreateTaskForm agents={agents} />}
      />

      {!prisma && (
        <EmptyState icon="⚡" title="Database not connected" description="Run pnpm db:setup to activate task tracking." />
      )}

      {prisma && (
        <div className="flex flex-1 gap-4 overflow-x-auto overflow-y-hidden p-6">
          {COLUMNS.map(({ status, label, tone }) => {
            const col = byStatus(status);
            return (
              <div key={status} className="flex w-72 flex-shrink-0 flex-col gap-3">
                {/* Column header */}
                <div className="flex items-center justify-between">
                  <p className="font-mono text-xs uppercase tracking-widest text-[#8fe0ff]">{label}</p>
                  <Badge label={String(col.length)} tone={tone} />
                </div>

                {/* Cards */}
                <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
                  {col.length === 0 ? (
                    <div className="rounded border border-dashed border-[#2a1f3d] p-4 text-center">
                      <p className="text-xs text-[#4a4060]">Empty</p>
                    </div>
                  ) : (
                    col.map((task) => (
                      <div
                        key={task.id}
                        className="rounded border border-[#2a1f3d] bg-[#0f0d1a] p-3 transition-colors hover:border-[#7c3aed]/30"
                      >
                        <p className="font-mono text-xs font-semibold text-[#fff1a8]">{task.title}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-[#d7ddc8]">{task.goal}</p>
                        <div className="mt-2 flex items-center justify-between text-xs text-[#7a7090]">
                          <span>{task.agent?.name ?? "Unassigned"}</span>
                          {task.approvalNeeded && <Badge label="needs approval" tone="warn" />}
                        </div>
                        {task.result && (
                          <p className="mt-2 line-clamp-1 rounded bg-[#181622] px-2 py-1 text-xs text-[#4ade80]">
                            {task.result}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
