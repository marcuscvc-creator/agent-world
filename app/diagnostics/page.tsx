import type { ReactNode } from "react";
import { getAgentWorldConfig } from "@/app/lib/config";
import { getPrismaClient } from "@/app/lib/prisma";
import { getExecutionMode, getIntegrationConnections } from "@/app/lib/integrations";

const envChecks = [
  "SLACK_WEBHOOK_URL",
  "SLACK_BOT_TOKEN",
  "SLACK_CHANNEL_ID",
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "OPENAI_API_KEY",
  "DEFAULT_MODEL",
  "DATABASE_URL",
  "RESEND_API_KEY",
  "VERCEL_TOKEN",
  "ALLOW_REAL_WORLD_ACTIONS",
  "REQUIRE_HUMAN_APPROVAL",
  "ALLOW_WEB_SEARCH",
  "REQUIRE_APPROVAL_FOR_WEB_SEARCH",
  "OPENAI_MONTHLY_BUDGET",
  "MAX_AGENT_RUNS_PER_DAY",
  "MAX_WEB_SEARCHES_PER_DAY",
  "MAX_DAILY_SPEND_WITHOUT_APPROVAL"
];

export default async function DiagnosticsPage() {
  const config = getAgentWorldConfig();
  const integrations = getIntegrationConnections();
  const slack = integrations.find((item) => item.provider === "slack");
  const stripe = integrations.find((item) => item.provider === "stripe");
  const prisma = getPrismaClient();

  const [capital, externalActionLogs, spendingRequests] = prisma
    ? await Promise.all([
        prisma.capitalAccount.findFirst({ where: { id: "capital-singleton" } }),
        prisma.externalActionLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
        prisma.spendingRequest.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
      ])
    : [null, [], []];

  return (
    <main className="min-h-screen px-4 py-4 text-[#f7f1dc] md:px-6">
      <div className="mx-auto flex max-w-[1300px] flex-col gap-4">
        <section className="pixel-panel rounded p-5">
          <p className="font-pixel text-xs uppercase text-[#8fe0ff]">Diagnostics</p>
          <h1 className="mt-1 font-pixel text-2xl text-[#fff1a8]">Agent World System Health</h1>
          <p className="mt-2 text-sm text-[#d7ddc8]">Execution mode: {getExecutionMode()}</p>
          <p className="mt-1 text-sm text-[#d7ddc8]">Default model: {config.defaultModel}</p>
          {!prisma && (
            <p className="mt-2 rounded border border-rose-400 bg-rose-400/10 p-2 text-sm text-rose-100">
              DATABASE_URL is not set. Run prisma migrate dev and seed the database to activate live data.
            </p>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <Panel title="Env Presence">
            {envChecks.map((key) => (
              <p key={key} className="rounded border border-[#4b4058] bg-[#181622] p-2 text-sm">
                {key}: <span className={process.env[key] ? "text-emerald-200" : "text-rose-200"}>{process.env[key] ? "present" : "missing"}</span>
              </p>
            ))}
          </Panel>
          <Panel title="Integration Tests">
            <p>Slack: {slack?.status ?? "unknown"} / {slack?.mode ?? "none"}</p>
            <p>Stripe: {stripe?.status ?? "unknown"} / {stripe?.mode ?? "none"}</p>
            <p className="mt-3 rounded border border-rose-300 bg-rose-400/10 p-2 text-rose-100">
              {slack?.status === "not_connected" ? "Blocked: Slack approvals and previews cannot be delivered." : "Slack configured; run the setup test to verify delivery."}
            </p>
          </Panel>
          <Panel title="Capital Account">
            {capital ? (
              <>
                <p>Available capital: ${Number(capital.availableCapital).toFixed(2)}</p>
                <p>Generated revenue: ${Number(capital.generatedRevenue).toFixed(2)}</p>
                <p>Approved spending: ${Number(capital.approvedSpending).toFixed(2)}</p>
                <p>Rejected spending: ${Number(capital.rejectedSpending).toFixed(2)}</p>
                <p>Net profit: ${Number(capital.netProfit).toFixed(2)}</p>
              </>
            ) : (
              <p className="text-[#7a7090]">No data yet — seed the database first.</p>
            )}
          </Panel>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Panel title="Production Guardrails">
            <p>Real-world actions: {config.allowRealWorldActions ? "enabled" : "blocked"}</p>
            <p>Human approval: {config.requireHumanApproval ? "required" : "not required"}</p>
            <p>Web search: {config.allowWebSearch ? "enabled" : "disabled"}</p>
            <p>Web search approval: {config.requireApprovalForWebSearch ? "required" : "not required"}</p>
            <p>OpenAI monthly budget: ${config.openaiMonthlyBudget}</p>
            <p>Max agent runs/day: {config.maxAgentRunsPerDay}</p>
            <p>Max web searches/day: {config.maxWebSearchesPerDay}</p>
            <p>Max daily spend without approval: ${config.maxDailySpendWithoutApproval}</p>
          </Panel>
          <Panel title="Integration Mode">
            {integrations.map((integration) => (
              <p key={integration.id}>{integration.provider}: {integration.status} / {integration.mode}</p>
            ))}
          </Panel>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Panel title="Recent External Action Logs">
            {externalActionLogs.length === 0 ? (
              <p className="text-[#7a7090]">No external actions logged yet.</p>
            ) : (
              externalActionLogs.map((log) => (
                <article key={log.id} className="rounded border border-[#4b4058] bg-[#181622] p-3">
                  <p className="font-pixel text-sm text-[#fff1a8]">{log.provider} / {log.actionType}</p>
                  <p className="mt-1 text-sm">Status: {log.status}</p>
                  {log.errorMessage ? <p className="mt-1 text-sm text-rose-100">{log.errorMessage}</p> : null}
                </article>
              ))
            )}
          </Panel>
          <Panel title="Spending Requests">
            {spendingRequests.length === 0 ? (
              <p className="text-[#7a7090]">No spending requests yet.</p>
            ) : (
              spendingRequests.map((req) => (
                <article key={req.id} className="rounded border border-[#4b4058] bg-[#181622] p-3">
                  <p className="font-pixel text-sm text-[#fff1a8]">${Number(req.amount).toFixed(2)} / {req.category}</p>
                  <p className="mt-1 text-sm">{req.reason}</p>
                  <p className="mt-1 text-xs text-[#aeb7a4]">Status: {req.status}</p>
                </article>
              ))
            )}
          </Panel>
        </section>
      </div>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pixel-panel rounded p-4">
      <h2 className="font-pixel text-xl text-[#fff1a8]">{title}</h2>
      <div className="mt-4 space-y-2 text-sm text-[#d7ddc8]">{children}</div>
    </section>
  );
}
