import AsyncHTTPClient
import Foundation
import Logging

private let maxHTMLBytes = 512 * 1024
private let maxWellKnownBytes = 4096
private let ogLogger = Logger(label: "latr-gateway.og")

public struct DiscoverAtURIResult: Encodable, Sendable {
    public let subjectUri: String?
    public let warning: String?

    public init(subjectUri: String?, warning: String? = nil) {
        self.subjectUri = subjectUri
        self.warning = warning
    }
}

private func isPublicationRootPath(_ url: URL) -> Bool {
    let norm = url.path.replacingOccurrences(of: "//+", with: "/", options: .regularExpression)
        .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    return norm.isEmpty
}

private func urlOrigin(_ url: URL) -> String {
    var origin = "\(url.scheme ?? "https")://\(url.host ?? "")"
    if let port = url.port {
        origin += ":\(port)"
    }
    return origin
}

public func discoverAtURIFromURL(
    _ rawURL: String,
    httpClient: HTTPClient
) async -> DiscoverAtURIResult {
    guard let pageURL = URL(string: rawURL) else {
        return DiscoverAtURIResult(subjectUri: nil, warning: "invalid_url")
    }

    guard let scheme = pageURL.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
        return DiscoverAtURIResult(subjectUri: nil, warning: "unsupported_scheme")
    }

    if let block = blockingReasonOGFetch(pageURL.host ?? "") {
        return DiscoverAtURIResult(subjectUri: nil, warning: block)
    }

    switch await fetchURLBodyLimited(target: pageURL.absoluteString, maxBytes: maxHTMLBytes, httpClient: httpClient) {
    case let .success(text, finalURL):
        if let fromHTML = extractSiteStandardDocumentAtURI(text) {
            return DiscoverAtURIResult(subjectUri: fromHTML)
        }

        guard let final = URL(string: finalURL) else {
            return DiscoverAtURIResult(subjectUri: nil)
        }

        if isPublicationRootPath(final) {
            let origin = urlOrigin(final)
            let wellKnown = "\(origin)/.well-known/site.standard.publication"
            switch await fetchURLBodyLimited(
                target: wellKnown,
                maxBytes: maxWellKnownBytes,
                accept: "text/plain,*/*",
                httpClient: httpClient
            ) {
            case let .success(text, _):
                let line = text
                    .split(whereSeparator: { $0.isNewline })
                    .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
                    .first(where: { !$0.isEmpty })
                if let line, let canonical = tryCanonicalAtURI(line) {
                    return DiscoverAtURIResult(subjectUri: canonical)
                }
            case let .failure(reason):
                return DiscoverAtURIResult(subjectUri: nil, warning: reason)
            }
        }

        return DiscoverAtURIResult(subjectUri: nil)
    case let .failure(reason):
        return DiscoverAtURIResult(subjectUri: nil, warning: reason)
    }
}

public func fetchOpenGraphMetadata(url: String, httpClient: HTTPClient) async -> OpenGraphFields? {
    let trimmed = url.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }

    switch await fetchURLBodyLimited(target: trimmed, maxBytes: maxHTMLBytes, httpClient: httpClient) {
    case let .success(text, finalURL):
        let fields = enrichOpenGraphFields(
            parseOpenGraphMarkup(html: text, resolvedPageURL: finalURL),
            resolvedPageURL: finalURL
        )
        if fields.hasAnyValue {
            return fields
        }
        ogLogger.info(
            "OG parse returned no usable fields",
            metadata: ["url": .string(trimmed), "finalUrl": .string(finalURL)]
        )
        return nil
    case let .failure(reason):
        ogLogger.warning(
            "OG fetch failed",
            metadata: ["url": .string(trimmed), "reason": .string(reason)]
        )
        return nil
    }
}

private func enrichOpenGraphFields(_ fields: OpenGraphFields, resolvedPageURL: String) -> OpenGraphFields {
    var enriched = fields
    guard let host = hostnameLabel(from: resolvedPageURL) else { return enriched }

    if enriched.siteName == nil {
        enriched.siteName = host
    }
    if enriched.title == nil, let siteName = enriched.siteName {
        enriched.title = siteName
    }
    return enriched
}

private func hostnameLabel(from urlString: String) -> String? {
    guard let host = URL(string: urlString)?.host?.lowercased() else { return nil }
    if host.hasPrefix("www.") {
        return String(host.dropFirst(4))
    }
    return host
}

private extension OpenGraphFields {
    var hasAnyValue: Bool {
        title != nil
            || description != nil
            || image != nil
            || siteName != nil
            || author != nil
    }
}
