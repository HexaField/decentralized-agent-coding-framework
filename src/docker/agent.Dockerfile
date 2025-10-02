# syntax=docker/dockerfile:1.6

FROM golang:1.22-alpine AS build
WORKDIR /src
COPY agent/app/go.mod /src/agent/app/go.mod
COPY agent /src/agent
WORKDIR /src/agent/app
RUN --mount=type=cache,target=/go/pkg/mod \
	--mount=type=cache,target=/root/.cache/go-build \
	go build -o /out/agent

FROM debian:bookworm-slim
RUN apt-get update \
	&& DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
		 ca-certificates curl git python3 tini bash \
	&& rm -rf /var/lib/apt/lists/*
WORKDIR /app

ARG TARGETARCH
ENV CODE_SERVER_VERSION=4.104.2
RUN set -eux; \
	arch="${TARGETARCH:-amd64}"; \
	case "$arch" in \
		amd64) CS_ARCH=amd64 ;; \
		arm64) CS_ARCH=arm64 ;; \
		*) CS_ARCH=amd64 ;; \
	esac; \
	URL="https://github.com/coder/code-server/releases/download/v${CODE_SERVER_VERSION}/code-server-${CODE_SERVER_VERSION}-linux-${CS_ARCH}.tar.gz"; \
	TMP=/tmp/code-server.tgz; \
	if curl -fsSL "$URL" -o "$TMP"; then \
		mkdir -p /usr/local/lib \
		&& tar -xzf "$TMP" -C /usr/local/lib \
		&& rm -f "$TMP" \
		&& ln -sf /usr/local/lib/code-server-${CODE_SERVER_VERSION}-linux-${CS_ARCH}/bin/code-server /usr/local/bin/code-server; \
	else \
		echo "Skipping code-server install (download failed)"; \
	fi

COPY --from=build /out/agent /app/agent/app/agent
COPY agent /app/agent
COPY spec-kit /app/spec-kit
COPY radicle /app/radicle
RUN chmod +x /app/agent/agent_entrypoint.sh \
	&& chmod +x /app/agent/app/code_server/run_code_server.sh || true
ENV PATH="/usr/local/bin:/usr/bin:/bin:/app/agent/app/code_server:$PATH"

EXPOSE 8443
ENTRYPOINT ["/usr/bin/tini","--","/app/agent/agent_entrypoint.sh"]
