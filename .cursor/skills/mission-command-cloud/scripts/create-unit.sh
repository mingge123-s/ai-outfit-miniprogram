#!/usr/bin/env bash
# Create a Cloud Agent task unit or inspector.
#
# Usage:
#   scripts/create-unit.sh \
#     --name '[CODE][分队] outcome' \
#     --prompt-file ./opord.txt \
#     --repo https://github.com/org/repo \
#     --ref main \
#     --echelon TASK-UNIT \
#     --unit-id U1 \
#     --action-code CODE \
#     [--cos-id bc-...] \
#     [--auto-pr] \
#     [--model composer-2]
#
# Reads prompt from --prompt-file or STDIN.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

name=""
prompt_file=""
repo=""
ref="main"
echelon="TASK-UNIT"
unit_id=""
action_code=""
cos_id="${MISSION_COMMAND_COS_AGENT_ID:-${CURSOR_CONVERSATION_ID:-}}"
auto_pr="false"
model_id=""
pr_url=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) name="$2"; shift 2 ;;
    --prompt-file) prompt_file="$2"; shift 2 ;;
    --repo) repo="$2"; shift 2 ;;
    --ref) ref="$2"; shift 2 ;;
    --pr-url) pr_url="$2"; shift 2 ;;
    --echelon) echelon="$2"; shift 2 ;;
    --unit-id) unit_id="$2"; shift 2 ;;
    --action-code) action_code="$2"; shift 2 ;;
    --cos-id) cos_id="$2"; shift 2 ;;
    --auto-pr) auto_pr="true"; shift 1 ;;
    --model) model_id="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "error: unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$name" ]]; then
  echo "error: --name required" >&2
  exit 1
fi
if [[ -z "$cos_id" ]]; then
  echo "error: --cos-id or MISSION_COMMAND_COS_AGENT_ID / CURSOR_CONVERSATION_ID required" >&2
  exit 1
fi
if [[ -z "$unit_id" ]]; then
  unit_id="U-$(date +%H%M%S)"
fi
if [[ -z "$action_code" ]]; then
  action_code="OP"
fi

prompt_text=""
if [[ -n "$prompt_file" ]]; then
  prompt_text="$(cat "$prompt_file")"
else
  prompt_text="$(cat)"
fi
if [[ -z "$prompt_text" ]]; then
  echo "error: empty prompt" >&2
  exit 1
fi

api_key="$(mc_api_key)"

payload="$(PROMPT_TEXT="$prompt_text" NAME="$name" REPO="$repo" REF="$ref" PR_URL="$pr_url" \
  ECHELON="$echelon" UNIT_ID="$unit_id" ACTION_CODE="$action_code" COS_ID="$cos_id" \
  AUTO_PR="$auto_pr" MODEL_ID="$model_id" API_KEY="$api_key" python3 - <<'PY'
import json, os

prompt = os.environ["PROMPT_TEXT"]
body = {
    "name": os.environ["NAME"][:100],
    "prompt": {"text": prompt},
    "workOnCurrentBranch": False,
    "autoCreatePR": os.environ["AUTO_PR"] == "true",
    "envVars": {
        "MISSION_COMMAND_API_KEY": os.environ["API_KEY"],
        "MISSION_COMMAND_COS_AGENT_ID": os.environ["COS_ID"],
        "MISSION_COMMAND_ECHELON": os.environ["ECHELON"],
        "MISSION_COMMAND_UNIT_ID": os.environ["UNIT_ID"],
        "MISSION_COMMAND_ACTION_CODE": os.environ["ACTION_CODE"],
    },
}
repo = os.environ.get("REPO") or ""
ref = os.environ.get("REF") or "main"
pr_url = os.environ.get("PR_URL") or ""
if repo:
    entry = {"url": repo}
    if pr_url:
        entry["prUrl"] = pr_url
    else:
        entry["startingRef"] = ref
    body["repos"] = [entry]
model = os.environ.get("MODEL_ID") or ""
if model:
    body["model"] = {"id": model}
print(json.dumps(body))
PY
)"

resp="$(mc_curl POST /v1/agents --data "$payload")"
echo "$resp"

agent_id="$(mc_json_field "$resp" "d.get('agent',{}).get('id','')")"
run_id="$(mc_json_field "$resp" "d.get('run',{}).get('id','')")"
url="$(mc_json_field "$resp" "d.get('agent',{}).get('url','')")"

echo "---" >&2
echo "UNIT_ID=${unit_id}" >&2
echo "AGENT_ID=${agent_id}" >&2
echo "RUN_ID=${run_id}" >&2
echo "URL=${url}" >&2
echo "COS_AGENT_ID=${cos_id}" >&2
