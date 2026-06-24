import Foundation

public struct DeveloperStoreSnapshot: Codable, Sendable {
    var clients: [String: DeveloperClientRecord]
    var apiKeys: [String: DeveloperApiKeyRecord]
    var usage: [String: Int]
}
