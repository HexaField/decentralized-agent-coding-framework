#!/usr/bin/env bash
set -euo pipefail
OS="$(uname -s)"
case "$OS" in
  Linux) echo linux;;
  Darwin) echo macos;;
  *) echo unknown;;
esac
