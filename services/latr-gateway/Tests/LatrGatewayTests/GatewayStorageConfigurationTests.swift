import Foundation
import Testing
@testable import LatrGatewayLib

struct GatewayStorageConfigurationTests {
    private func config(
        env: AppEnvironment = .local,
        databaseURL: String? = nil,
        backend: String? = nil,
        path: String? = nil
    ) -> GatewayConfig {
        GatewayConfig(
            port: 8080, appEnv: env, plcURL: "https://plc.directory",
            oauthRequireKnownClient: false, databaseURL: databaseURL,
            databaseBackend: backend, sqlitePath: path,
            developerStoreURL: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        )
    }

    @Test func localDefaultsToSQLite() throws {
        #expect(try !config().usesPostgres())
        #expect(try config().resolvedSQLitePath() == "data/latr-gateway.sqlite")
    }

    @Test func hostedRequiresExplicitDurablePath() throws {
        for env in [AppEnvironment.dev, .prod] {
            #expect(throws: GatewayStorageConfigurationError.self) { try config(env: env).resolvedSQLitePath() }
            #expect(throws: GatewayStorageConfigurationError.self) { try config(env: env, path: ":memory:").resolvedSQLitePath() }
            #expect(throws: GatewayStorageConfigurationError.self) { try config(env: env, path: "data/test.sqlite").resolvedSQLitePath() }
            #expect(try config(env: env, path: "/data/latr-gateway.sqlite").resolvedSQLitePath() == "/data/latr-gateway.sqlite")
        }
    }

    @Test func stalePostgresConfigurationFailsClosed() {
        #expect(throws: GatewayStorageConfigurationError.self) {
            try config(databaseURL: "postgresql://example/test").resolvedSQLitePath()
        }
        #expect(throws: GatewayStorageConfigurationError.self) {
            try config(env: .prod, databaseURL: "postgresql://example/test", path: "/nonexistent/latr-migration.sqlite").resolvedSQLitePath()
        }
    }

    @Test func rollbackRequiresExplicitBackendAndURL() throws {
        #expect(try config(databaseURL: "postgresql://example/test", backend: "postgres").usesPostgres())
        #expect(throws: GatewayStorageConfigurationError.self) { try config(backend: "postgres").usesPostgres() }
        #expect(throws: GatewayStorageConfigurationError.self) { try config(backend: "invalid").usesPostgres() }
    }

    @Test func existingJSONRequiresMigration() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try Data("{}".utf8).write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }
        let config = GatewayConfig(port: 8080, appEnv: .local, plcURL: "https://plc.directory", oauthRequireKnownClient: false, developerStoreURL: url)
        #expect(throws: GatewayStorageConfigurationError.self) { try config.resolvedSQLitePath() }
    }
}
