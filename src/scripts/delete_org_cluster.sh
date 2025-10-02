#!/usr/bin/env bash
set -euo pipefail
ORG=${1:-}
if [[ -z "$ORG" ]]; then echo "Usage: $0 <org>"; exit 1; fi
NAME="org-$ORG"
echo "Deleting k3d cluster $NAME"
k3d cluster delete "$NAME" || true
