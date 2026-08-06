#!/usr/bin/env bash
# Get Cloud Agent metadata.
#
# Usage:
#   scripts/get-agent.sh <agentId>
#   scripts/get-agent.sh --list [--limit 20]
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <agentId> | $0 --list [--limit N]" >&2
  exit 1
fi

if [[ "$1" == "--list" ]]; then
  shift
  limit=20
  if [[ "${1:-}" == "--limit" ]]; then
    limit="$2"
  fi
  mc_curl GET "/v1/agents?limit=${limit}&includeArchived=false"
  exit 0
fi

mc_curl GET "/v1/agents/$1"
