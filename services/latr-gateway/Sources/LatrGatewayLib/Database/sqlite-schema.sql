CREATE TABLE developer_clients (
    client_id TEXT PRIMARY KEY NOT NULL, owner_did TEXT NOT NULL, display_name TEXT,
    is_official INTEGER NOT NULL DEFAULT 0 CHECK(is_official IN (0, 1)),
    billing_status TEXT NOT NULL DEFAULT 'preview', stripe_customer_id TEXT,
    daily_request_limit INTEGER NOT NULL DEFAULT 10000 CHECK(daily_request_limit >= 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX developer_clients_owner_did_idx ON developer_clients(owner_did);

CREATE TABLE developer_api_keys (
    key_id TEXT PRIMARY KEY NOT NULL, client_id TEXT NOT NULL REFERENCES developer_clients(client_id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL, label TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), revoked_at TEXT
);

CREATE INDEX developer_api_keys_client_id_idx ON developer_api_keys(client_id);

CREATE INDEX developer_api_keys_key_hash_idx ON developer_api_keys(key_hash);

CREATE TABLE developer_usage_daily (
    client_id TEXT NOT NULL REFERENCES developer_clients(client_id) ON DELETE CASCADE,
    usage_date TEXT NOT NULL, route_family TEXT NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0 CHECK(request_count >= 0),
    PRIMARY KEY(client_id, usage_date, route_family)
);

CREATE TABLE bookmark_previews (
    subject_hash TEXT PRIMARY KEY NOT NULL, subject TEXT NOT NULL,
    title TEXT, description TEXT, image_url TEXT, site_name TEXT, author TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    expires_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now','+7 days'))
);

CREATE INDEX bookmark_previews_expires_at_idx ON bookmark_previews(expires_at);
PRAGMA user_version = 1;
