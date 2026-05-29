import Foundation
#if canImport(Darwin)
import Darwin
#else
import Glibc
#endif

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

public struct DeveloperApiKeyRecord: Codable, Sendable, Equatable {
    public let keyID: String
    public let clientID: String
    public let keyHash: String
    public let label: String?
    public let createdAt: String
    public let revokedAt: String?
}

public struct DeveloperClientSummaryResponse: Encodable, Sendable {
    public let clientId: String
    public let displayName: String?
    public let kind: String
    public let createdAt: String
}

public struct DeveloperApiKeySummaryResponse: Encodable, Sendable {
    public let keyId: String
    public let label: String?
    public let createdAt: String
    public let revokedAt: String?
}

public struct CreateDeveloperClientBody: Decodable, Sendable {
    public let clientId: String
    public let displayName: String?
}

public struct CreateDeveloperApiKeyBody: Decodable, Sendable {
    public let label: String?
}

public struct CreateDeveloperApiKeyResponse: Encodable, Sendable {
    public let keyId: String
    public let clientId: String
    public let apiKey: String
    public let label: String?
    public let createdAt: String
}

public struct ListDeveloperClientsResponse: Encodable, Sendable {
    public let clients: [DeveloperClientSummaryResponse]
}

public struct ListDeveloperApiKeysResponse: Encodable, Sendable {
    public let keys: [DeveloperApiKeySummaryResponse]
}

public struct DeveloperUsageBucketResponse: Encodable, Sendable {
    public let routeFamily: String
    public let requestCount: Int
}

public struct DeveloperUsageSummaryResponse: Encodable, Sendable {
    public let clientId: String
    public let usageDate: String
    public let buckets: [DeveloperUsageBucketResponse]
    public let dailyLimit: Int?
    public let remaining: Int?
}

public struct ListDeveloperUsageResponse: Encodable, Sendable {
    public let usage: [DeveloperUsageSummaryResponse]
}

public let latrClientIDHeader = "X-Latr-Client-Id"
public let latrAPIKeyHeader = "X-Latr-API-Key"

public func generateDeveloperApiKey() -> String {
    "lk_\(Data(secureRandomBytes(count: 32)).base64EncodedString())"
        .replacingOccurrences(of: "+", with: "-")
        .replacingOccurrences(of: "/", with: "_")
        .replacingOccurrences(of: "=", with: "")
}

public func newDeveloperKeyID() -> String {
    UUID().uuidString.lowercased()
}

public func iso8601Now() -> String {
    ISO8601DateFormatter().string(from: Date())
}

public func todayUTC() -> String {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: Date())
}

public func routeFamily(for path: String) -> String {
    if path.contains("/saves") { return "saves" }
    if path.contains("/og-preview") { return "og-preview" }
    if path.contains("/discover") { return "discover" }
    if path.contains("/auth/probe") { return "auth" }
    return "other"
}

func secureRandomBytes(count: Int) -> [UInt8] {
    var bytes = [UInt8](repeating: 0, count: count)
    #if canImport(Darwin)
    let status = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
    precondition(status == errSecSuccess, "Failed to generate API key material")
    #else
    let fd = open("/dev/urandom", O_RDONLY)
    precondition(fd >= 0, "Failed to open /dev/urandom")
    defer { close(fd) }
    var remaining = count
    var offset = 0
    while remaining > 0 {
        let readCount = read(fd, &bytes[offset], remaining)
        precondition(readCount > 0, "Failed to read /dev/urandom")
        remaining -= readCount
        offset += readCount
    }
    #endif
    return bytes
}
