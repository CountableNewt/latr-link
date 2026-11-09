import CSQLite
import Foundation
#if canImport(Darwin)
import Darwin
#else
import Glibc
#endif

/// One connection, serialized across both stores; transactions never span an await.
public final class SQLiteDatabase: @unchecked Sendable {
    private let storage: SQLiteConnection
    private var connection: OpaquePointer { storage.handle }
    private let lock = NSRecursiveLock()

    public init(path: String, requireExistingSchema: Bool = false) throws {
        if requireExistingSchema, path == ":memory:" { throw SQLiteDatabaseError(code: SQLITE_MISMATCH) }
        if path != ":memory:" {
            let directory = URL(fileURLWithPath: path).deletingLastPathComponent()
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            if !requireExistingSchema {
                let descriptor = open(path, O_WRONLY | O_CREAT | O_EXCL, S_IRUSR | S_IWUSR)
                if descriptor >= 0 {
                    close(descriptor)
                } else if errno != EEXIST {
                    throw SQLiteDatabaseError(code: SQLITE_CANTOPEN)
                }
            }
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path)
        }
        var handle: OpaquePointer?
        let status = sqlite3_open_v2(path, &handle, SQLITE_OPEN_READWRITE | (requireExistingSchema ? 0 : SQLITE_OPEN_CREATE) | SQLITE_OPEN_FULLMUTEX, nil)
        guard status == SQLITE_OK, let handle else {
            if let handle { sqlite3_close(handle) }
            throw SQLiteDatabaseError(code: status)
        }
        storage = SQLiteConnection(handle: handle)
        sqlite3_extended_result_codes(handle, 1)
        sqlite3_busy_timeout(handle, 5_000)
        _ = try query("PRAGMA foreign_keys = ON")
        _ = try query("PRAGMA journal_mode = WAL")
        _ = try query("PRAGMA synchronous = FULL")
        try transaction {
            let version = Int((try query("PRAGMA user_version").first?.first ?? nil) ?? "0") ?? 0
            guard (0...1).contains(version), !requireExistingSchema || version == 1 else { throw SQLiteDatabaseError(code: SQLITE_MISMATCH) }
            if version == 0 {
                guard try query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").isEmpty else {
                    throw SQLiteDatabaseError(code: SQLITE_MISMATCH)
                }
                let url = Bundle.module.url(forResource: "sqlite-schema", withExtension: "sql")!
                let schema = try String(contentsOf: url, encoding: .utf8)
                for fragment in schema.split(separator: ";") {
                    let sql = fragment.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !sql.isEmpty { _ = try query(sql) }
                }
            }
            for sql in [
                "SELECT client_id, owner_did, display_name, is_official, billing_status, stripe_customer_id, daily_request_limit, created_at FROM developer_clients LIMIT 0",
                "SELECT key_id, client_id, key_hash, label, created_at, revoked_at FROM developer_api_keys LIMIT 0",
                "SELECT client_id, usage_date, route_family, request_count FROM developer_usage_daily LIMIT 0",
                "SELECT subject_hash, subject, title, description, image_url, site_name, author, updated_at, expires_at FROM bookmark_previews LIMIT 0",
            ] { _ = try query(sql) }
            guard try query("PRAGMA foreign_key_check").isEmpty else { throw SQLiteDatabaseError(code: SQLITE_CONSTRAINT) }
        }
    }

    /// Positional bindings keep credentials, user content, and URLs out of SQL text.
    @discardableResult
    func query(_ sql: String, _ values: [String?] = []) throws -> [[String?]] {
        lock.lock()
        defer { lock.unlock() }
        var statement: OpaquePointer?
        let prepared = sqlite3_prepare_v2(connection, sql, -1, &statement, nil)
        guard prepared == SQLITE_OK, let statement else { throw SQLiteDatabaseError(code: prepared) }
        defer { sqlite3_finalize(statement) }
        guard sqlite3_bind_parameter_count(statement) == Int32(values.count) else {
            throw SQLiteDatabaseError(code: SQLITE_MISUSE)
        }
        for (offset, value) in values.enumerated() {
            let status: Int32
            if let value {
                status = value.withCString { sqlite3_bind_text(statement, Int32(offset + 1), $0, Int32(value.utf8.count), unsafeBitCast(-1, to: sqlite3_destructor_type.self)) }
            } else {
                status = sqlite3_bind_null(statement, Int32(offset + 1))
            }
            guard status == SQLITE_OK else { throw SQLiteDatabaseError(code: status) }
        }
        var rows: [[String?]] = []
        while true {
            let status = sqlite3_step(statement)
            if status == SQLITE_DONE { return rows }
            guard status == SQLITE_ROW else { throw SQLiteDatabaseError(code: status) }
            rows.append((0..<sqlite3_column_count(statement)).map { index in
                guard let value = sqlite3_column_text(statement, index) else { return nil }
                return String(decoding: UnsafeBufferPointer(start: value, count: Int(sqlite3_column_bytes(statement, index))), as: UTF8.self)
            })
        }
    }

    func transaction<T>(_ operation: () throws -> T) throws -> T {
        lock.lock()
        defer { lock.unlock() }
        _ = try query("BEGIN IMMEDIATE")
        do {
            let result = try operation()
            _ = try query("COMMIT")
            return result
        } catch {
            _ = try? query("ROLLBACK")
            throw error
        }
    }


}

/// Deliberately excludes SQL and values so errors cannot disclose API credentials.
struct SQLiteDatabaseError: Error, Sendable {
    let code: Int32
    var isUniqueConstraint: Bool { code == 1555 || code == 2067 }
}

private final class SQLiteConnection {
    let handle: OpaquePointer
    init(handle: OpaquePointer) { self.handle = handle }
    deinit { sqlite3_close(handle) }
}
