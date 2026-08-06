#!/usr/bin/env bash
# List runs for a Cloud Agent, newest first (pull-based fallback channel).
#
# Usage:
#   scripts/list-runs.sh <agentId> [--limit 20]
#   scripts/list-runs.sh <agentId> --latest    # print latest run id only
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <agentId> [--limit N] [--latest]" >&2
  exit 1
fi

agent_id="$1"
shift
limit=20
latest_only="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --limit) limit="$2"; shift 2 ;;
    --latest) latest_only="true"; shift ;;
    *) echo "error: unknown arg $1" >&2; exit 1 ;;
  esac
done

resp="$(mc_curl GET "/v1/agents/${agent_id}/runs?limit=${limit}")"

if [[ "$latest_only" == "true" ]]; then
  mc_json_field "$resp" "(d.get('items') or [{}])[0].get('id','')"
else
  echo "$resp"
fi
