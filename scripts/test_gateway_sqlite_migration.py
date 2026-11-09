import copy
import importlib.util
from pathlib import Path
import sqlite3
import os
from unittest.mock import patch
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("migration", Path(__file__).with_name("migrate-gateway-to-sqlite.py"))
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


class GatewaySQLiteMigrationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.output = Path(self.directory.name) / "gateway.sqlite"
        self.snapshot = {
            "developer_clients": [{"client_id": "web", "owner_did": "did:plc:owner", "display_name": "L@tr 📚", "is_official": True, "billing_status": "preview", "stripe_customer_id": None, "daily_request_limit": 2147483647, "created_at": "2026-11-09T01:02:03.123456+00:00"}],
            "developer_api_keys": [{"key_id": "revoked", "client_id": "web", "key_hash": "keep-exact-hash", "label": None, "created_at": "2026-11-09T01:02:03Z", "revoked_at": "2026-11-09T03:02:03+02:00"}],
            "developer_usage_daily": [{"client_id": "web", "usage_date": "2026-11-09", "route_family": "save", "request_count": 123}],
            "bookmark_previews": [{"subject_hash": "subject-hash", "subject": "https://example.com/📚", "title": "Quote ' and newline\n", "description": None, "image_url": None, "site_name": "Example", "author": None, "updated_at": "2026-11-09T01:02:03Z", "expires_at": "2026-11-16T01:02:03Z"}],
        }

    def test_preserves_every_field_and_version(self):
        counts = migration.import_snapshot(copy.deepcopy(self.snapshot), self.output)
        self.assertEqual(counts, {name: 1 for name in migration.TABLES})
        with sqlite3.connect(self.output) as db:
            self.assertEqual(db.execute("PRAGMA user_version").fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT key_hash, revoked_at FROM developer_api_keys").fetchone(), ("keep-exact-hash", "2026-11-09T01:02:03.000000Z"))
            self.assertEqual(db.execute("SELECT display_name, is_official FROM developer_clients").fetchone(), ("L@tr 📚", 1))
            self.assertEqual(db.execute("SELECT request_count FROM developer_usage_daily").fetchone()[0], 123)
        self.assertEqual(self.output.stat().st_mode & 0o777, 0o600)

    def test_existing_database_is_never_replaced(self):
        self.output.write_bytes(b"existing")
        with self.assertRaises(ValueError):
            migration.import_snapshot(self.snapshot, self.output)
        self.assertEqual(self.output.read_bytes(), b"existing")

    def test_orphan_is_rejected_without_publishing(self):
        self.snapshot["developer_api_keys"][0]["client_id"] = "missing"
        with self.assertRaises(sqlite3.IntegrityError):
            migration.import_snapshot(self.snapshot, self.output)
        self.assertFalse(self.output.exists())
        self.assertEqual(list(self.output.parent.iterdir()), [])

    def test_unknown_columns_are_rejected(self):
        self.snapshot["developer_clients"][0]["surprise"] = 1
        with self.assertRaises(ValueError):
            migration.import_snapshot(self.snapshot, self.output)
        self.assertFalse(self.output.exists())

    def test_empty_database_can_be_imported(self):
        counts = migration.import_snapshot({name: [] for name in migration.TABLES}, self.output)
        self.assertEqual(counts, {name: 0 for name in migration.TABLES})

    def test_postgres_snapshot_is_read_only_and_hides_url_from_arguments(self):
        with patch.dict(os.environ, {"DATABASE_URL": "postgresql://secret@example/database"}):
            with patch.object(migration.subprocess, "run") as run:
                run.return_value.returncode = 0
                run.return_value.stdout = "{}"
                migration.export_postgres()
                args, kwargs = run.call_args
                self.assertNotIn("secret", str(args))
                self.assertIn("REPEATABLE READ READ ONLY", kwargs["input"])
                self.assertNotIn("DATABASE_URL", kwargs["env"])
                self.assertEqual(kwargs["env"]["PGDATABASE"], "postgresql://secret@example/database")

    def test_snapshot_is_private_and_never_replaced(self):
        path = self.output.with_suffix(".json")
        migration.write_snapshot(path, self.snapshot)
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        with self.assertRaises(FileExistsError):
            migration.write_snapshot(path, {})


if __name__ == "__main__":
    unittest.main()
