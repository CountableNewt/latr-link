import Foundation

public struct ListDeveloperUsageResponse: Encodable, Sendable {
    public let usage: [DeveloperUsageSummaryResponse]
}
