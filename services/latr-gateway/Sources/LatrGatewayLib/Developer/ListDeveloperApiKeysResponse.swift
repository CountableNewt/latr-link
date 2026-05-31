import Foundation

public struct ListDeveloperApiKeysResponse: Encodable, Sendable {
    public let keys: [DeveloperApiKeySummaryResponse]
}
