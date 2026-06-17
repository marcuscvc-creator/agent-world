import { getAgentWorldConfig } from "@/app/lib/config";
import { getIntegrationConnections } from "@/app/lib/integrations";
import { getPrismaClient } from "@/app/lib/prisma";
import { PageHeader, Panel, Badge, StatCard } from "@/app/components/ui";

export const dynamic = "force-dynamic";

const ENV_VARS = [
  { key: "DATABASE_URL",                     label: "Database",            group: "Core",        required: true },
  { key: "OPENAI_API_KEY",                   label: "OpenAI",              group: "Core",        required: true },
  { key: "SLACK_WEBHOOK_URL",                label: "Slack Webhook",       group: "Slack",       required: false },
  { key: "SLACK_BOT_TOKEN",                  label: "Slack Bot Token",     group: "Slack",       required: false },
  { key: "SLACK_CHANNEL_ID",                 label: "Slack Channel ID",    group: "Slack",       required: false },
  { key: "STRIPE_SECRET_KEY",                label: "Stripe Secret",       group: "Stripe",      required: false },
  { key: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", label: "Stripe Publishable", group: "Stripe",    required: false },
  { key: "STRIPE_WEBHOOK_SECRET",            label: "Stripe Webhook",      group: "Stripe",      required: false },
  { key: "BRAVE_SEARCH_API_KEY",             label: "Brave Search",        group: "Search",      required: false },
  { key: "SERPER_API_KEY",                   label: "Serper Search",       group: "Search",      required: false },
  { key: "CRON_SECRET",                      label: "Cron Secret",         group: "Security",    required: false },
  { key: "DEFAULT_MODEL",                    label: "Default Model",       group: "AI",          required: false },
  { key: "ALLOW_REAL_WORLD_ACTIONS",         label: "Allow Real Actions",  group: "Guardrails",  required: false },
  { key: "REQUIRE_HUMAN_APPROVAL",           label: "Require Approval",    group: "Guardrails",  required: false },
  { key: "OPENAI_MONTHLY_BUDGET",            label: "OpenAI Budget",       group: "Guardrails",  required: false },
  { key: "MAX_AGENT_RUNS_PER_DAY",           label: "Max Daily Runs",      group: "Guardrails",  required: false },
  { key: "MAX_DAILY_SPEND_WITHOUT_APPROVAL", label: "Auto-spend Limit",    group: "Guardrails",  required: false },
];

const GROUPS = ["Core", "Slack", "Stripe", "Search", "AI", "Security", "Guardrails"];

export default async function SettingsPage() {
  const config = getAgentWorldConfig();
  const integrations = getIntegrationConnections();
  const prisma = getPrismaClient();

  const notifPrefs = prisma
    ? await prisma.notificationPreference.findFirst().catch(() => null)
    : null;

  const envPresent = ENV_VARS.reduce<Record<string, boolean>>((acc, { key }) => {
    acc[key] = Boolean(process.env[key]);
    return acc;
  }, {});

  const missingRequired = ENV_VARS.filter(({ key, required }) => required && !envPresent[key]);
  const connected = integrations.filter((i) => i.status === "connected").length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Settings"
        subtitle={`${connected}/${integrations.length} integrations connected · ${missingRequired.length} required vars missing`}
      />

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
        {/* Guardrail summary */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Runtime Mode"
            value={config.runtimeMode}
            accent="purple"
          />
          <StatCard
            label="Real Actions"
            value={config.allowRealWorldActions ? "ENABLED" : "BLOCKED"}
            accent={config.allowRealWorldActions ? "green" : "rose"}
          />
          <StatCard
            label="Human Approval"
            value={config.requireHumanApproval ? "REQUIRED" : "OPTIONAL"}
            accent={config.requireHumanApproval ? "amber" : "blue"}
          />
          <StatCard
            label="Monthly AI Budget"
            value={`$${config.openaiMonthlyBudget}`}
            accent="blue"
          />
        </div>

        {/* Missing required env vars */}
        {missingRequired.length > 0 && (
          <Panel title="⚠️ Missing Required Configuration">
            <p className="mb-3 text-sm text-[#d7ddc8]">
              Add these to your <code className="rounded bg-[#181622] px-1 py-0.5 text-xs text-[#ff2d78]">.env.local</code> to unlock full functionality:
            </p>
            <div className="space-y-1">
              {missingRequired.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2 rounded border border-rose-400/30 bg-rose-400/5 px-3 py-2">
                  <Badge label="missing" tone="danger" />
                  <span className="font-mono text-xs text-rose-200">{key}</span>
                  <span className="text-xs text-[#7a7090]">— {label}</span>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* Integration status */}
        <Panel title="Integrations">
          <div className="grid gap-2 md:grid-cols-2">
            {integrations.map((i) => (
              <div key={i.id} className="flex items-center gap-3 rounded border border-[#2a1f3d] bg-[#181622] px-3 py-2">
                <Badge
                  label={i.status}
                  tone={i.status === "connected" ? "good" : i.status === "needs_configuration" ? "warn" : "danger"}
                />
                <span className="flex-1 font-mono text-xs text-[#d7ddc8]">{i.provider}</span>
                <span className="text-xs text-[#7a7090]">{i.mode}</span>
              </div>
            ))}
          </div>
        </Panel>

        {/* Env var checklist by group */}
        {GROUPS.map((group) => {
          const vars = ENV_VARS.filter((v) => v.group === group);
          return (
            <Panel key={group} title={group}>
              <div className="space-y-1">
                {vars.map(({ key, label, required }) => (
                  <div key={key} className="flex items-center gap-3 py-1">
                    <Badge
                      label={envPresent[key] ? "set" : required ? "missing" : "unset"}
                      tone={envPresent[key] ? "good" : required ? "danger" : "neutral"}
                    />
                    <span className="font-mono text-xs text-[#d7ddc8]">{key}</span>
                    <span className="text-xs text-[#7a7090]">{label}</span>
                  </div>
                ))}
              </div>
            </Panel>
          );
        })}

        {/* Notification preferences */}
        <Panel title="Notification Preferences">
          {notifPrefs ? (
            <div className="space-y-2 text-sm text-[#d7ddc8]">
              <p>Channel: <span className="font-mono text-[#c4b5fd]">{notifPrefs.channel}</span></p>
              <p>Slack Channel ID: <span className="font-mono text-[#c4b5fd]">{notifPrefs.slackChannelId || "not set"}</span></p>
              <p>Approvals: <Badge label={notifPrefs.approvalRequired ? "enabled" : "disabled"} tone={notifPrefs.approvalRequired ? "good" : "neutral"} /></p>
              <p>Previews: <Badge label={notifPrefs.previewOnly ? "enabled" : "disabled"} tone={notifPrefs.previewOnly ? "good" : "neutral"} /></p>
              <p>Revenue updates: <Badge label={notifPrefs.revenueUpdates ? "enabled" : "disabled"} tone={notifPrefs.revenueUpdates ? "good" : "neutral"} /></p>
            </div>
          ) : (
            <p className="text-sm text-[#7a7090]">No preferences set. Run pnpm db:setup to seed defaults.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
