#!/usr/bin/env python3
"""PostgreSQL or legacy local JSON -> verified SQLite file. Never overwrites a file."""
import argparse
import datetime
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile

TABLES = {
    "developer_clients": ("client_id", "owner_did", "display_name", "is_official", "billing_status", "stripe_customer_id", "daily_request_limit", "created_at"),
    "developer_api_keys": ("key_id", "client_id", "key_hash", "label", "created_at", "revoked_at"),
    "developer_usage_daily": ("client_id", "usage_date", "route_family", "request_count"),
    "bookmark_previews": ("subject_hash", "subject", "title", "description", "image_url", "site_name", "author", "updated_at", "expires_at"),
}
SCHEMA_CANDIDATES = (
    Path(__file__).resolve().parents[1] / "services/latr-gateway/Sources/LatrGatewayLib/Database/sqlite-schema.sql",
    Path(__file__).resolve().parent / "LatrGateway_LatrGatewayLib.resources/sqlite-schema.sql",
)
SCHEMA = next((path for path in SCHEMA_CANDIDATES if path.is_file()), SCHEMA_CANDIDATES[0])


def canonical(rows):
    return sorted(json.dumps(row, sort_keys=True, ensure_ascii=False) for row in rows)


def export_postgres():
    if not os.environ.get("DATABASE_URL"):
        raise ValueError("DATABASE_URL is required unless --source-json is supplied")
    # One SQL statement in a read-only repeatable-read transaction is one consistent snapshot.
    parts = [f"'{table}', COALESCE((SELECT json_agg(t) FROM (SELECT {', '.join(columns)} FROM public.{table}) t), '[]'::json)" for table, columns in TABLES.items()]
    sql = "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL TIME ZONE 'UTC';\nSELECT json_build_object(" + ",".join(parts) + ");\nCOMMIT;"
    environment = os.environ.copy()
    environment["PGDATABASE"] = environment.pop("DATABASE_URL")
    result = subprocess.run(["psql", "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"], input=sql, text=True, capture_output=True, env=environment)
    if result.returncode:
        # psql errors may contain connection credentials; keep them out of logs.
        raise ValueError("Postgres snapshot failed; verify connectivity and source schema")
    return json.loads(result.stdout)


def write_snapshot(path, snapshot):
    with open(path, "x", encoding="utf-8", opener=lambda p, flags: os.open(p, flags, 0o600)) as stream:
        json.dump(snapshot, stream, ensure_ascii=False)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())


def legacy_snapshot(source):
    """Decode Swift's Codable DeveloperStoreSnapshot without dropping any records."""
    if not isinstance(source, dict) or set(source) != {"clients", "apiKeys", "usage"}:
        raise ValueError("Invalid legacy developer snapshot")
    if any(not isinstance(source[name], dict) for name in source):
        raise ValueError("Legacy snapshot collections must be dictionaries")
    snapshot = {table: [] for table in TABLES}
    client_fields = {"clientID", "ownerDID", "displayName", "isOfficial", "billingStatus", "stripeCustomerID", "dailyRequestLimit", "createdAt"}
    key_fields = {"keyID", "clientID", "keyHash", "label", "createdAt", "revokedAt"}

    def record(value, fields, optional):
        if not isinstance(value, dict) or not fields - optional <= set(value) or not set(value) <= fields:
            raise ValueError("Invalid legacy record fields")
        for field in fields - {"isOfficial", "dailyRequestLimit"}:
            item = value.get(field)
            if not isinstance(item, str) and not (field in optional and item is None):
                raise ValueError("Invalid legacy text field")

    for identifier, value in source["clients"].items():
        record(value, client_fields, {"displayName", "stripeCustomerID"})
        limit = value["dailyRequestLimit"]
        if identifier != value["clientID"] or type(value["isOfficial"]) is not bool or type(limit) is not int or not 0 <= limit <= 9223372036854775807:
            raise ValueError("Invalid legacy client identity or limit")
        snapshot["developer_clients"].append(dict(zip(TABLES["developer_clients"], (
            value["clientID"], value["ownerDID"], value.get("displayName"), value["isOfficial"], value["billingStatus"],
            value.get("stripeCustomerID"), 2147483647 if limit == 9223372036854775807 else limit, value["createdAt"],
        ))))
    for identifier, value in source["apiKeys"].items():
        record(value, key_fields, {"label", "revokedAt"})
        if identifier != value["keyID"]:
            raise ValueError("Invalid legacy API key identity")
        snapshot["developer_api_keys"].append(dict(zip(TABLES["developer_api_keys"], (
            value["keyID"], value["clientID"], value["keyHash"], value.get("label"), value["createdAt"], value.get("revokedAt"),
        ))))
    for identifier, count in source["usage"].items():
        parts = identifier.split("|")
        if len(parts) != 3 or not all(parts) or type(count) is not int or not 0 <= count <= 9223372036854775807:
            raise ValueError("Invalid legacy usage entry")
        if datetime.date.fromisoformat(parts[1]).isoformat() != parts[1]:
            raise ValueError("Invalid legacy usage date")
        snapshot["developer_usage_daily"].append(dict(zip(TABLES["developer_usage_daily"], (*parts, count))))
    return snapshot


