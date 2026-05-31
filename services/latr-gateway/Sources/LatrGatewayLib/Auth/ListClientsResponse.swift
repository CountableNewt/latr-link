import Foundation

public struct ListClientsResponse: Encodable, Sendable {
    public let clients: [RegisteredClientSummary]
}
