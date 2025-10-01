#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "${0:A:h}/.." && pwd)"
IMAGE_NAME="orchestrator-backend"
IMAGE_TAG="${1:-latest}"

echo "Building ${IMAGE_NAME}:${IMAGE_TAG}..."
docker build -t ${IMAGE_NAME}:${IMAGE_TAG} "${ROOT_DIR}/backend"

echo "Built ${IMAGE_NAME}:${IMAGE_TAG}"
