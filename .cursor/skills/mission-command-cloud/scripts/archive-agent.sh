#!/usr/bin/env bash
# Archive (demobilize) or unarchive a Cloud Agent. Requires commander approval.
#
# Usage:
#   scripts/archive-agent.sh <agentId>              # archive
#   scripts/archive-agent.sh <agentId> --unarchive  # recall
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <agentId> [--unarchive]" >&2
  exit 1
fi

agent_id="$1"
action="archive"
if [[ "${2:-}" == "--unarchive" ]]; then
  action="unarchive"
fi

mc_curl POST "/v1/agents/${agent_id}/${action}"