def normalize(snapshot):
    if set(snapshot) != set(TABLES):
        raise ValueError("Snapshot must contain exactly the four gateway tables")
    for table, columns in TABLES.items():
        if not isinstance(snapshot[table], list):
            raise ValueError(f"Invalid rows for {table}")
        for row in snapshot[table]:
            if not isinstance(row, dict) or set(row) != set(columns):
                raise ValueError(f"Unexpected columns in {table}")
            for column in ("created_at", "revoked_at", "updated_at", "expires_at"):
                if column in row and row[column] is not None:
                    # The legacy JSON store persisted env-generated records with empty dates.
                    if column == "created_at" and row[column] == "" and (
                        (table == "developer_clients" and row["owner_did"] == "official:env" and row["is_official"])
                        or (table == "developer_api_keys" and row["key_id"].startswith("env:") and row["label"] == "env")
                    ):
                        continue
                    value = datetime.datetime.fromisoformat(row[column].replace("Z", "+00:00"))
                    if value.tzinfo is None:
                        raise ValueError(f"Timezone missing in {table}.{column}")
                    row[column] = value.astimezone(datetime.timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")
            if table == "developer_clients":
                if row["is_official"] not in (True, False, 0, 1):
                    raise ValueError("Invalid is_official value")
                row["is_official"] = int(row["is_official"])
    return snapshot


def import_snapshot(snapshot, destination, schema=SCHEMA):
    snapshot = normalize(snapshot)
    if destination.exists():
        raise ValueError("Destination already exists; choose a new SQLite path")
    fd, temporary = tempfile.mkstemp(prefix=".latr-migrate-", dir=destination.parent)
    os.close(fd)
    connection = None
    try:
        connection = sqlite3.connect(temporary)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        connection.executescript(schema.read_text())
        with connection:
            for table, columns in TABLES.items():
                connection.executemany(f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({','.join('?' for _ in columns)})", [tuple(row[column] for column in columns) for row in snapshot[table]])
            connection.execute("PRAGMA user_version=1")
        if connection.execute("PRAGMA integrity_check").fetchall()[0][0] != "ok":
            raise ValueError("SQLite integrity check failed")
        if connection.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("SQLite foreign key check failed")
        for table, columns in TABLES.items():
            rows = [dict(row) for row in connection.execute(f"SELECT {', '.join(columns)} FROM {table}")]
            if canonical(rows) != canonical(snapshot[table]):
                raise ValueError(f"Row verification failed for {table}")
        connection.close()
        connection = None
        with open(temporary, "rb") as stream:
            os.fsync(stream.fileno())
        # Atomic publish with no replacement, including against competing processes.
        os.link(temporary, destination)
        directory = os.open(destination.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
        return {table: len(rows) for table, rows in snapshot.items()}
    finally:
        if connection is not None:
            connection.close()
        os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    sources = parser.add_mutually_exclusive_group()
    sources.add_argument("--source-json", type=Path, help="Import a previously captured Postgres snapshot")
    sources.add_argument("--legacy-developer-json", type=Path, help="Import Swift's legacy local developer-store.json")
    parser.add_argument("--export-json", type=Path, help="Required for Postgres: retain the source snapshot (0600 permissions)")
    args = parser.parse_args()
    try:
        if not args.source_json and not args.legacy_developer_json and not args.export_json:
            raise ValueError("--export-json is required when exporting Postgres")
        if args.output.exists():
            raise ValueError("Destination already exists")
        if args.legacy_developer_json:
            snapshot = legacy_snapshot(json.loads(args.legacy_developer_json.read_text()))
        else:
            snapshot = json.loads(args.source_json.read_text()) if args.source_json else export_postgres()
        if args.export_json:
            write_snapshot(args.export_json, snapshot)
        counts = import_snapshot(snapshot, args.output)
    except (ValueError, TypeError, OSError, sqlite3.Error, subprocess.SubprocessError):
        parser.exit(1, "Migration failed; no unverified SQLite database was published. Check paths, connectivity, source data and schema.\n")
    print(json.dumps({"verified_rows": counts, "output": str(args.output)}))


if __name__ == "__main__":
    main()
