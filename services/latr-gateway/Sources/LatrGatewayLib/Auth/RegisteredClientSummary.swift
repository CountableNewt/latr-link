import Foundation

public struct RegisteredClientSummary: Encodable, Sendable {
    public let clientId: String
    public let displayName: String?
    public let createdAt: String
    public let source: String
}
