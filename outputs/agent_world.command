#!/bin/zsh
set -euo pipefail

ROOT="/Users/marcusbolles/Documents/Codex/2026-06-12/build-an-app-called-agent-world"
cd "$ROOT"

echo "Agent World"
echo ""
echo "Newest saved version: public/live deployment flow"
echo "Secrets are not stored in this project."
echo ""
echo "This will deploy Agent World to Vercel and print the live links."
echo "You will be asked for your Vercel token privately if VERCEL_TOKEN is not already set."
echo ""

scripts/deploy-vercel.sh

echo ""
echo "Agent World deployment flow finished."
read -k 1 -s "?Press any key to close."
