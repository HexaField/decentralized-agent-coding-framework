#!/usr/bin/env bash
set -euo pipefail
CMD=${1:-}
ARG=${2:-}
STATE_DIR="${HOME:-/root}/.guildnet/state"
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
