#!/usr/bin/env bash
set -euo pipefail

red() { printf "\033[31m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }

[ -f .env ] && set -a && . ./.env && set +a

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    red "Missing: $1"; return 1; fi
}

install_mac() {
  case "$1" in
    yq) brew install yq ;; jq) brew install jq ;;
    talosctl) brew install siderolabs/tap/talosctl ;;
    cilium) brew install cilium-cli ;;
    *) return 1 ;;
  esac
}

echo "Checking prerequisites..."
OS=$(uname -s)

for cmd in docker kubectl helm ssh; do need_cmd "$cmd" || MISSING=1; done
for cmd in yq jq talosctl cilium; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    if [ "$OS" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
      yellow "Attempting to install $cmd via Homebrew"
      install_mac "$cmd" || true
    fi
  fi
  need_cmd "$cmd" || MISSING=1
done

if [ -n "${MISSING:-}" ]; then
  red "Some prerequisites are missing. Please install the tools above and re-run."
  exit 1
fi

green "All prerequisites found."

echo "Validating environment..."
if [ -z "${HEADSCALE_URL:-}" ]; then yellow "HEADSCALE_URL not set yet."; fi
if [ -z "${ORG_CONFIG_FILE:-}" ] && [ -z "${ORGS:-}" ]; then yellow "Define ORG_CONFIG_FILE or ORGS."; fi

green "Preflight complete."
