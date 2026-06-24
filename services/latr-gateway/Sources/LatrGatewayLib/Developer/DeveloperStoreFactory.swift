import Foundation
import Logging
import PostgresNIO

public enum DeveloperStoreFactory {
    public static func make(
        config: GatewayConfig,
        postgres: PostgresClient? = nil,
        logger: Logger = Logger(label: "latr-gateway")
    ) -> any DeveloperStore {
        if config.appEnv == .test {
            return InMemoryDeveloperStore(officialEnvCredentials: config.officialClientCredentials)
        }
        if let postgres, config.databaseURL != nil {
            return PostgresDeveloperStore(
                pool: postgres,
                officialEnvCredentials: config.officialClientCredentials,
                logger: logger
            )
        }
        return PersistentDeveloperStore(
            officialEnvCredentials: config.officialClientCredentials,
            storeURL: config.developerStoreURL
        )
    }
}
