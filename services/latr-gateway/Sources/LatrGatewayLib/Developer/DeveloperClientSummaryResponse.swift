import Foundation

public struct DeveloperClientSummaryResponse: Encodable, Sendable {
    public let clientId: String
    public let displayName: String?
    public let kind: String
    public let createdAt: String
}
