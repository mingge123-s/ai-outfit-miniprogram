#!/usr/bin/env bash
# Wait for a run to reach a terminal status and print JSON (includes result).
#
# Usage:
#   scripts/wait-run.sh <agentId> <runId> [--interval 5] [--timeout 3600]
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <agentId> <runId> [--interval N] [--timeout N]" >&2
  exit 1
fi

agent_id="$1"
run_id="$2"
shift 2
interval=5
timeout=3600

while [[ $# -gt 0 ]]; do
  case "$1" in
    --interval) interval="$2"; shift 2 ;;
    --timeout) timeout="$2"; shift 2 ;;
    *) echo "error: unknown arg $1" >&2; exit 1 ;;
  esac
done

start="$(date +%s)"
while true; do
  resp="$(mc_curl GET "/v1/agents/${agent_id}/runs/${run_id}")"
  status="$(mc_json_field "$resp" "d.get('status','')")"
  echo "status=${status}" >&2
  case "$status" in
    FINISHED|ERROR|CANCELLED|EXPIRED)
      echo "$resp"
      exit 0
      ;;
  esac
  now="$(date +%s)"
  if (( now - start >= timeout )); then
    echo "error: timeout waiting for ${run_id} (last status=${status})" >&2
    echo "$resp" >&2
    exit 1
  fi
  sleep "$interval"
done
