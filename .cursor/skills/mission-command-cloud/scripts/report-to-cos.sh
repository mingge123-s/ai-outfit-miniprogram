#!/usr/bin/env bash
# Task-unit / inspector → Chief of Staff report channel.
#
# Usage:
#   scripts/report-to-cos.sh [report-file|-]
#   # or pipe report on stdin
#
# Requires:
#   MISSION_COMMAND_COS_AGENT_ID (or --cos / COS from env)
#   MISSION_COMMAND_API_KEY or CURSOR_API_KEY
#
# Ensures the report starts with [MISSION-COMMAND REPORT].
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

cos_id="${MISSION_COMMAND_COS_AGENT_ID:-}"
src=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cos-id) cos_id="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *)
      src="$1"
      shift
      ;;
  esac
done

if [[ -z "$cos_id" ]]; then
  echo "error: MISSION_COMMAND_COS_AGENT_ID or --cos-id required" >&2
  exit 1
fi

if [[ -z "$src" || "$src" == "-" ]]; then
  report="$(cat)"
else
  report="$(cat "$src")"
fi

if [[ -z "$report" ]]; then
  echo "error: empty report" >&2
  exit 1
fi

if ! grep -q '\[MISSION-COMMAND REPORT\]' <<<"$report"; then
  unit="${MISSION_COMMAND_UNIT_ID:-UNKNOWN}"
  action="${MISSION_COMMAND_ACTION_CODE:-UNKNOWN}"
  echelon="${MISSION_COMMAND_ECHELON:-TASK-UNIT}"
  self_id="${CURSOR_CONVERSATION_ID:-unknown}"
  report="[MISSION-COMMAND REPORT]
UNIT: ${unit}
ACTION: ${action}
ECHELON: ${echelon}
STATUS: COMPLETE_CLAIMED
COS_AGENT_ID: ${cos_id}
UNIT_AGENT_ID: ${self_id}
MISSION_RESULT:
${report}
"
fi

mc_post_run_with_retry "$cos_id" "$report"
echo >&2
echo "report delivered to COS ${cos_id}" >&2
