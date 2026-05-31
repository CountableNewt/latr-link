import Foundation

public struct ListDeveloperClientsResponse: Encodable, Sendable {
    public let clients: [DeveloperClientSummaryResponse]
}
