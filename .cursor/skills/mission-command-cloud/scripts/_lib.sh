#!/usr/bin/env bash
# Shared helpers for mission-command-cloud scripts.
set -euo pipefail

mc_api_base="${MISSION_COMMAND_API_BASE:-https://api.cursor.com}"

mc_api_key() {
  if [[ -n "${MISSION_COMMAND_API_KEY:-}" ]]; then
    printf '%s' "$MISSION_COMMAND_API_KEY"
    return 0
  fi
  if [[ -n "${CURSOR_API_KEY:-}" ]]; then
    printf '%s' "$CURSOR_API_KEY"
    return 0
  fi
  echo "error: set MISSION_COMMAND_API_KEY or CURSOR_API_KEY" >&2
  return 1
}

mc_curl() {
  local key method path
  key="$(mc_api_key)"
  method="$1"
  path="$2"
  shift 2
  curl -sS -X "$method" \
    -u "${key}:" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    "${mc_api_base}${path}" \
    "$@"
}

mc_json_field() {
  # Usage: mc_json_field <json> <python-expr-on-obj-as-d>
  local json expr
  json="$1"
  expr="$2"
  python3 -c "import json,sys; d=json.load(sys.stdin); print($expr)" <<<"$json"
}

mc_is_busy() {
  local body
  body="$1"
  python3 -c "import json,sys
try:
  d=json.load(sys.stdin)
except Exception:
  sys.exit(1)
code=(d.get('error') or {}).get('code') or d.get('code') or ''
msg=str(d.get('message') or d.get('error') or '')
sys.exit(0 if code=='agent_busy' or 'agent_busy' in msg else 1)" <<<"$body"
}

mc_post_run_with_retry() {
  local agent_id prompt max_attempts sleep_s attempt body http_code
  agent_id="$1"
  prompt="$2"
  max_attempts="${3:-8}"
  sleep_s=2
  attempt=1

  local payload
  payload="$(python3 -c "import json,sys; print(json.dumps({'prompt':{'text':sys.stdin.read()}}))" <<<"$prompt")"

  while (( attempt <= max_attempts )); do
    body="$(mktemp)"
    http_code="$(curl -sS -o "$body" -w '%{http_code}' -X POST \
      -u "$(mc_api_key):" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json" \
      "${mc_api_base}/v1/agents/${agent_id}/runs" \
      --data "$payload" || true)"

    if [[ "$http_code" == "200" || "$http_code" == "201" ]]; then
      cat "$body"
      rm -f "$body"
      return 0
    fi

    if { [[ "$http_code" == "409" ]] && mc_is_busy "$(cat "$body")"; } || [[ "$http_code" == "429" ]]; then
      echo "warn: HTTP ${http_code} (busy/rate-limited) on ${agent_id}; retry ${attempt}/${max_attempts} after ${sleep_s}s" >&2
      sleep "$sleep_s"
      sleep_s=$(( sleep_s * 2 ))
      if (( sleep_s > 60 )); then sleep_s=60; fi
      attempt=$(( attempt + 1 ))
      rm -f "$body"
      continue
    fi

    echo "error: POST /v1/agents/${agent_id}/runs failed HTTP ${http_code}" >&2
    cat "$body" >&2
    rm -f "$body"
    return 1
  done

  echo "error: gave up waiting for agent ${agent_id} to become idle" >&2
  return 1
}
