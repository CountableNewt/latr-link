import Foundation

public struct HealthResponse: Encodable, Sendable {
    public let status: String
    public let service: String
}
