#!/usr/bin/env bash
set -euo pipefail
ORG=${1:-}
if [[ -z "$ORG" ]]; then echo "Usage: $0 <org>"; exit 1; fi
NAME="org-$ORG"
echo "delete_org_cluster.sh is deprecated with Talos mode. Tear down Talos nodes using talosctl reset/apply as appropriate."
exit 1
