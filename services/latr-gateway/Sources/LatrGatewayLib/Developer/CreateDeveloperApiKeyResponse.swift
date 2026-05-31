import Foundation

public struct CreateDeveloperApiKeyResponse: Encodable, Sendable {
    public let keyId: String
    public let clientId: String
    public let apiKey: String
    public let label: String?
    public let createdAt: String
}
