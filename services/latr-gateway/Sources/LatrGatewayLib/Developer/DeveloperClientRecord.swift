import Foundation

public struct DeveloperClientRecord: Codable, Sendable, Equatable {
    public let clientID: String
    public let ownerDID: String
    public let displayName: String?
    public let isOfficial: Bool
    public let billingStatus: String
    public let stripeCustomerID: String?
    public let dailyRequestLimit: Int
    public let createdAt: String
}
