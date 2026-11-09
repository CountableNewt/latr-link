import Foundation
import HTTPTypes
@testable import LatrGatewayLib
import Logging
import XCTest

final class SQLiteStoreTests: XCTestCase {
    private let owner = "did:plc:sqlite-developer"

    private func temporaryPath() throws -> String {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        return directory.appendingPathComponent("gateway.sqlite").path
    }

    private func store(_ database: SQLiteDatabase, credentials: [String: String] = [:]) -> SQLiteDeveloperStore {
        SQLiteDeveloperStore(database: database, officialEnvCredentials: credentials, logger: Logger(label: "sqlite-tests"))
    }

    private func headers(client: String, key: String) -> HTTPFields {
        var fields = HTTPFields()
        fields[HTTPField.Name(latrClientIDHeader)!] = client
        fields[HTTPField.Name(latrAPIKeyHeader)!] = key
        return fields
    }

    func testClientsKeysAndUsagePersistAcrossReopen() async throws {
        let path = try temporaryPath()
        let (created, key) = try await seedDatabase(path)
        let database = try SQLiteDatabase(path: path)
        let reopened = store(database)
        let clients = try await reopened.listClients(ownerDID: owner)
        XCTAssertEqual(clients, [created])
        let resolved = try await reopened.resolveClientID(from: headers(client: created.clientID, key: key), requireClientAPIKey: true)
        XCTAssertEqual(resolved, created.clientID)
        let summaries = try await reopened.usageSummaries(ownerDID: owner)
        XCTAssertEqual(summaries.first?.buckets.first?.requestCount, 1)
        XCTAssertEqual(summaries.first?.remaining, 9_999)
        let mode = try FileManager.default.attributesOfItem(atPath: path)[.posixPermissions] as? NSNumber
        XCTAssertEqual(mode?.intValue, 0o600)
    }

    private func seedDatabase(_ path: String) async throws -> (DeveloperClientRecord, String) {
        let database = try SQLiteDatabase(path: path)
        let seeded = store(database)
        let created = try await seeded.createClient(ownerDID: owner, clientID: "sqlite-app", displayName: "日本語 🔖 O'Reilly", isOfficial: false)
        let key = try await seeded.createApiKey(ownerDID: owner, clientID: created.clientID, label: " primary ")
        XCTAssertNotEqual(key.record.keyHash, key.apiKey)
        try await seeded.recordUsage(clientID: created.clientID, routeFamily: "saves")
        return (created, key.apiKey)
    }

    func testOwnershipDuplicateRevocationAndCascade() async throws {
        let database = try SQLiteDatabase(path: ":memory:")
        let subject = store(database)
        _ = try await subject.createClient(ownerDID: owner, clientID: "my-app", displayName: nil, isOfficial: false)
        do {
            _ = try await subject.createClient(ownerDID: "other", clientID: "my-app", displayName: nil, isOfficial: false)
            XCTFail("Duplicate client should fail")
        } catch let error as GatewayError { XCTAssertEqual(error.code, "client_exists") }
        do {
            _ = try await subject.createApiKey(ownerDID: "other", clientID: "my-app", label: nil)
            XCTFail("Other owners cannot create keys")
        } catch let error as GatewayError { XCTAssertEqual(error.code, "forbidden") }
        let key = try await subject.createApiKey(ownerDID: owner, clientID: "my-app", label: nil)
        try await subject.recordUsage(clientID: "my-app", routeFamily: "saves")
        try await subject.revokeApiKey(ownerDID: owner, clientID: "my-app", keyID: key.record.keyID)
        do {
            _ = try await subject.resolveClientID(from: headers(client: "my-app", key: key.apiKey), requireClientAPIKey: true)
            XCTFail("Revoked key should fail")
        } catch let error as GatewayError { XCTAssertEqual(error.code, "invalid_client_credential") }
        try await subject.deleteClient(ownerDID: owner, clientID: "my-app")
        XCTAssertTrue(try database.query("SELECT * FROM developer_api_keys").isEmpty)
        XCTAssertTrue(try database.query("SELECT * FROM developer_usage_daily").isEmpty)
    }

