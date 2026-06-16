#!/bin/zsh
set -euo pipefail

ROOT="/Users/marcusbolles/Documents/Codex/2026-06-12/build-an-app-called-agent-world"
cd "$ROOT"

scripts/set-slack-bot-token.sh

echo ""
read -k 1 -s "?Press any key to close."
