#!/usr/bin/env bash
# Wipe local databases, Tailscale/Headscale artifacts, and kube/talos state.
# Safe-by-default: best-effort removals with '|| true' to avoid stopping on errors.
# Based on the Cleanup section in README.md. Does NOT remove dependencies.

set -euo pipefail
shopt -s nullglob || true 2>/dev/null || true

echo "[clean] Starting cleanup..."

# Resolve HOME dir (support for running via VS Code shells)
HOME_DIR=${HOME:-$(eval echo ~)}
# Determine state dir (dev vs prod)
if [[ -n "${GUILDNET_STATE_DIR:-}" ]]; then
  STATE_DIR="$GUILDNET_STATE_DIR"
elif [[ -n "${GUILDNET_HOME:-}" ]]; then
  STATE_DIR="$GUILDNET_HOME/state"
elif [[ "${GUILDNET_ENV:-}" == "dev" ]]; then
  STATE_DIR="$HOME_DIR/.guildnetdev/state"
else
  STATE_DIR="$HOME_DIR/.guildnet/state"
fi

echo "[clean] HOME=$HOME_DIR"
echo "[clean] STATE_DIR=$STATE_DIR"

echo "[clean] Docker: remove local Headscale container/volume/networks"
docker rm -f headscale-local >/dev/null 2>&1 || true
docker volume rm headscale-data >/dev/null 2>&1 || true
# remove any tailscale/headscale docker networks if present
docker network ls --format '{{.Name}}' | grep -E '^(tailscale|headscale)' | xargs -r docker network rm >/dev/null 2>&1 || true

echo "[clean] Remove Headscale temp config and dashboard DB in $STATE_DIR"
rm -rf "$STATE_DIR/_tmp/headscale" 2>/dev/null || true
rm -f "$STATE_DIR/dashboard.db" 2>/dev/null || true

echo "[clean] Remove kube/talos state in ~/.guildnet/state"
rm -rf "$STATE_DIR/kube" "$STATE_DIR/talos" 2>/dev/null || true

echo "[clean] Also remove any repo-local persisted state (if used during dev)"
rm -f "$STATE_DIR/dashboard.db" 2>/dev/null || true
rm -rf "$STATE_DIR/kube" "$STATE_DIR/talos" 2>/dev/null || true

echo "[clean] Tailscale teardown (optional, best-effort; macOS no-sudo)"
if command -v tailscale >/dev/null 2>&1; then
  tailscale logout >/dev/null 2>&1 || true
  # Try to quit macOS app (no-op elsewhere)
  if command -v osascript >/dev/null 2>&1; then
    osascript -e 'tell application "Tailscale" to quit' >/dev/null 2>&1 || true
  fi
  # If user wants to clear client prefs/state without sudo, try reset; ignore failures
  tailscale up --reset --force-reauth >/dev/null 2>&1 || true
fi

echo "[clean] Done. You should now have a clean slate."
