# Agent World Production Beta Plan

Agent World is moving from a sandbox-only MVP to a private supervised-live beta.

## Current Policy

- `EXECUTION_MODE=supervised_live`
- `ALLOW_REAL_WORLD_ACTIONS=true`
- `REQUIRE_HUMAN_APPROVAL=true`
- `ALLOW_WEB_SEARCH=true`
- `REQUIRE_APPROVAL_FOR_WEB_SEARCH=true`
- `OPENAI_MONTHLY_BUDGET=10`
- `MAX_AGENT_RUNS_PER_DAY=20`
- `MAX_WEB_SEARCHES_PER_DAY=5`
- `MAX_DAILY_SPEND_WITHOUT_APPROVAL=0`

## Non-Negotiable Rules

- Drafting, planning, preview generation, and internal database updates may run automatically.
- Real-world actions require human approval and audit logs.
- Agents cannot spend money without approval.
- Agents cannot contact real people without approval.
- Agents cannot publish public assets without approval.
- Agents cannot switch from Stripe test keys to live keys silently.
- Live Stripe requires `STRIPE_MODE=live`, live keys, and approval.

## Implemented In This Pass

- Centralized runtime config service: `app/lib/config.ts`
- Supervised execution guard: `app/lib/execution-manager.ts`
- Prisma client helper: `app/lib/prisma.ts`
- OpenAI AgentRunner scaffold: `app/lib/agent-runner.ts`
- Web search usage guard: `app/lib/web-search-tools.ts`
- Slack command parsing for `STATUS`, `RUN DAILY`, `RUN AGENTS`, `STOP AGENTS`, `PAUSE`, and `REVISE`
- Slack event route can apply `YES`, `NO`, and `MODIFY` without manual sync when Slack Events are configured
- Slack approval delivery prefers bot-token mode so approvals store real Slack timestamps
- Stripe mode now separates test keys from live keys
- Optional private dashboard Basic Auth via `APP_PASSWORD`
- Setup and diagnostics show supervised-live guardrails and integration readiness
- Prisma schema supports `DEMO`, `LOCAL`, `SUPERVISED_LIVE`, and `PRODUCTION`
- Vercel defaults now use supervised-live guardrails

## Still Needed

1. Connect a real Supabase/Postgres `DATABASE_URL`.
2. Run Prisma migration against the real database.
3. Move active runtime data from in-memory state to Prisma reads/writes.
4. Add seed/bootstrap for initial agents, capital account, world state, and notification preferences.
5. Add `OPENAI_API_KEY` and choose `DEFAULT_MODEL`.
6. Replace mock agent ticks with scheduled `AgentRunner` cycles.
7. Add persistent daily/monthly budget accounting.
8. Connect Stripe test keys and validate product/price/payment-link creation behind approval.
9. Connect Resend or another email provider for supervised outreach.
10. Deploy privately to Vercel and set `APP_PASSWORD`.
11. Configure Slack Event Subscriptions to call `/api/slack/interactions`.
12. Stress test approval, budget, restart recovery, and blocked-action behavior.

## Required User Inputs

- Supabase/Postgres `DATABASE_URL`
- OpenAI `OPENAI_API_KEY`
- Preferred `DEFAULT_MODEL`
- Stripe test secret and publishable keys
- Private `APP_PASSWORD`
- Vercel deployment confirmation or project link
- Resend/email key if real outreach sending should be tested

## Current Verified Status

- Build passes.
- Prisma schema validates with a placeholder database URL.
- Local app reports `supervised_live`.
- Slack bot delivery works.
- OpenAI API key has been added locally.
- Stripe test secret and publishable keys have been added locally.
- Supabase project URL has been added locally.
- Still missing: Prisma/Postgres `DATABASE_URL`, private `APP_PASSWORD`, deployed Vercel URL, and optional email provider key.

## Supabase Database Requirement

The Supabase project URL is not enough for Prisma persistence.

Prisma needs a Postgres connection string in `DATABASE_URL`, usually from Supabase:

```text
postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
```

or the pooled connection string:

```text
postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true
```

Use the direct connection string for migrations when possible.
