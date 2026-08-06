#!/usr/bin/env bash
# Send a follow-up prompt to an existing Cloud Agent (order / FRAGORD / nudge).
#
# Usage:
#   scripts/send-prompt.sh <agentId> [prompt-file|-]
#   echo 'FRAGORD...' | scripts/send-prompt.sh bc-xxx
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <agentId> [prompt-file|-]" >&2
  exit 1
fi

agent_id="$1"
src="${2:-}"

if [[ -z "$src" || "$src" == "-" ]]; then
  prompt="$(cat)"
else
  prompt="$(cat "$src")"
fi

if [[ -z "$prompt" ]]; then
  echo "error: empty prompt" >&2
  exit 1
fi

mc_post_run_with_retry "$agent_id" "$prompt"
echo >&2
echo "sent follow-up to ${agent_id}" >&2
