# syntax=docker/dockerfile:1
# Build context: monorepo root (LatrKit resolves from GitHub via SwiftPM).

FROM swift:6.4-jammy AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY services/latr-gateway/ ./services/latr-gateway/

WORKDIR /src/services/latr-gateway
RUN swift build -c release --static-swift-stdlib -Xswiftc -warnings-as-errors

FROM ubuntu:22.04

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libcurl4 libsqlite3-0 sqlite3 gosu postgresql-client python3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /src/services/latr-gateway/.build/release/LatrGateway /usr/local/bin/latr-gateway
COPY --from=builder /src/services/latr-gateway/.build/release/LatrGateway_LatrGatewayLib.resources /usr/local/bin/LatrGateway_LatrGatewayLib.resources
COPY services/latr-gateway/migrations /app/database/migrations
COPY scripts/apply-database-migrations.sh /usr/local/bin/apply-database-migrations
COPY scripts/start-latr-gateway.sh /usr/local/bin/start-latr-gateway
COPY scripts/migrate-gateway-to-sqlite.py /usr/local/bin/migrate-gateway-to-sqlite

RUN chmod +x /usr/local/bin/latr-gateway /usr/local/bin/apply-database-migrations /usr/local/bin/start-latr-gateway

RUN mkdir -p /var/lib/latr-gateway/data \
    && chown -R nobody:nogroup /var/lib/latr-gateway

WORKDIR /var/lib/latr-gateway

ENV PORT=8080
ENV LATR_GATEWAY_SQLITE_PATH=/data/latr-gateway.sqlite
ENV MIGRATIONS_DIR=/app/database/migrations
EXPOSE 8080
ENTRYPOINT ["start-latr-gateway"]
