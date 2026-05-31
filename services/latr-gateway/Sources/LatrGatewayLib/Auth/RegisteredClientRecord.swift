import Foundation

public struct RegisteredClientRecord: Codable, Sendable, Equatable {
    public var keyHash: String
    public var displayName: String?
    public var createdAt: String

    public init(keyHash: String, displayName: String? = nil, createdAt: String) {
        self.keyHash = keyHash
        self.displayName = displayName
        self.createdAt = createdAt
    }
}
