#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env.local"
CHANNEL_ID="C0B9UN9V92B"

printf "Paste Slack bot token (starts with xoxb-): "
stty -echo
read SLACK_BOT_TOKEN
stty echo
printf "\n"

if [[ "$SLACK_BOT_TOKEN" != xoxb-* ]]; then
  echo "Invalid token format. Expected a Slack bot token starting with xoxb-."
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  touch "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

upsert_env() {
  local name="$1"
  local value="$2"
  local tmp
  local found="false"
  tmp="$(mktemp)"

  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "$name="* ]]; then
      print -r -- "$name=\"$value\"" >> "$tmp"
      found="true"
    else
      print -r -- "$line" >> "$tmp"
    fi
  done < "$ENV_FILE"

  if [[ "$found" != "true" ]]; then
    print -r -- "$name=\"$value\"" >> "$tmp"
  fi

  mv "$tmp" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
}

upsert_env "SLACK_BOT_TOKEN" "$SLACK_BOT_TOKEN"
upsert_env "SLACK_CHANNEL_ID" "$CHANNEL_ID"
upsert_env "SLACK_APPROVAL_CHANNEL_ID" "$CHANNEL_ID"

echo "Slack bot token saved to .env.local."
echo "Restart Agent World before testing /api/slack/sync."
