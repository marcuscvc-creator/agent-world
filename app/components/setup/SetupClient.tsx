"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDollarSign, Database, Mail, RefreshCw, Search, Settings, ShieldAlert, Slack, Zap } from "lucide-react";
import type { SetupStatus, IntegrationConnection } from "@/app/lib/types";

type TestResult = {
  provider: string;
  status: "passed" | "failed";
  testedAt: string;
  result: {
    ok: boolean;
    message: string;
    rawError?: string;
  };
};

const icons = {
  slack: Slack,
  stripe: CircleDollarSign,
  vercel: Zap,
  resend: Mail,
  openai: Settings,
  database: Database,
  web_search: Search
};

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export function SetupClient() {
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [loading, setLoading] = useState<string | null>(null);

  async function loadStatus() {
    const response = await fetch("/api/integrations/status");
    setSetup(await response.json());
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function test(provider: "slack" | "stripe") {
    setLoading(provider);
    try {
      const response = await fetch(`/api/integrations/${provider}/test`, { method: "POST" });
      const json = await response.json();
      setResults((current) => ({ ...current, [provider]: json }));
    } finally {
      setLoading(null);
      loadStatus();
    }
  }

  if (!setup) {
    return <main className="min-h-screen px-6 py-6 text-[#f7f1dc]">Loading setup...</main>;
  }

  const slackConnected = results.slack?.status === "passed" || setup.integrations.find((item) => item.provider === "slack")?.status === "connected";
  const stripeConnected = results.stripe?.status === "passed" || setup.integrations.find((item) => item.provider === "stripe")?.status === "connected";

  return (
    <main className="min-h-screen px-4 py-4 text-[#f7f1dc] md:px-6">
      <div className="mx-auto flex max-w-[1300px] flex-col gap-4">
        <section className="pixel-panel rounded p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-pixel text-xs uppercase text-[#8fe0ff]">Agent World Setup</p>
              <h1 className="mt-1 font-pixel text-2xl text-[#fff1a8]">Live Integrations</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#d7ddc8]">Connect external services for supervised execution. Agents start with $0 and cannot spend or execute high-risk actions without approval.</p>
            </div>
            <div className="rounded border border-[#4b4058] bg-[#181622] px-4 py-3">
              <p className="text-xs uppercase text-[#aeb7a4]">Execution Mode</p>
              <p className="mt-1 font-pixel text-xl text-[#fff1a8]">{setup.executionMode}</p>
            </div>
          </div>
        </section>

        {!stripeConnected ? (
          <Alert text="Connect Stripe to allow Agent World to create products, payment links, and track real revenue." />
        ) : null}
        {!slackConnected ? (
          <Alert text="Connect Slack so agents can send previews, reports, and approval requests." />
        ) : null}
        {!setup.slackBlocking.ok ? (
          <Alert text="Slack is not connected. Agents cannot send approvals or previews until Slack is working." severe />
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {setup.integrations.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              result={results[integration.provider]}
              loading={loading === integration.provider}
              onTest={integration.provider === "slack" ? () => test("slack") : integration.provider === "stripe" ? () => test("stripe") : undefined}
            />
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="pixel-panel rounded p-4">
            <p className="font-pixel text-xs uppercase text-[#8fe0ff]">Slack Blocking Dependency</p>
            <h2 className="mt-1 font-pixel text-xl text-[#fff1a8]">Approval Safety Gate</h2>
            <p className="mt-3 text-sm leading-6 text-[#d7ddc8]">{setup.slackBlocking.message}</p>
            <div className="mt-3 space-y-2">
              {setup.slackBlocking.diagnostics.map((item) => (
                <p key={item} className="rounded border border-[#4b4058] bg-[#181622] p-2 text-sm text-[#d7ddc8]">{item}</p>
              ))}
            </div>
          </div>
          <div className="pixel-panel rounded p-4">
            <p className="font-pixel text-xs uppercase text-[#8fe0ff]">Capital Account</p>
            <h2 className="mt-1 font-pixel text-xl text-[#fff1a8]">$0 Bootstrap Mode</h2>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <Metric label="Available" value={`$${setup.capital.availableCapital}`} />
              <Metric label="Revenue" value={`$${setup.capital.generatedRevenue}`} />
              <Metric label="Reinvest" value={`$${setup.capital.reinvestmentBudget}`} />
              <Metric label="Net Profit" value={`$${setup.capital.netProfit}`} />
            </div>
          </div>
        </section>

        {setup.guardrails ? (
          <section className="pixel-panel rounded p-4">
            <p className="font-pixel text-xs uppercase text-[#8fe0ff]">Supervised Live Guardrails</p>
            <h2 className="mt-1 font-pixel text-xl text-[#fff1a8]">Execution Policy</h2>
            <div className="mt-4 grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-4">
              <Metric label="Real Actions" value={setup.guardrails.allowRealWorldActions ? "enabled" : "blocked"} />
              <Metric label="Approval Required" value={setup.guardrails.requireHumanApproval ? "yes" : "no"} />
              <Metric label="Web Search" value={setup.guardrails.allowWebSearch ? "enabled" : "disabled"} />
              <Metric label="Daily Free Spend" value={`$${setup.guardrails.maxDailySpendWithoutApproval}`} />
              <Metric label="OpenAI Budget" value={`$${setup.guardrails.openaiMonthlyBudget}/mo`} />
              <Metric label="Agent Runs" value={`${setup.guardrails.maxAgentRunsPerDay}/day`} />
              <Metric label="Web Searches" value={`${setup.guardrails.maxWebSearchesPerDay}/day`} />
              <Metric label="Search Approval" value={setup.guardrails.requireApprovalForWebSearch ? "required" : "not required"} />
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function Alert({ text, severe = false }: { text: string; severe?: boolean }) {
  return (
    <div className={`flex items-start gap-3 rounded border px-4 py-3 text-sm ${severe ? "border-rose-300 bg-rose-400/15 text-rose-100" : "border-amber-300 bg-amber-400/15 text-amber-100"}`}>
      <ShieldAlert size={18} />
      <p>{text}</p>
    </div>
  );
}

function IntegrationCard({ integration, result, loading, onTest }: { integration: IntegrationConnection; result?: TestResult; loading: boolean; onTest?: () => void }) {
  const Icon = icons[integration.provider];
  const currentStatus = result ? (result.status === "passed" ? "connected" : "failed") : integration.status;

  return (
    <article className="pixel-panel rounded p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-pixel text-xs uppercase text-[#8fe0ff]">{integration.provider}</p>
          <h2 className="mt-1 font-pixel text-xl text-[#fff1a8]">{integration.provider === "resend" ? "Resend / Email" : integration.provider}</h2>
        </div>
        <Icon className="text-[#f0c14b]" />
      </div>
      <div className="mt-4 flex items-center gap-2">
        {currentStatus === "connected" ? <CheckCircle2 className="text-emerald-300" size={18} /> : <AlertTriangle className="text-amber-300" size={18} />}
        <p className="text-sm capitalize text-[#f7f1dc]">{statusLabel(currentStatus)}</p>
      </div>
      <p className="mt-2 text-xs uppercase text-[#aeb7a4]">Mode: {integration.mode}</p>
      <div className="mt-3 space-y-1 text-xs text-[#cfd4bf]">
        {Object.entries(integration.metadataJson).map(([key, value]) => (
          <p key={key}>{key}: {String(value)}</p>
        ))}
      </div>
      {result ? (
        <div className={`mt-3 rounded border p-2 text-xs ${result.status === "passed" ? "border-emerald-300 bg-emerald-400/10 text-emerald-100" : "border-rose-300 bg-rose-400/10 text-rose-100"}`}>
          <p>{result.result.message}</p>
          {result.result.rawError ? <p className="mt-1 text-rose-100">{result.result.rawError}</p> : null}
        </div>
      ) : null}
      {onTest ? (
        <button className="mt-4 inline-flex items-center gap-2 rounded border-2 border-[#2a2234] bg-[#67a768] px-3 py-2 text-sm font-bold text-[#14231a] shadow-[0_3px_0_#2a2234]" onClick={onTest} disabled={loading}>
          <RefreshCw size={15} />
          {integration.provider === "slack" ? "Send Test Slack Message" : "Test Connection"}
        </button>
      ) : (
        <p className="mt-4 text-xs text-[#aeb7a4]">Configure env vars, then test from diagnostics.</p>
      )}
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-[#4b4058] bg-[#181622] p-3">
      <p className="text-xs uppercase text-[#aeb7a4]">{label}</p>
      <p className="mt-1 font-pixel text-lg text-[#fff1a8]">{value}</p>
    </div>
  );
}
