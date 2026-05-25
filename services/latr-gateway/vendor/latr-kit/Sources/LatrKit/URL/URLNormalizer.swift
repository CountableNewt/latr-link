import Foundation

public enum URLNormalizer {
    private static let trackingParameters: Set<String> = [
        "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
        "fbclid", "gclid", "ref",
    ]

    /// Returns a canonical normalized URL string, or `nil` when the input is not http(s).
    public static func normalizedString(from raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, var components = URLComponents(string: trimmed) else {
            return nil
        }

        guard let scheme = components.scheme?.lowercased(),
              scheme == "http" || scheme == "https"
        else {
            return nil
        }

        components.scheme = scheme
        if let host = components.host {
            components.host = host.lowercased()
        }
        components.fragment = nil

        var queryItems = components.queryItems ?? []
        queryItems.removeAll { item in
            let lower = item.name.lowercased()
            return lower.hasPrefix("utm_") || trackingParameters.contains(lower)
        }
        queryItems.sort { lhs, rhs in
            if lhs.name == rhs.name {
                return (lhs.value ?? "") < (rhs.value ?? "")
            }
            return lhs.name < rhs.name
        }
        components.queryItems = queryItems.isEmpty ? nil : queryItems

        var path = components.path
        if path != "/", path.hasSuffix("/") {
            while path.hasSuffix("/") {
                path.removeLast()
            }
            components.path = path
        }

        return components.string
    }
}
