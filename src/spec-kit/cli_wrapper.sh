#!/usr/bin/env bash
set -euo pipefail
CMD=${1:-}
ARG=${2:-}
mkdir -p /state/spec-kit
case "$CMD" in
  new-task)
    echo "{\"task\":\"$ARG\",\"status\":\"created\"}" > /state/spec-kit/last.json
    echo "spec-kit: created task: $ARG" ;;
  update-task)
    echo "{\"task\":\"$ARG\",\"status\":\"updated\"}" > /state/spec-kit/last.json
    echo "spec-kit: updated task: $ARG" ;;
  complete-task)
    echo "{\"task\":\"$ARG\",\"status\":\"completed\"}" > /state/spec-kit/last.json
    echo "spec-kit: completed task: $ARG" ;;
  *) echo "usage: $0 [new-task|update-task|complete-task] <text>" ;;
esac
