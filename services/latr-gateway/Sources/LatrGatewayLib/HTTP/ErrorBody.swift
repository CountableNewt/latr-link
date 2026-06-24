import Foundation

public struct ErrorBody: Encodable, Sendable {
    public let error: String
    public let message: String
}
