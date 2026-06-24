import Foundation

public struct CreateDeveloperApiKeyBody: Decodable, Sendable {
    public let label: String?
}
