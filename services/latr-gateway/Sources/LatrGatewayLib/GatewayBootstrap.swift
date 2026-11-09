import AsyncHTTPClient
import Foundation
import Hummingbird
import Logging
import PostgresNIO

public enum GatewayBootstrap {
    public static func run(config: GatewayConfig, httpClient: HTTPClient, logger: Logger) async throws {
        let developerStore: any DeveloperStore
        let storeLabel: String
        var pgPool: PostgresClient?
        let previewStore: any BookmarkPreviewStore

        if try config.usesPostgres() {
            guard let databaseURL = config.databaseURL else {
                throw GatewayStorageConfigurationError.postgresURLRequired
            }
            let pgConfig = try makePostgresConfig(from: databaseURL, logger: logger)
            let pool = PostgresClient(configuration: pgConfig, backgroundLogger: logger)
            pgPool = pool
            developerStore = PostgresDeveloperStore(
                pool: pool,
                officialEnvCredentials: config.officialClientCredentials,
                logger: logger
            )
            previewStore = PostgresBookmarkPreviewStore(pool: pool, logger: logger)
            storeLabel = "postgres"
        } else {
            let stores = try DeveloperStoreFactory.makeSQLiteStores(config: config, logger: logger)
            developerStore = stores.developer
            previewStore = stores.preview
            storeLabel = config.appEnv == .test ? "memory" : "sqlite"
        }

        let services = GatewayServices(
            config: config,
            httpClient: httpClient,
            developerStore: developerStore,
            previewStore: previewStore
        )
        let router = buildRouter(services: services)
        let app = Application(
            router: router,
            configuration: .init(address: .hostname("0.0.0.0", port: config.port))
        )

        logger.info(
            "latr-gateway listening on port \(config.port) (APP_ENV=\(config.appEnv.rawValue), store=\(storeLabel))"
        )

        if let pgPool {
            try await withThrowingTaskGroup(of: Void.self) { group in
                group.addTask { await pgPool.run() }
                group.addTask { try await app.runService() }
                try await group.next()
                group.cancelAll()
            }
        } else {
            try await app.runService()
        }
    }
}
