# syntax=docker/dockerfile:1
# Build context: services/latr-gateway (includes vendor/latr-kit from prepare-docker.sh).

FROM swift:6.1-jammy AS builder

WORKDIR /src
COPY vendor/latr-kit/ ./packages/latr-kit/
COPY . ./services/latr-gateway/

WORKDIR /src/services/latr-gateway
RUN swift build -c release --static-swift-stdlib

FROM ubuntu:22.04

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /src/services/latr-gateway/.build/release/LatrGateway /usr/local/bin/latr-gateway

ENV PORT=8080
EXPOSE 8080
USER nobody
ENTRYPOINT ["latr-gateway"]
