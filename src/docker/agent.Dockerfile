# syntax=docker/dockerfile:1.6

FROM golang:1.22-alpine AS build
WORKDIR /src
COPY agent/app/go.mod /src/agent/app/go.mod
COPY agent /src/agent
WORKDIR /src/agent/app
RUN --mount=type=cache,target=/go/pkg/mod \
	--mount=type=cache,target=/root/.cache/go-build \
	go build -o /out/agent

FROM alpine:3.20
RUN apk add --no-cache ca-certificates bash curl git nodejs npm tini python3
WORKDIR /app

# Install code-server (lightweight). Avoid pinning to a non-existent version.
# Use v4 major to keep compatibility, falling back to latest if resolver can't match.
# Try to install code-server via official installer; ignore failure (fallback server will be used)
RUN (curl -fsSL https://code-server.dev/install.sh | sh) || true

COPY --from=build /out/agent /app/agent/app/agent
COPY agent /app/agent
COPY spec-kit /app/spec-kit
COPY radicle /app/radicle
RUN chmod +x /app/agent/agent_entrypoint.sh \
	&& chmod +x /app/agent/app/code_server/run_code_server.sh || true
ENV PATH="/usr/local/bin:/usr/bin:/bin:/app/agent/app/code_server:$PATH"

EXPOSE 8443
ENTRYPOINT ["/sbin/tini","--","/app/agent/agent_entrypoint.sh"]