    func testOfficialCredentialsAndPolicy() async throws {
        let database = try SQLiteDatabase(path: ":memory:")
        let subject = store(database, credentials: ["official": "secret"])
        let resolved = try await subject.resolveClientID(from: headers(client: "official", key: "secret"), requireClientAPIKey: true)
        XCTAssertEqual(resolved, "official")
        var legacy = HTTPFields()
        legacy[HTTPField.Name(latrOfficialClientHeader)!] = "secret"
        let legacyResolved = try await subject.resolveClientID(from: legacy, requireClientAPIKey: true)
        XCTAssertEqual(legacyResolved, "official")
        try await subject.recordUsage(clientID: "official", routeFamily: "saves")
        XCTAssertTrue(try database.query("SELECT * FROM developer_usage_daily").isEmpty)
        let absent = try await subject.resolveClientID(from: HTTPFields(), requireClientAPIKey: false)
        XCTAssertNil(absent)
        do {
            _ = try await store(database).resolveClientID(from: HTTPFields(), requireClientAPIKey: true)
            XCTFail("No configured clients should fail closed")
        } catch let error as GatewayError { XCTAssertEqual(error.code, "client_credential_policy") }
    }

    func testConcurrentConnectionsIncrementWithoutLostUpdatesAndEnforceLimit() async throws {
        let path = try temporaryPath()
        let database = try SQLiteDatabase(path: path)
        let first = store(database)
        let second = store(try SQLiteDatabase(path: path))
        _ = try await first.createClient(ownerDID: owner, clientID: "usage-app", displayName: nil, isOfficial: false)
        try await withThrowingTaskGroup(of: Void.self) { group in
            for i in 0..<100 {
                let subject = i.isMultiple(of: 2) ? first : second
                group.addTask { try await subject.recordUsage(clientID: "usage-app", routeFamily: "saves") }
            }
            try await group.waitForAll()
        }
        let summaries = try await first.usageSummaries(ownerDID: owner)
        XCTAssertEqual(summaries.first?.buckets.first?.requestCount, 100)
        try database.query("UPDATE developer_clients SET daily_request_limit = 100 WHERE client_id = 'usage-app'")
        do {
            try await second.assertWithinDailyLimit(clientID: "usage-app")
            XCTFail("Limit should apply across connections")
        } catch let error as GatewayError { XCTAssertEqual(error.code, "usage_limit_exceeded") }
    }

    func testPreviewPersistenceReplacementExpiryAndExactSubjects() async throws {
        let path = try temporaryPath()
        let subject = "https://example.com/path?one=two#fragment"
        let initial = OpenGraphFields(title: "Title", description: "Quoted ' description\u{0}end", image: nil, siteName: "日本語", author: nil)
        do {
            let previews = SQLiteBookmarkPreviewStore(database: try SQLiteDatabase(path: path))
            try await previews.store(initial, for: subject)
        }
        let database = try SQLiteDatabase(path: path)
        let previews = SQLiteBookmarkPreviewStore(database: database)
        let loaded = try await previews.preview(for: subject)
        XCTAssertEqual(loaded, initial)
        let different = try await previews.preview(for: subject + "a")
        XCTAssertNil(different)
        let replacement = OpenGraphFields(title: nil, description: nil, image: "https://example.com/image.jpg", siteName: nil, author: "Author")
        try await previews.store(replacement, for: subject)
        let updated = try await previews.preview(for: subject)
        XCTAssertEqual(updated, replacement)
        try database.query("UPDATE bookmark_previews SET expires_at = '2000-01-01T00:00:00Z'")
        let expired = try await previews.preview(for: subject)
        XCTAssertNil(expired)
        try await previews.store(initial, for: subject)
        let refreshed = try await previews.preview(for: subject)
        XCTAssertEqual(refreshed, initial)
    }

    func testConcurrentInitializationPreservesBothWriters() async throws {
        let path = try temporaryPath()
        try await withThrowingTaskGroup(of: Void.self) { group in
            for index in 0..<2 {
                group.addTask {
                    let database = try SQLiteDatabase(path: path)
                    try database.query("INSERT INTO developer_clients(client_id, owner_did) VALUES (?, 'owner')", ["writer-\(index)"])
                }
            }
            try await group.waitForAll()
        }
        let database = try SQLiteDatabase(path: path)
        XCTAssertEqual(try database.query("SELECT client_id FROM developer_clients").count, 2)
    }

