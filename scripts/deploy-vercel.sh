#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -z "${VERCEL_TOKEN:-}" ]]; then
  printf "Paste your Vercel token: "
  stty -echo
  read VERCEL_TOKEN
  stty echo
  printf "\n"
  export VERCEL_TOKEN
fi

BUNDLED_NODE="/Users/marcusbolles/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
if [[ -d "$BUNDLED_NODE" ]]; then
  export PATH="$BUNDLED_NODE:$PATH"
fi

if [[ ! -x "node_modules/.bin/vercel" ]]; then
  echo "Installing Vercel CLI locally..."
  if [[ -f "work/pnpm-current/bin/pnpm.cjs" && -x "$BUNDLED_NODE/node" ]]; then
    "$BUNDLED_NODE/node" work/pnpm-current/bin/pnpm.cjs add -D vercel
  elif command -v pnpm >/dev/null 2>&1; then
    pnpm add -D vercel
  else
    npm install --save-dev vercel
  fi
fi

if [[ ! -f ".vercel/project.json" ]]; then
  echo "Linking this folder to a Vercel project..."
  node_modules/.bin/vercel link --token "$VERCEL_TOKEN"
fi

echo "Pulling production environment metadata..."
node_modules/.bin/vercel pull --yes --environment=production --token "$VERCEL_TOKEN"

echo "Building Agent World for production..."
node_modules/.bin/vercel build --prod --token "$VERCEL_TOKEN"

echo "Deploying Agent World publicly..."
DEPLOY_URL="$(node_modules/.bin/vercel deploy --prebuilt --prod --token "$VERCEL_TOKEN")"

echo ""
echo "Agent World is live:"
echo "$DEPLOY_URL"
echo ""
echo "Open setup:"
echo "$DEPLOY_URL/setup"
echo ""
echo "Open diagnostics:"
echo "$DEPLOY_URL/diagnostics"
