-- Only operational state. User bookmarks and metadata remain on the PDS.
CREATE TABLE IF NOT EXISTS dpop_replay (
 proof_hash TEXT PRIMARY KEY,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS dpop_replay_expiry ON dpop_replay(expires_at);
CREATE TABLE IF NOT EXISTS bookmark_previews (
 subject_hash TEXT PRIMARY KEY,
 subject TEXT NOT NULL,
 title TEXT, description TEXT, image_url TEXT, site_name TEXT, author TEXT,
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
 expires_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now','+7 days'))
);
CREATE INDEX IF NOT EXISTS bookmark_previews_expiry ON bookmark_previews(expires_at);
