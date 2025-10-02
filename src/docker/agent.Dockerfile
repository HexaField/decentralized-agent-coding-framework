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
RUN apk add --no-cache ca-certificates bash curl git nodejs npm tini
WORKDIR /app

# Install code-server (lightweight)
RUN npm install -g code-server@4.92.0

COPY --from=build /out/agent /app/agent/app/agent
COPY agent /app/agent
COPY spec-kit /app/spec-kit
COPY radicle /app/radicle
ENV PATH="/usr/local/bin:/usr/bin:/bin:/app/agent/app/code_server:$PATH"

EXPOSE 8443
ENTRYPOINT ["/sbin/tini","--","/app/agent/agent_entrypoint.sh"]
