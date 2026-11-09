import Foundation

public enum GatewayStorageConfigurationError: Error, Sendable {
    case unsupportedBackend
    case postgresURLRequired
    case explicitSQLitePathRequired
    case legacyJSONMigrationRequired
}

extension GatewayConfig {
    public func usesPostgres() throws -> Bool {
        if appEnv == .test { return false }
        let backend = databaseBackend?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        switch backend {
        case nil, "", "sqlite": return false
        case "postgres":
            guard databaseURL != nil else { throw GatewayStorageConfigurationError.postgresURLRequired }
            return true
        default: throw GatewayStorageConfigurationError.unsupportedBackend
        }
    }

    public func resolvedSQLitePath() throws -> String {
        guard try !usesPostgres() else { throw GatewayStorageConfigurationError.unsupportedBackend }
        let explicitPath = sqlitePath?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let explicitPath, !explicitPath.isEmpty {
            guard explicitPath != ":memory:", explicitPath.hasPrefix("/") || appEnv == .local else {
                throw GatewayStorageConfigurationError.explicitSQLitePathRequired
            }
            return explicitPath
        }
        // A stale hosted configuration must never silently open an empty local database.
        guard appEnv == .local, databaseURL == nil else {
            throw GatewayStorageConfigurationError.explicitSQLitePathRequired
        }
        if FileManager.default.fileExists(atPath: developerStoreURL.path) {
            throw GatewayStorageConfigurationError.legacyJSONMigrationRequired
        }
        return "data/latr-gateway.sqlite"
    }
}
