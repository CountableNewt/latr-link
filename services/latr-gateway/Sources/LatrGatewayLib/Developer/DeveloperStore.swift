import Foundation
import HTTPTypes

public protocol DeveloperStore: Sendable {
    func resolveClientID(from headers: HTTPFields, requireClientAPIKey: Bool) async throws -> String?
    func listClients(ownerDID: String) async throws -> [DeveloperClientRecord]
    func createClient(
        ownerDID: String,
        clientID: String,
        displayName: String?,
        isOfficial: Bool
    ) async throws -> DeveloperClientRecord
    func deleteClient(ownerDID: String, clientID: String) async throws
    func listApiKeys(ownerDID: String, clientID: String) async throws -> [DeveloperApiKeyRecord]
    func createApiKey(
        ownerDID: String,
        clientID: String,
        label: String?
    ) async throws -> (record: DeveloperApiKeyRecord, apiKey: String)
    func revokeApiKey(ownerDID: String, clientID: String, keyID: String) async throws
    func recordUsage(clientID: String, routeFamily: String) async throws
    func usageSummaries(ownerDID: String) async throws -> [DeveloperUsageSummaryResponse]
    func assertWithinDailyLimit(clientID: String) async throws
}
