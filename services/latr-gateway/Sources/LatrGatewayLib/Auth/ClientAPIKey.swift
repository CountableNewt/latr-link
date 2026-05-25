import Foundation
import HTTPTypes

public let latrClientIDHeader = "X-Latr-Client-Id"
public let latrAPIKeyHeader = "X-Latr-API-Key"

public func parseClientAPIKeys(_ value: String?) -> [String: String] {
    guard let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        return [:]
    }

    var keys: [String: String] = [:]
    for token in value.split(whereSeparator: { $0 == "," || $0 == ";" }) {
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { continue }

        let separator = trimmed.firstIndex(where: { $0 == "=" || $0 == ":" })
        guard let separator else { continue }

        let clientID = trimmed[..<separator]
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let secret = trimmed[trimmed.index(after: separator)...]
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard !clientID.isEmpty, !secret.isEmpty else { continue }
        keys[clientID] = secret
    }
    return keys
}
