import Foundation

public struct RegisterClientResponse: Encodable, Sendable {
    public let clientId: String
    public let clientCredential: String
    public let displayName: String?
    public let createdAt: String
}
