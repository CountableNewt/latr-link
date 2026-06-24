import Foundation

public struct DeveloperApiKeySummaryResponse: Encodable, Sendable {
    public let keyId: String
    public let label: String?
    public let createdAt: String
    public let revokedAt: String?
}
