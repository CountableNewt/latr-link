import Foundation
import HTTPTypes

public struct DeveloperStoreSnapshot: Codable, Sendable {
    var clients: [String: DeveloperClientRecord]
    var apiKeys: [String: DeveloperApiKeyRecord]
    var usage: [String: Int]
}

/// JSON-backed developer store for Fly volumes and local dev. Apply `migrations/001_developer_console.sql` on Supabase when using `DATABASE_URL` for analytics/reporting.
public actor PersistentDeveloperStore: DeveloperStore {
    private let backing: InMemoryDeveloperStore
    private let storeURL: URL

    public init(officialEnvCredentials: [String: String], storeURL: URL) {
        self.storeURL = storeURL
        let snapshot = Self.loadSnapshot(from: storeURL)
        self.backing = InMemoryDeveloperStore(
            officialEnvCredentials: officialEnvCredentials,
            snapshot: snapshot
        )
    }

    private func persist() async throws {
        let snapshot = await backing.snapshot()
        let directory = storeURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(snapshot)
        try data.write(to: storeURL, options: .atomic)
    }

    public func resolveClientID(from headers: HTTPFields, requireClientAPIKey: Bool) async throws -> String? {
        try await backing.resolveClientID(from: headers, requireClientAPIKey: requireClientAPIKey)
    }

    public func listClients(ownerDID: String) async throws -> [DeveloperClientRecord] {
        try await backing.listClients(ownerDID: ownerDID)
    }

    public func createClient(
        ownerDID: String,
        clientID: String,
        displayName: String?,
        isOfficial: Bool
    ) async throws -> DeveloperClientRecord {
        let created = try await backing.createClient(
            ownerDID: ownerDID,
            clientID: clientID,
            displayName: displayName,
            isOfficial: isOfficial
        )
        try await persist()
        return created
    }

    public func deleteClient(ownerDID: String, clientID: String) async throws {
        try await backing.deleteClient(ownerDID: ownerDID, clientID: clientID)
        try await persist()
    }

    public func listApiKeys(ownerDID: String, clientID: String) async throws -> [DeveloperApiKeyRecord] {
        try await backing.listApiKeys(ownerDID: ownerDID, clientID: clientID)
    }

    public func createApiKey(
        ownerDID: String,
        clientID: String,
        label: String?
    ) async throws -> (record: DeveloperApiKeyRecord, apiKey: String) {
        let created = try await backing.createApiKey(ownerDID: ownerDID, clientID: clientID, label: label)
        try await persist()
        return created
    }

    public func revokeApiKey(ownerDID: String, clientID: String, keyID: String) async throws {
        try await backing.revokeApiKey(ownerDID: ownerDID, clientID: clientID, keyID: keyID)
        try await persist()
    }

    public func recordUsage(clientID: String, routeFamily: String) async throws {
        try await backing.recordUsage(clientID: clientID, routeFamily: routeFamily)
        try await persist()
    }

    public func usageSummaries(ownerDID: String) async throws -> [DeveloperUsageSummaryResponse] {
        try await backing.usageSummaries(ownerDID: ownerDID)
    }

    public func assertWithinDailyLimit(clientID: String) async throws {
        try await backing.assertWithinDailyLimit(clientID: clientID)
    }

    private static func loadSnapshot(from url: URL) -> DeveloperStoreSnapshot? {
        guard let data = try? Data(contentsOf: url),
              let snapshot = try? JSONDecoder().decode(DeveloperStoreSnapshot.self, from: data)
        else { return nil }
        return snapshot
    }
}

extension InMemoryDeveloperStore {
    fileprivate func snapshot() -> DeveloperStoreSnapshot {
        DeveloperStoreSnapshot(clients: clients, apiKeys: apiKeys, usage: usage)
    }
}

public enum DeveloperStoreFactory {
    public static func make(config: GatewayConfig) -> any DeveloperStore {
        if config.appEnv == .test {
            return InMemoryDeveloperStore(officialEnvCredentials: config.officialClientCredentials)
        }
        return PersistentDeveloperStore(
            officialEnvCredentials: config.officialClientCredentials,
            storeURL: config.developerStoreURL
        )
    }
}
