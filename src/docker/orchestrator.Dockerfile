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
RUN apk add --no-cache ca-certificates bash curl
WORKDIR /app
COPY --from=build /out/orchestrator /usr/local/bin/orchestrator
COPY orchestrator/configs /app/configs
ENV ORCHESTRATOR_CONFIG=/app/configs/orchestrator.example.yaml
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/orchestrator"]
