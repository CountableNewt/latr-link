#!/usr/bin/env python3
"""Migration rehearsal against real SQLite and an in-process Hrana pipeline.

No network, production database, or provider credentials are used.
"""
import concurrent.futures
import contextlib
import hashlib
import importlib.util
import io
import json
import os
import pathlib
import re
import sqlite3
import sys
import tempfile
import threading
import unittest
import urllib.error
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("turso_migrate", ROOT / "scripts/turso-migrate.py")
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)
SCHEMA = (ROOT / "services/go-backend/migrations/001_operational.sql").read_text()
LEGACY_SCHEMA = (ROOT / "scripts/fixtures/legacy-gateway-sqlite-schema.sql").read_text()
GO_STORAGE = (ROOT / "services/go-backend/internal/storage/turso.go").read_text()


@contextlib.contextmanager
def database_connection(path, **kwargs):
    with contextlib.closing(sqlite3.connect(path, **kwargs)) as connection:
        with connection:
            yield connection


def preview(subject, title="Article", updated="2026-01-01T00:00:00Z", expires="2999-01-01T00:00:00Z"):
    return (hashlib.sha256(subject.encode()).hexdigest(), subject, title, None, "", None, None, updated, expires)


class Pipeline:
    """Accept the real script's HTTP payload and execute it on a temporary target."""
    def __init__(self, connection):
        self.connection = connection
        self.payloads = []

    def open(self, request, timeout):
        if request.full_url != "https://example.turso.io/v2/pipeline":
            raise AssertionError("Unexpected target")
        if request.get_header("Authorization") != "Bearer local-test-token":
            raise AssertionError("Missing test credential")
        if timeout != 30:
            raise AssertionError("Missing bounded request")
        body = json.loads(request.data)
        self.payloads.append(body)
        results = []
        for operation in body["requests"]:
            if operation["type"] == "close":
                results.append({"type": "ok", "response": {"type": "close"}})
                continue
            stmt = operation["stmt"]
            args = []
            for value in stmt["args"]:
                if value["type"] == "null":
                    args.append(None)
                elif value["type"] == "text" and "value" in value:
                    args.append(value["value"])
                else:
                    raise AssertionError("Invalid Hrana argument")
            cursor = self.connection.execute(stmt["sql"], args)
            rows = cursor.fetchall() if cursor.description else []
            encoded_rows = [[{"type": "null"} if v is None else {
                "type": "integer" if isinstance(v, int) else "text", "value": str(v)
            } for v in row] for row in rows]
            results.append({"type": "ok", "response": {"type": "execute", "result": {
                "rows": encoded_rows, "affected_row_count": max(0, cursor.rowcount)
            }}})
        return io.BytesIO(json.dumps({"results": results}).encode())


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.source = pathlib.Path(self.temp.name) / "railway.sqlite"
        source = sqlite3.connect(self.source)
        source.executescript(LEGACY_SCHEMA)
        source.execute("INSERT INTO developer_clients(client_id,owner_did) VALUES (?,?)",
                       ("retired-secret-client", "did:plc:retired"))
        source.execute("INSERT INTO developer_api_keys(key_id,client_id,key_hash) VALUES (?,?,?)",
                       ("retired-key", "retired-secret-client", "secret-that-must-never-migrate"))
        source.execute("CREATE TABLE dpop_replay(proof_hash TEXT PRIMARY KEY, expires_at INTEGER)")
        source.execute("INSERT INTO dpop_replay VALUES ('transient-replay-secret',9999999999)")
        source.commit()
        source.close()
        self.target = sqlite3.connect(":memory:", isolation_level=None)
        self.addCleanup(self.target.close)
        self.pipeline = Pipeline(self.target)

    def add_source(self, *rows):
        with database_connection(self.source) as connection:
            connection.executemany("INSERT INTO bookmark_previews VALUES (?,?,?,?,?,?,?,?,?)", rows)

    def run_migration(self, dry=False):
        argv = ["turso-migrate.py", "--sqlite", str(self.source)]
        if dry:
            argv.append("--dry-run")
        out = io.StringIO()
        with mock.patch.object(sys, "argv", argv), mock.patch.dict(os.environ, {
            "TURSO_DATABASE_URL": "libsql://example.turso.io", "TURSO_AUTH_TOKEN": "local-test-token"
        }), mock.patch.object(MIGRATION.urllib.request, "build_opener", return_value=self.pipeline), contextlib.redirect_stdout(out):
            MIGRATION.main()
        return json.loads(out.getvalue())

    def test_read_only_source_excludes_expired_previews_and_retired_secrets(self):
        valid = preview("https://example.com/valid")
        self.add_source(valid, preview("https://example.com/expired", expires="2000-01-01T00:00:00Z"))
        before = self.source.read_bytes()
        real_connect = sqlite3.connect
        read_uris = []

        def inspect_read_only(database, **kwargs):
            self.assertTrue(database.endswith("?mode=ro"))
            self.assertTrue(kwargs.get("uri"))
            connection = real_connect(database, **kwargs)
            with self.assertRaisesRegex(sqlite3.OperationalError, "readonly"):
                connection.execute("CREATE TABLE should_not_write(value TEXT)")
            read_uris.append(database)
            return connection

        with mock.patch.object(MIGRATION.sqlite3, "connect", side_effect=inspect_read_only):
            report = self.run_migration()
        self.assertEqual(len(read_uris), 1)
        self.assertEqual(self.source.read_bytes(), before)
        self.assertEqual(report["previewRowsVerified"], 1)
        self.assertTrue(report["developerDataExcluded"])
        self.assertEqual(self.target.execute("SELECT * FROM bookmark_previews").fetchall(), [valid])
        tables = {row[0] for row in self.target.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertEqual(tables, {"bookmark_previews", "dpop_replay"})
        self.assertEqual(self.target.execute("SELECT count(*) FROM dpop_replay").fetchone()[0], 0)
        encoded = json.dumps(self.pipeline.payloads)
        for secret in ["retired-secret-client", "secret-that-must-never-migrate", "transient-replay-secret", "https://example.com/expired"]:
            self.assertNotIn(secret, encoded)
        self.assertFalse(pathlib.Path(str(self.source) + "-journal").exists())

    def test_checksum_mismatch_aborts_before_any_target_write(self):
        corrupt = list(preview("https://example.com/corrupt"))
        corrupt[0] = "0" * 64
        self.add_source(tuple(corrupt))
        with self.assertRaisesRegex(ValueError, "checksum mismatch"):
            self.run_migration()
        self.assertEqual(self.pipeline.payloads, [])
        self.assertEqual(self.target.execute("SELECT count(*) FROM sqlite_master").fetchone()[0], 0)

    def test_preserves_timestamps_and_newer_or_equal_target_entries_on_rerun(self):
        older_source = preview("https://example.com/preserved", "Source older", "2026-01-02T00:00:00+02:00")
        equal_source = preview("https://example.com/equal", "Source equal", "2026-01-01T00:00:00Z")
        newer_source = preview("https://example.com/updated", "Source newer", "2026-01-01T00:00:00.900Z")
        self.add_source(older_source, equal_source, newer_source)
        self.target.executescript(SCHEMA)
        preserved = preview(older_source[1], "Target newer", "2026-01-01T23:00:00Z")
        equal = preview(equal_source[1], "Target equal", equal_source[7])
        outdated = preview(newer_source[1], "Target older", "2026-01-01T00:00:00Z")
        self.target.executemany("INSERT INTO bookmark_previews VALUES (?,?,?,?,?,?,?,?,?)", [preserved, equal, outdated])
        for _ in range(2):
            report = self.run_migration()
            self.assertEqual(report["previewRowsVerified"], 3)
            actual = {row[1]: row for row in self.target.execute("SELECT * FROM bookmark_previews")}
            self.assertEqual(actual, {preserved[1]: preserved, equal[1]: equal, newer_source[1]: newer_source})

    def test_dry_run_has_no_target_or_credential_requirement(self):
        self.add_source(preview("https://example.com/a"))
        report = self.run_migration(dry=True)
        self.assertEqual(report, {"previewRows": 1, "sourceReadOnly": True, "developerDataExcluded": True})
        self.assertEqual(self.pipeline.payloads, [])

    def test_batches_larger_imports_and_verifies_every_hash(self):
        rows = [preview("https://example.com/" + str(i)) for i in range(107)]
        self.add_source(*rows)
        report = self.run_migration()
        self.assertEqual(report["previewRowsVerified"], len(rows))
        self.assertEqual(self.target.execute("SELECT count(*) FROM bookmark_previews").fetchone()[0], len(rows))
        batches = [p for p in self.pipeline.payloads if p["requests"][0]["type"] == "execute"
                   and p["requests"][0]["stmt"]["sql"] == "BEGIN IMMEDIATE"]
        self.assertEqual([len(p["requests"]) for p in batches], [53, 53, 10])

    def test_credentials_reject_unsafe_or_malformed_urls(self):
        for raw in ["http://example.turso.io", "https://user:password@example.turso.io",
                    "https://example.turso.io?token=secret", "https://example.turso.io#fragment", "https://"]:
            with self.subTest(raw=raw), mock.patch.dict(os.environ, {"TURSO_DATABASE_URL": raw, "TURSO_AUTH_TOKEN": "test"}):
                with self.assertRaises(ValueError):
                    MIGRATION.credentials()

    def test_remote_errors_are_sanitized_and_never_report_success(self):
        class FailedPipeline:
            def open(self, request, timeout):
                raise urllib.error.URLError("sensitive remote diagnostics")
        with mock.patch.object(MIGRATION.urllib.request, "build_opener", return_value=FailedPipeline()):
            with self.assertRaises(RuntimeError) as caught:
                MIGRATION.execute("https://example.turso.io", "private-test-token", [("SELECT 1", [])])
        self.assertNotIn("private-test-token", str(caught.exception))
        self.assertNotIn("sensitive", str(caught.exception))

    def test_database_redirects_are_refused(self):
        request = MIGRATION.urllib.request.Request("https://example.turso.io/v2/pipeline")
        with self.assertRaises(urllib.error.HTTPError) as caught:
            MIGRATION.NoRedirect().redirect_request(request, None, 302, "Redirect", {}, "https://attacker.example")
        caught.exception.close()


class OperationalSQLTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.database = pathlib.Path(self.temp.name) / "operational.sqlite"
        with database_connection(self.database) as connection:
            connection.executescript(SCHEMA)
        self.claim = re.search(r"s\.Query\(ctx, `(INSERT INTO dpop_replay.*?)`", GO_STORAGE, re.S).group(1)
        self.cleanup = re.findall(r"`(DELETE FROM (?:dpop_replay|bookmark_previews).*?)`", GO_STORAGE, re.S)

    def test_actual_sql_concurrent_claim_has_exactly_one_winner(self):
        barrier = threading.Barrier(16)
        def compete(_):
            with database_connection(self.database, timeout=20) as connection:
                barrier.wait()
                now = connection.execute("SELECT unixepoch()").fetchone()[0]
                return connection.execute(self.claim, ("same-proof", str(now + 300))).rowcount
        with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
            counts = list(pool.map(compete, range(16)))
        self.assertEqual(sum(counts), 1)
        with database_connection(self.database) as connection:
            self.assertEqual(connection.execute("SELECT count(*) FROM dpop_replay").fetchone()[0], 1)

    def test_expired_claim_replaced_live_claim_preserved(self):
        with database_connection(self.database) as connection:
            now = connection.execute("SELECT unixepoch()").fetchone()[0]
            connection.executemany("INSERT INTO dpop_replay VALUES (?,?)", [("expired", now), ("live", now + 100)])
            self.assertEqual(connection.execute(self.claim, ("expired", str(now + 300))).rowcount, 1)
            self.assertEqual(connection.execute(self.claim, ("live", str(now + 300))).rowcount, 0)
            self.assertEqual(connection.execute("SELECT expires_at FROM dpop_replay WHERE proof_hash='live'").fetchone()[0], now + 100)

    def test_cleanup_is_bounded_and_keeps_live_rows(self):
        self.assertEqual(len(self.cleanup), 2)
        with database_connection(self.database) as connection:
            now = connection.execute("SELECT unixepoch()").fetchone()[0]
            connection.executemany("INSERT INTO dpop_replay VALUES (?,?)", [(str(i), now - 1) for i in range(10005)] + [("live", now + 300)])
            connection.executemany("INSERT INTO bookmark_previews VALUES (?,?,?,?,?,?,?,?,?)", [preview("https://example.com/" + str(i), expires="2000-01-01T00:00:00Z") for i in range(1003)] + [preview("https://example.com/live")])
            for sql in self.cleanup:
                connection.execute(sql)
            self.assertEqual(connection.execute("SELECT count(*) FROM dpop_replay").fetchone()[0], 6)
            self.assertEqual(connection.execute("SELECT count(*) FROM bookmark_previews").fetchone()[0], 4)
            self.assertEqual(connection.execute("SELECT count(*) FROM dpop_replay WHERE proof_hash='live'").fetchone()[0], 1)
            self.assertEqual(connection.execute("SELECT count(*) FROM bookmark_previews WHERE subject='https://example.com/live'").fetchone()[0], 1)
            for sql in self.cleanup:
                connection.execute(sql)
            self.assertEqual(connection.execute("SELECT count(*) FROM dpop_replay").fetchone()[0], 1)
            self.assertEqual(connection.execute("SELECT count(*) FROM bookmark_previews").fetchone()[0], 1)


if __name__ == "__main__":
    unittest.main()
