#!/usr/bin/env bash
# List an agent's artifacts, or fetch a presigned download URL for one.
#
# Usage:
#   scripts/artifacts.sh <agentId>                       # list artifacts
#   scripts/artifacts.sh <agentId> --download <path>     # print 15-min presigned URL
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <agentId> [--download <path>]" >&2
  exit 1
fi

agent_id="$1"
shift

if [[ "${1:-}" == "--download" ]]; then
  path="${2:-}"
  if [[ -z "$path" ]]; then
    echo "error: --download requires a path (from the artifacts list)" >&2
    exit 1
  fi
  encoded="$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$path")"
  resp="$(mc_curl GET "/v1/agents/${agent_id}/artifacts/download?path=${encoded}")"
  mc_json_field "$resp" "d.get('url','') or json.dumps(d)"
else
  mc_curl GET "/v1/agents/${agent_id}/artifacts"
fi
