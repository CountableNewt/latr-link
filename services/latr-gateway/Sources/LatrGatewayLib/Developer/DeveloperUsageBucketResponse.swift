import Foundation

public struct DeveloperUsageBucketResponse: Encodable, Sendable {
    public let routeFamily: String
    public let requestCount: Int
}
