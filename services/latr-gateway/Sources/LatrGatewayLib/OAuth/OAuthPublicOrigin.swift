import Foundation
import Hummingbird
import HTTPTypes

/// Resolves the public origin used in OAuth client metadata `client_id` / `client_uri`.
enum OAuthPublicOrigin {
    static func resolve(request: Request, configuredOrigin: String?) -> String? {
        if let fixed = configuredOrigin?.trimmingCharacters(in: .whitespacesAndNewlines), !fixed.isEmpty {
            return stripTrailingSlash(fixed)
        }
        guard let authority = request.head.authority, !authority.isEmpty else { return nil }
        let proto = forwardedProto(request) ?? inferredProto(forAuthority: authority)
        return "\(proto)://\(authority)"
    }

    private static func forwardedProto(_ request: Request) -> String? {
        guard let field = HTTPField.Name("X-Forwarded-Proto"),
              let raw = request.headers[field]
        else { return nil }
        return raw.split(separator: ",").first.map {
            String($0).trimmingCharacters(in: .whitespacesAndNewlines)
        }
    }

    private static func inferredProto(forAuthority authority: String) -> String {
        let host = authority.split(separator: ":").first.map(String.init) ?? authority
        if host == "localhost" || host == "127.0.0.1" || host == "::1" {
            return "http"
        }
        return "https"
    }

    private static func stripTrailingSlash(_ value: String) -> String {
        if value.hasSuffix("/") { return String(value.dropLast()) }
        return value
    }
}
