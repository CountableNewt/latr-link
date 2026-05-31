import Foundation

public struct DeveloperUsageSummaryResponse: Encodable, Sendable {
    public let clientId: String
    public let usageDate: String
    public let buckets: [DeveloperUsageBucketResponse]
    public let dailyLimit: Int?
    public let remaining: Int?
}
