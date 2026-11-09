import Foundation
import HTTPTypes
import Logging

public actor SQLiteDeveloperStore: DeveloperStore {
    private let database: SQLiteDatabase
    private let officialEnvCredentials: [String: String]

    public init(database: SQLiteDatabase, officialEnvCredentials: [String: String] = [:], logger: Logger) {
        self.database = database
        self.officialEnvCredentials = officialEnvCredentials
    }

    public func resolveClientID(from headers: HTTPFields, requireClientAPIKey: Bool) async throws -> String? {
        guard requireClientAPIKey else { return nil }
        let clientID = headers[HTTPField.Name(latrClientIDHeader)!]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let apiKey = headers[HTTPField.Name(latrAPIKeyHeader)!]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !clientID.isEmpty, !apiKey.isEmpty {
            if let expected = officialEnvCredentials[clientID] {
                guard timingSafeEqual(hashClientCredential(apiKey), hashClientCredential(expected)) else { throw invalidCredential() }
                return clientID
            }
            guard try !query("SELECT 1 FROM developer_clients WHERE client_id = ?", [clientID]).isEmpty else {
                throw GatewayError(status: .forbidden, message: "Unknown gateway client", code: "unknown_client")
            }
            guard try !query("SELECT 1 FROM developer_api_keys WHERE client_id = ? AND key_hash = ? AND revoked_at IS NULL LIMIT 1", [clientID, hashClientCredential(apiKey)]).isEmpty else { throw invalidCredential() }
            return clientID
        }
        let credential = headers[HTTPField.Name(latrOfficialClientHeader)!]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !credential.isEmpty {
            for (clientID, expected) in officialEnvCredentials where timingSafeEqual(credential, expected) { return clientID }
            if let row = try query("SELECT client_id FROM developer_api_keys WHERE key_hash = ? AND revoked_at IS NULL LIMIT 1", [hashClientCredential(credential)]).first { return row[0] }
        }
        if officialEnvCredentials.isEmpty, try query("SELECT 1 FROM developer_clients LIMIT 1").isEmpty {
            throw GatewayError(status: .forbidden, message: "Gateway client credential policy enabled but no clients configured", code: "client_credential_policy")
        }
        throw invalidCredential()
    }

    public func listClients(ownerDID: String) async throws -> [DeveloperClientRecord] {
        try query("SELECT client_id, owner_did, display_name, is_official, billing_status, stripe_customer_id, daily_request_limit, created_at FROM developer_clients WHERE owner_did = ? ORDER BY client_id", [ownerDID]).map(clientRecord)
    }

    public func createClient(ownerDID: String, clientID: String, displayName: String?, isOfficial: Bool) async throws -> DeveloperClientRecord {
        let normalized = try normalizeClientID(clientID)
        do {
            let rows = try database.query("""
                INSERT INTO developer_clients(client_id, owner_did, display_name, is_official, billing_status, daily_request_limit)
                VALUES (?, ?, ?, ?, ?, ?)
                RETURNING client_id, owner_did, display_name, is_official, billing_status, stripe_customer_id, daily_request_limit, created_at
                """, [normalized, ownerDID, normalizeClientDisplayName(displayName), isOfficial ? "1" : "0", isOfficial ? "internal" : "preview", isOfficial ? String(Int32.max) : "10000"])
            return try clientRecord(rows[0])
        } catch let error as SQLiteDatabaseError where error.isUniqueConstraint {
            throw GatewayError(status: .conflict, message: "Gateway client already exists", code: "client_exists")
        } catch { throw mapped(error) }
    }

    public func deleteClient(ownerDID: String, clientID: String) async throws {
        let normalized = try normalizeClientID(clientID)
        try database.transaction {
            try assertOwner(ownerDID: ownerDID, clientID: normalized)
            try query("DELETE FROM developer_clients WHERE client_id = ? AND owner_did = ?", [normalized, ownerDID])
        }
    }

    public func listApiKeys(ownerDID: String, clientID: String) async throws -> [DeveloperApiKeyRecord] {
        let normalized = try normalizeClientID(clientID)
        return try database.transaction {
            try assertOwner(ownerDID: ownerDID, clientID: normalized)
            return try query("SELECT key_id, client_id, key_hash, label, created_at, revoked_at FROM developer_api_keys WHERE client_id = ? ORDER BY created_at, key_id", [normalized]).map(keyRecord)
        }
    }

    public func createApiKey(ownerDID: String, clientID: String, label: String?) async throws -> (record: DeveloperApiKeyRecord, apiKey: String) {
        let normalized = try normalizeClientID(clientID)
        return try database.transaction {
            try assertOwner(ownerDID: ownerDID, clientID: normalized)
            let key = generateDeveloperApiKey()
            let trimmed = label?.trimmingCharacters(in: .whitespacesAndNewlines)
            let row = try query("INSERT INTO developer_api_keys(key_id, client_id, key_hash, label) VALUES (?, ?, ?, ?) RETURNING key_id, client_id, key_hash, label, created_at, revoked_at", [newDeveloperKeyID(), normalized, hashClientCredential(key), trimmed?.isEmpty == false ? trimmed : nil])[0]
            return (try keyRecord(row), key)
        }
    }

    public func revokeApiKey(ownerDID: String, clientID: String, keyID: String) async throws {
        let normalized = try normalizeClientID(clientID)
        try database.transaction {
            try assertOwner(ownerDID: ownerDID, clientID: normalized)
            let rows = try query("UPDATE developer_api_keys SET revoked_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE key_id = ? AND client_id = ? AND revoked_at IS NULL RETURNING key_id", [keyID, normalized])
            guard !rows.isEmpty else { throw GatewayError(status: .notFound, message: "API key not found", code: "key_not_found") }
        }
    }

    public func recordUsage(clientID: String, routeFamily: String) async throws {
        if officialEnvCredentials[clientID] != nil { return }
        try query("""
            INSERT INTO developer_usage_daily(client_id, usage_date, route_family, request_count) VALUES (?, ?, ?, 1)
            ON CONFLICT(client_id, usage_date, route_family) DO UPDATE SET request_count = request_count + 1
            """, [clientID, todayUTC(), routeFamily])
    }

    public func usageSummaries(ownerDID: String) async throws -> [DeveloperUsageSummaryResponse] {
        let date = todayUTC()
        let clients = try await listClients(ownerDID: ownerDID)
        return try clients.map { client in
            let rows = try query("SELECT route_family, request_count FROM developer_usage_daily WHERE client_id = ? AND usage_date = ?", [client.clientID, date])
            var counts: [String: Int] = [:]
            for row in rows {
                guard let family = row[0], let countText = row[1], let count = Int(countText) else {
                    throw mapped(SQLiteDatabaseError(code: 20))
                }
                counts[family] = count
            }
            let buckets = ["saves", "og-preview", "discover", "auth", "other"].compactMap { family -> DeveloperUsageBucketResponse? in
                guard let count = counts[family], count > 0 else { return nil }
                return DeveloperUsageBucketResponse(routeFamily: family, requestCount: count)
            }
            let limit = client.dailyRequestLimit == Int.max ? nil : client.dailyRequestLimit
            let total = buckets.reduce(0) { $0 + $1.requestCount }
            return DeveloperUsageSummaryResponse(clientId: client.clientID, usageDate: date, buckets: buckets, dailyLimit: limit, remaining: limit.map { max(0, $0 - total) })
        }
    }

    public func assertWithinDailyLimit(clientID: String) async throws {
        if officialEnvCredentials[clientID] != nil { return }
        let rows = try query("""
            SELECT c.daily_request_limit, COALESCE(SUM(u.request_count), 0) FROM developer_clients c
            LEFT JOIN developer_usage_daily u ON u.client_id = c.client_id AND u.usage_date = ?
            WHERE c.client_id = ? GROUP BY c.daily_request_limit
            """, [todayUTC(), clientID])
        guard let row = rows.first, let limit = Int(row[0] ?? ""), let total = Int(row[1] ?? ""), limit != Int(Int32.max) else { return }
        if total >= limit {
            throw GatewayError(status: .tooManyRequests, message: "Daily request limit exceeded for client", code: "usage_limit_exceeded")
        }
    }

    private func assertOwner(ownerDID: String, clientID: String) throws {
        guard let row = try query("SELECT owner_did FROM developer_clients WHERE client_id = ?", [clientID]).first else {
            throw GatewayError(status: .notFound, message: "Gateway client not found", code: "client_not_found")
        }
        guard row[0] == ownerDID else { throw GatewayError(status: .forbidden, message: "Not authorized for this client", code: "forbidden") }
    }

    private func clientRecord(_ row: [String?]) throws -> DeveloperClientRecord {
        guard let clientID = row[0], let owner = row[1], let official = row[3], let billing = row[4], let limitText = row[6], let limit = Int(limitText), let created = row[7] else { throw mapped(SQLiteDatabaseError(code: 20)) }
        return DeveloperClientRecord(clientID: clientID, ownerDID: owner, displayName: row[2], isOfficial: official == "1", billingStatus: billing, stripeCustomerID: row[5], dailyRequestLimit: limit == Int(Int32.max) ? Int.max : limit, createdAt: created)
    }

    private func keyRecord(_ row: [String?]) throws -> DeveloperApiKeyRecord {
        guard let id = row[0], let client = row[1], let hash = row[2], let created = row[4] else { throw mapped(SQLiteDatabaseError(code: 20)) }
        return DeveloperApiKeyRecord(keyID: id, clientID: client, keyHash: hash, label: row[3], createdAt: created, revokedAt: row[5])
    }

    @discardableResult
    private func query(_ sql: String, _ values: [String?] = []) throws -> [[String?]] {
        do { return try database.query(sql, values) } catch { throw mapped(error) }
    }

    private func invalidCredential() -> GatewayError {
        GatewayError(status: .forbidden, message: "Invalid gateway client credentials", code: "invalid_client_credential")
    }

    private func mapped(_ error: Error) -> Error {
        if error is GatewayError { return error }
        return GatewayError(status: .internalServerError, message: "Database error", code: "database_error")
    }
}
