import Foundation

public struct RegisterClientBody: Decodable, Sendable {
    public let clientId: String
    public let displayName: String?
}
