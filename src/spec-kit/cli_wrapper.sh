#!/usr/bin/env bash
set -euo pipefail
CMD=${1:-}
ARG=${2:-}
if [[ -n "${GUILDNET_STATE_DIR:-}" ]]; then
  STATE_DIR="$GUILDNET_STATE_DIR"
elif [[ -n "${GUILDNET_HOME:-}" ]]; then
  STATE_DIR="$GUILDNET_HOME/state"
elif [[ "${GUILDNET_ENV:-}" == "dev" ]]; then
  STATE_DIR="${HOME:-/root}/.guildnetdev/state"
else
  STATE_DIR="${HOME:-/root}/.guildnet/state"
fi
mkdir -p "$STATE_DIR/spec-kit"
case "$CMD" in
  new-task)
  echo "{\"task\":\"$ARG\",\"status\":\"created\"}" > "$STATE_DIR/spec-kit/last.json"
    echo "spec-kit: created task: $ARG" ;;
  update-task)
  echo "{\"task\":\"$ARG\",\"status\":\"updated\"}" > "$STATE_DIR/spec-kit/last.json"
    echo "spec-kit: updated task: $ARG" ;;
  complete-task)
  echo "{\"task\":\"$ARG\",\"status\":\"completed\"}" > "$STATE_DIR/spec-kit/last.json"
    echo "spec-kit: completed task: $ARG" ;;
  *) echo "usage: $0 [new-task|update-task|complete-task] <text>" ;;
esac
