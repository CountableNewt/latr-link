import Foundation

public struct DeveloperApiKeyRecord: Codable, Sendable, Equatable {
    public let keyID: String
    public let clientID: String
    public let keyHash: String
    public let label: String?
    public let createdAt: String
    public let revokedAt: String?
}