    func testImportedPostgresRowsPreserveCredentialAndTimestampSemantics() async throws {
        let path = try temporaryPath()
        let timestamp = "2026-11-09T01:02:03.123456Z"
        do {
            let database = try SQLiteDatabase(path: path)
            try database.query("INSERT INTO developer_clients(client_id, owner_did, created_at) VALUES ('imported', ?, ?)", [owner, timestamp])
            try database.query("INSERT INTO developer_api_keys(key_id, client_id, key_hash, created_at, revoked_at) VALUES ('active', 'imported', ?, ?, NULL)", [hashClientCredential("imported-key"), timestamp])
            try database.query("INSERT INTO developer_api_keys(key_id, client_id, key_hash, created_at, revoked_at) VALUES ('revoked', 'imported', ?, ?, ?)", [hashClientCredential("revoked-key"), timestamp, timestamp])
            try database.query("INSERT INTO developer_usage_daily(client_id, usage_date, route_family, request_count) VALUES ('imported', ?, 'saves', 42)", [todayUTC()])
            try database.query("INSERT INTO bookmark_previews(subject_hash, subject, title, updated_at, expires_at) VALUES (?, 'https://example.com', 'Imported', ?, '2999-01-01T01:02:03.123456Z')", ["100680ad546ce6a577f42f52df33b4cfdca756859e664b8d7de329b150d09ce9", timestamp])
        }
        let database = try SQLiteDatabase(path: path)
        let subject = store(database)
        let clients = try await subject.listClients(ownerDID: owner)
        XCTAssertEqual(clients.first?.createdAt, timestamp)
        let keys = try await subject.listApiKeys(ownerDID: owner, clientID: "imported")
        XCTAssertEqual(keys.first { $0.keyID == "revoked" }?.revokedAt, timestamp)
        let resolved = try await subject.resolveClientID(from: headers(client: "imported", key: "imported-key"), requireClientAPIKey: true)
        XCTAssertEqual(resolved, "imported")
        do {
            _ = try await subject.resolveClientID(from: headers(client: "imported", key: "revoked-key"), requireClientAPIKey: true)
            XCTFail("Imported revoked keys must fail")
        } catch let error as GatewayError { XCTAssertEqual(error.code, "invalid_client_credential") }
        let summaries = try await subject.usageSummaries(ownerDID: owner)
        XCTAssertEqual(summaries.first?.buckets.first?.requestCount, 42)
        let preview = try await SQLiteBookmarkPreviewStore(database: database).preview(for: "https://example.com")
        XCTAssertEqual(preview?.title, "Imported")
    }

    func testMigrationRequiresPopulatedSupportedSchema() throws {
        let path = try temporaryPath()
        XCTAssertThrowsError(try SQLiteDatabase(path: path, requireExistingSchema: true))
        XCTAssertFalse(FileManager.default.fileExists(atPath: path))
        XCTAssertTrue(FileManager.default.createFile(atPath: path, contents: nil))
        XCTAssertThrowsError(try SQLiteDatabase(path: path, requireExistingSchema: true))
        do { _ = try SQLiteDatabase(path: path) }
        do { _ = try SQLiteDatabase(path: path, requireExistingSchema: true) }
        do {
            let database = try SQLiteDatabase(path: path)
            try database.query("DROP TABLE bookmark_previews")
        }
        XCTAssertThrowsError(try SQLiteDatabase(path: path, requireExistingSchema: true))
    }

    func testRollbackAndUnsupportedSchemaFailClosed() throws {
        let path = try temporaryPath()
        do {
            let database = try SQLiteDatabase(path: path)
            XCTAssertThrowsError(try database.transaction {
                try database.query("INSERT INTO developer_clients(client_id, owner_did) VALUES ('rollback', 'owner')")
                throw SQLiteDatabaseError(code: 1)
            })
            XCTAssertTrue(try database.query("SELECT * FROM developer_clients").isEmpty)
            try database.query("PRAGMA user_version = 2")
        }
        XCTAssertThrowsError(try SQLiteDatabase(path: path))
    }
}
