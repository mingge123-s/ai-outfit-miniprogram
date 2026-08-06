#!/usr/bin/env bash
# Get token usage for an agent (J8 cost monitoring).
#
# Usage:
#   scripts/usage.sh <agentId> [--run <runId>]
#
# Note: early-access endpoint. Returns 403 feature_unavailable when the
# account does not have it enabled; fall back to manual estimation.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <agentId> [--run <runId>]" >&2
  exit 1
fi

agent_id="$1"
shift
run_qs=""

if [[ "${1:-}" == "--run" ]]; then
  run_qs="?runId=${2:?--run requires a runId}"
fi

mc_curl GET "/v1/agents/${agent_id}/usage${run_qs}"
