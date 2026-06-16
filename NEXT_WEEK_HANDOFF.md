# Agent World Handoff

Last updated: 2026-06-13

## Current Goal

Create the public/live-running Agent World deployment on Vercel, then stress test the live app.

## Security Note

No secrets are stored in this file or committed into the project.

The Vercel token was provided in chat during the previous session, but it was not saved to the repo, not printed in output, and not written to any local config file. Paste or export a fresh token when deploying.

## Current App Status

- The local Next.js production build passes.
- The app includes `/setup` for integration status and testing.
- The app includes `/diagnostics` for environment checks, integration errors, action logs, capital status, and blocked workflow visibility.
- Slack integration supports webhook mode and bot-token mode.
- Slack send attempts are designed to fail visibly when not configured.
- Stripe service supports test/live mode configuration and product/payment-link service functions.
- Agent World starts with `$0` capital.
- The mock agent tick system is still present.
- Agent behavior is structured around first-dollar execution, free-first bootstrap strategy, approval gates, previews, spending requests, reputation, and business portfolio management.

## Deployment Blocker From This Session

The Codex sandbox could not deploy directly because:

- outbound npm registry access was blocked
- Vercel CLI was not installed locally
- no Vercel project was linked in `.vercel/project.json`
- sandbox escalation for network access was unavailable

This was an environment limitation, not an app build failure.

## Canonical Saved Version

The newest version is saved as:

- `outputs/agent_world.command`

Use this next week to resume the public/live Vercel deployment flow.

Older duplicate local launchers were removed to avoid confusion.

## Files Added For Deployment

- `scripts/deploy-vercel.sh`
- `outputs/agent_world.command`

The deploy helper:

- privately prompts for a Vercel token if `VERCEL_TOKEN` is not already set
- installs the Vercel CLI when normal internet access is available
- links the local folder to a Vercel project
- pulls production Vercel environment metadata
- builds the production app
- deploys the prebuilt app to Vercel
- prints links for the live app, `/setup`, and `/diagnostics`

## Next Week Resume Steps

1. Open:
   `outputs/agent_world.command`

2. Paste a valid Vercel token when prompted.

3. Link or create the Vercel project when the Vercel CLI asks.

4. Configure production environment variables in Vercel:

   - `EXECUTION_MODE=supervised`
   - `STRIPE_MODE=test` initially
   - `SLACK_WEBHOOK_URL` or `SLACK_BOT_TOKEN` plus `SLACK_CHANNEL_ID`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_PUBLISHABLE_KEY`
   - `STRIPE_WEBHOOK_SECRET` if webhooks are enabled
   - `OPENAI_API_KEY` when real agent execution is enabled
   - `DATABASE_URL` if moving from mock/local persistence to a real hosted database
   - `RESEND_API_KEY` if enabling email provider tests
   - `NEXT_PUBLIC_APP_URL` once the Vercel URL is known

5. Open the live `/setup` page.

6. Click “Send Test Slack Message.”

7. Confirm Slack either delivers successfully or shows a clear diagnostic failure.

8. Open `/diagnostics` and check:

   - Slack connection status
   - Stripe connection status
   - missing env variables
   - failed external action logs
   - blocked approval workflows
   - capital account status

9. Stress test the public app:

   - dashboard loads
   - world map loads
   - agents move and continue mock ticks
   - Slack previews can send
   - approval-required actions do not silently fail
   - spending requests remain blocked until approved
   - live Stripe payment links require approval
   - first-dollar/free-first strategy surfaces in agent activity

## Slack Reply Sync

Incoming webhook mode can send Agent World messages into Slack, but it cannot read your replies.

To let agents automatically see `YES`, `NO`, `MODIFY`, and threaded approval replies, configure bot-token mode:

- `SLACK_BOT_TOKEN`
- `SLACK_CHANNEL_ID=C0B9UN9V92B`

The channel ID must be the Slack ID, not `#agent_world`.

Use this local helper to enter the token privately:

```sh
scripts/set-slack-bot-token.sh
```

Or open:

```text
outputs/set_slack_bot_token.command
```

After bot-token mode is configured, Agent World can sync replies through:

```sh
curl -X POST http://127.0.0.1:3002/api/slack/sync
```

On Vercel, call:

```sh
curl -X POST https://YOUR_AGENT_WORLD_URL/api/slack/sync
```

For production automation, configure Slack Events or Slack interactive buttons to call `/api/slack/interactions`, or run `/api/slack/sync` on a schedule.

## Important Safety Defaults

- Keep `EXECUTION_MODE=supervised` for the first public run.
- Keep `STRIPE_MODE=test` until the approval workflow is verified.
- Do not enable unrestricted live execution.
- Do not store secret tokens in source files.
- Do not commit `.env.local`, `.env.production`, `.vercel`, or token-bearing logs.

## Most Recent Verified Command

The production build completed successfully with:

```sh
pnpm build
```

Result: Next.js compiled successfully and generated all app routes.
