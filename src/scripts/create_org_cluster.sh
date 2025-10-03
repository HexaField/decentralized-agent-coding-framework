#!/usr/bin/env bash
set -euo pipefail
ORG=${1:-}
if [[ -z "$ORG" ]]; then echo "Usage: $0 <org>"; exit 1; fi
NAME="org-$ORG"
echo "create_org_cluster.sh is deprecated in favor of Talos. Use: src/scripts/talos_org_bootstrap.sh <org>"
exit 1
