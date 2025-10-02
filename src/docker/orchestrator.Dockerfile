# syntax=docker/dockerfile:1.6

FROM golang:1.22-alpine AS build
WORKDIR /src
COPY orchestrator/app/go.mod /src/orchestrator/app/go.mod
COPY orchestrator /src/orchestrator
WORKDIR /src/orchestrator/app
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build -o /out/orchestrator

FROM alpine:3.20
RUN apk add --no-cache ca-certificates bash curl docker-cli docker-cli-buildx
ARG K3D_VERSION=v5.6.0
ARG KUBECTL_VERSION=v1.30.0
# Install k3d and kubectl
RUN set -eux; \
    curl -fsSL "https://github.com/k3d-io/k3d/releases/download/${K3D_VERSION}/k3d-linux-amd64" -o /usr/local/bin/k3d; \
    chmod +x /usr/local/bin/k3d; \
    curl -fsSL "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" -o /usr/local/bin/kubectl; \
    chmod +x /usr/local/bin/kubectl
WORKDIR /app
COPY --from=build /out/orchestrator /usr/local/bin/orchestrator
COPY orchestrator/configs /app/configs
ENV ORCHESTRATOR_CONFIG=/app/configs/orchestrator.example.yaml
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/orchestrator"]
