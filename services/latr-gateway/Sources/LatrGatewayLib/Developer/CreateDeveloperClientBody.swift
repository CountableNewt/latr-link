import Foundation

public struct CreateDeveloperClientBody: Decodable, Sendable {
    public let clientId: String
    public let displayName: String?
}
