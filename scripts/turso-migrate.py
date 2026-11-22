#!/usr/bin/env python3
"""Apply operational schema and copy unexpired previews from a read-only backup.

Never imports retired developer accounts, keys, or transient replay claims.
Credentials are read from the environment or a local Vercel env file, never argv.
"""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import shlex
import sqlite3
import urllib.request
import urllib.error
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent


def credentials(env_file=None):
    env = dict(os.environ)
    if env_file:
        for line in pathlib.Path(env_file).read_text().splitlines():
            if not line.strip() or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            parsed = shlex.split(value)
            env[key] = parsed[0] if parsed else ""
    url, token = env.get("TURSO_DATABASE_URL", ""), env.get("TURSO_AUTH_TOKEN", "")
    url = url.replace("libsql://", "https://").replace("turso://", "https://")
    parsed_url=urllib.parse.urlsplit(url)
    if (parsed_url.scheme != "https" or not parsed_url.hostname or parsed_url.username is not None
            or parsed_url.password is not None or parsed_url.query or parsed_url.fragment or not token):
        raise ValueError("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required")
    return url.rstrip("/"), token


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """An authenticated database call must never forward credentials to a redirect."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, "Database redirects are refused", headers, fp)


def execute(url, token, statements):
    requests = [{"type": "execute", "stmt": {"sql": sql, "args": [
        {"type": "null"} if value is None else {"type": "text", "value": str(value)}
        for value in args]}} for sql, args in statements]
    requests.append({"type": "close"})
    req = urllib.request.Request(url + "/v2/pipeline", data=json.dumps({"requests": requests}).encode(),
                                 headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=30) as response:
            result = json.load(response)
    except (urllib.error.URLError, json.JSONDecodeError):
        raise RuntimeError("Turso migration request failed; credentials and remote error bodies withheld") from None
    if len(result.get("results", [])) != len(requests) or any(row["type"] != "ok" for row in result["results"]):
        raise RuntimeError("Turso migration statement failed; credentials and remote error bodies withheld")
    return result


def preview_rows(source):
    connection = sqlite3.connect(pathlib.Path(source).resolve().as_uri() + "?mode=ro", uri=True)
    try:
        rows = connection.execute("""SELECT subject_hash,subject,title,description,image_url,site_name,author,updated_at,expires_at
            FROM bookmark_previews WHERE julianday(expires_at)>julianday('now') ORDER BY subject_hash""").fetchall()
        for row in rows:
            if hashlib.sha256(row[1].encode()).hexdigest() != row[0]:
                raise ValueError("Preview subject checksum mismatch")
        return rows
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file")
    parser.add_argument("--sqlite", help="Read-only Railway SQLite backup; previews only")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    rows = preview_rows(args.sqlite) if args.sqlite else []
    if args.dry_run:
        print(json.dumps({"previewRows": len(rows), "sourceReadOnly": True, "developerDataExcluded": True}))
        return
    url, token = credentials(args.env_file)
    schema = (ROOT / "services/go-backend/migrations/001_operational.sql").read_text()
    schema = "\n".join(line for line in schema.splitlines() if not line.lstrip().startswith("--"))
    execute(url, token, [(sql, []) for sql in schema.split(";") if sql.strip()])
    sql = """INSERT INTO bookmark_previews(subject_hash,subject,title,description,image_url,site_name,author,updated_at,expires_at)
        VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(subject_hash) DO UPDATE SET subject=excluded.subject,title=excluded.title,
        description=excluded.description,image_url=excluded.image_url,site_name=excluded.site_name,author=excluded.author,
        updated_at=excluded.updated_at,expires_at=excluded.expires_at WHERE julianday(excluded.updated_at)>julianday(bookmark_previews.updated_at)"""
    for start in range(0, len(rows), 50):
        execute(url, token, [("BEGIN IMMEDIATE", [])] + [(sql, row) for row in rows[start:start+50]] + [("COMMIT", [])])
    # Verify imported hashes individually, including reruns that preserve newer cache entries.
    for start in range(0, len(rows), 50):
        keys = [row[0] for row in rows[start:start+50]]
        result = execute(url, token, [("SELECT count(*) FROM bookmark_previews WHERE subject_hash IN (" + ",".join("?" for _ in keys) + ")", keys)])
        count = int(result["results"][0]["response"]["result"]["rows"][0][0]["value"])
        if count != len(keys):
            raise RuntimeError("Preview import verification failed")
    print(json.dumps({"schemaApplied": True, "previewRowsVerified": len(rows), "developerDataExcluded": True,
                      "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat()}))


if __name__ == "__main__":
    main()
