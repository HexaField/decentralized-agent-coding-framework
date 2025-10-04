#!/usr/bin/env bash
set -euo pipefail

# Write a minimal, valid talosconfig for an org to the expected state dir.
# Usage: ORG=<name> [GUILDNET_ENV=dev] [GUILDNET_HOME=...] [GUILDNET_STATE_DIR=...] ./src/scripts/talos_write_default.sh

ORG=${ORG:-}
if [[ -z "${ORG}" ]]; then echo "Usage: ORG=<name> $0" >&2; exit 1; fi

# Resolve state base dir like dashboard server does
resolve_state_dir() {
  if [[ -n "${DASHBOARD_STATE_DIR:-}" ]]; then echo "$DASHBOARD_STATE_DIR"; return; fi
  if [[ -n "${GUILDNET_STATE_DIR:-}" ]]; then echo "$GUILDNET_STATE_DIR"; return; fi
  if [[ -n "${GUILDNET_HOME:-}" ]]; then mkdir -p "$GUILDNET_HOME/state"; echo "$GUILDNET_HOME/state"; return; fi
  local home="${HOME}"; local dir
  if [[ "${GUILDNET_ENV:-}" == "dev" || "${NODE_ENV:-}" == "development" || "${UI_DEV:-}" == "1" ]]; then
    dir="$home/.guildnetdev/state"
  else
    dir="$home/.guildnet/state"
  fi
  mkdir -p "$dir"
  echo "$dir"
}

STATE_DIR=$(resolve_state_dir)
TARGET_DIR="$STATE_DIR/talos"
TARGET_FILE="$TARGET_DIR/$ORG.talosconfig"
mkdir -p "$TARGET_DIR"

# Prefer copying user's actual ~/.talos/config if valid
SRC_TALOS="$HOME/.talos/config"
if [[ -s "$SRC_TALOS" ]] && grep -qi 'contexts:' "$SRC_TALOS"; then
  install -m 600 "$SRC_TALOS" "$TARGET_FILE"
  echo "Copied $SRC_TALOS -> $TARGET_FILE"
  exit 0
fi

# Otherwise synthesize from envs (or placeholders)
EP=${TALOS_ENDPOINTS:-127.0.0.1}
ND=${TALOS_NODES:-$EP}
CA=${TALOS_CA_PEM:-$'-----BEGIN CERTIFICATE-----\nPLACEHOLDER-CA\n-----END CERTIFICATE-----'}
CRT=${TALOS_CRT_PEM:-$'-----BEGIN CERTIFICATE-----\nPLACEHOLDER-CRT\n-----END CERTIFICATE-----'}
KEY=${TALOS_KEY_PEM:-$'-----BEGIN PRIVATE KEY-----\nPLACEHOLDER-KEY\n-----END PRIVATE KEY-----'}

indent() { sed 's/^/      /'; }
{
  echo "context: $ORG"
  echo "contexts:"
  echo "  - name: $ORG"
  echo "    endpoints:"
  IFS=", " read -r -a EPA <<< "$EP"; for e in "${EPA[@]}"; do [[ -n "$e" ]] && echo "      - $e"; done
  echo "    nodes:"
  IFS=", " read -r -a NDA <<< "$ND"; for n in "${NDA[@]}"; do [[ -n "$n" ]] && echo "      - $n"; done
  echo "    ca: |";  printf "%s\n" "$CA"  | indent
  echo "    crt: |"; printf "%s\n" "$CRT" | indent
  echo "    key: |"; printf "%s\n" "$KEY" | indent
} > "$TARGET_FILE.tmp"
install -m 600 "$TARGET_FILE.tmp" "$TARGET_FILE"
rm -f "$TARGET_FILE.tmp"

echo "Wrote synthesized talosconfig -> $TARGET_FILE"
