import Foundation
import Logging

public enum DeveloperStoreFactory {
    public static func makeSQLiteStores(
        config: GatewayConfig,
        logger: Logger = Logger(label: "latr-gateway")
    ) throws -> (developer: any DeveloperStore, preview: any BookmarkPreviewStore) {
        if config.appEnv == .test {
            return (InMemoryDeveloperStore(officialEnvCredentials: config.officialClientCredentials), InMemoryBookmarkPreviewStore())
        }
        let database = try SQLiteDatabase(path: config.resolvedSQLitePath())
        return (
            SQLiteDeveloperStore(database: database, officialEnvCredentials: config.officialClientCredentials, logger: logger),
            SQLiteBookmarkPreviewStore(database: database)
        )
    }
}
