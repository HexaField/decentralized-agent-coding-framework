#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
OS=$("$DIR/detect_os.sh")

log(){ echo "[prereqs] $*"; }

need(){ command -v "$1" >/dev/null 2>&1 || return 0; }

install_talosctl(){
  if ! command -v talosctl >/dev/null 2>&1; then
    log "Installing talosctl"
    case "$OS" in
      macos) brew install siderolabs/tap/talosctl || true;;
      linux) curl -sL https://talos.dev/install | sh || true;;
      *) log "Unsupported OS for talosctl";;
    esac
  fi
}

install_kubectl(){
  if ! command -v kubectl >/dev/null 2>&1; then
    log "Installing kubectl"
    case "$OS" in
      macos) brew install kubectl || true;;
      linux) curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && \
             install -m 0755 kubectl /usr/local/bin/kubectl && rm kubectl;;
      *) log "Unsupported OS for kubectl";;
    esac
  fi
}

install_tailscale(){
  if ! command -v tailscale >/dev/null 2>&1; then
    log "Installing tailscale client"
    case "$OS" in
      macos) brew install tailscale || true;;
      linux) curl -fsSL https://tailscale.com/install.sh | sh;;
      *) log "Unsupported OS for tailscale";;
    esac
  fi
}

install_docker_compose(){
  if ! command -v docker >/dev/null 2>&1; then
    log "Please install Docker Desktop or Docker Engine manually."
  fi
}

install_talosctl
install_kubectl
install_tailscale
install_docker_compose
log "All prerequisites checked."
