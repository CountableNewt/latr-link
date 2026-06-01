import AsyncHTTPClient
import Foundation

private let readerProxyPrefix = "https://r.jina.ai/"

private struct JinaReaderResponse: Decodable {
    struct Payload: Decodable {
        let title: String?
        let description: String?
        let metadata: [String: String]?
    }

    let data: Payload?
}

func fetchOpenGraphViaReaderProxy(url: String, httpClient: HTTPClient) async -> OpenGraphFields? {
    let proxyURL = readerProxyPrefix + url
    switch await fetchURLBodyLimited(
        target: proxyURL,
        maxBytes: 512 * 1024,
        accept: "application/json,text/plain,*/*",
        httpClient: httpClient
    ) {
    case let .success(text, _):
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("{"),
           let fromJSON = parseReaderProxyJSONResponse(trimmed, sourceURL: url)
        {
            return fromJSON
        }
        return parseReaderProxyResponse(text, sourceURL: url)
    case .failure:
        return nil
    }
}

private func firstMetadataValue(_ metadata: [String: String], keys: [String]) -> String? {
    for key in keys {
        guard let raw = metadata[key] else { continue }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            return trimmed
        }
    }
    return nil
}

public func parseReaderProxyJSONResponse(_ json: String, sourceURL: String) -> OpenGraphFields? {
    guard let payload = try? JSONDecoder().decode(JinaReaderResponse.self, from: Data(json.utf8)).data else {
        return nil
    }

    let metadata = payload.metadata ?? [:]
    let title = firstMetadataValue(metadata, keys: ["og:title", "twitter:title"])
        ?? payload.title?.trimmingCharacters(in: .whitespacesAndNewlines)
    let description = firstMetadataValue(
        metadata,
        keys: ["og:description", "twitter:description", "description"]
    ) ?? payload.description?.trimmingCharacters(in: .whitespacesAndNewlines)
    let image = firstMetadataValue(
        metadata,
        keys: [
            "og:image",
            "og:image:url",
            "og:image:secure_url",
            "twitter:image",
            "parsely-image-url",
        ]
    )
    let siteName = firstMetadataValue(metadata, keys: ["og:site_name", "application-name"])
        ?? hostnameLabel(from: sourceURL)
    let author = firstMetadataValue(
        metadata,
        keys: ["author", "article:author", "parsely-author", "og:article:author"]
    )

    guard title?.isEmpty == false || image?.isEmpty == false || siteName != nil else {
        return nil
    }

    return OpenGraphFields(
        title: title?.isEmpty == false ? title : siteName,
        description: description?.isEmpty == false ? description : nil,
        image: image,
        siteName: siteName,
        author: author?.isEmpty == false ? author : nil
    )
}

public func parseReaderProxyResponse(_ text: String, sourceURL: String) -> OpenGraphFields? {
    var title: String?
    var description: String?

    for line in text.split(separator: "\n", omittingEmptySubsequences: false) {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("Title: ") {
            title = String(trimmed.dropFirst(7)).trimmingCharacters(in: .whitespacesAndNewlines)
        } else if trimmed.hasPrefix("Description: ") {
            description = String(trimmed.dropFirst(13)).trimmingCharacters(in: .whitespacesAndNewlines)
        }
    }

    if title == nil || title?.isEmpty == true {
        if let markdownRange = text.range(of: "Markdown Content:") {
            let markdown = text[markdownRange.upperBound...]
            for line in markdown.split(separator: "\n", maxSplits: 20, omittingEmptySubsequences: true) {
                let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
                if trimmed.hasPrefix("# ") {
                    title = String(trimmed.dropFirst(2)).trimmingCharacters(in: .whitespacesAndNewlines)
                    break
                }
            }
        }
    }

    let image = firstMarkdownHeroImage(in: text)
    let siteName = hostnameLabel(from: sourceURL)
    guard title?.isEmpty == false || image?.isEmpty == false || siteName != nil else { return nil }

    return OpenGraphFields(
        title: title?.isEmpty == false ? title : siteName,
        description: description?.isEmpty == false ? description : nil,
        image: image,
        siteName: siteName
    )
}

private func firstMarkdownHeroImage(in text: String) -> String? {
    let pattern = #"!\[[^\]]*\]\((https?://[^)\s]+)\)"#
    guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
    let nsText = text as NSString
    let range = NSRange(location: 0, length: nsText.length)

    for match in regex.matches(in: text, range: range) {
        guard match.numberOfRanges > 1,
              let urlRange = Range(match.range(at: 1), in: text)
        else { continue }
        let url = String(text[urlRange])
        if isLikelyDecorativeImageURL(url) { continue }
        return url
    }

    return nil
}

private func isLikelyDecorativeImageURL(_ url: String) -> Bool {
    let lower = url.lowercased()
    let blockedFragments = [
        "author_profile",
        "/authors/",
        "avatar",
        "favicon",
        "cookie",
        "logo.png",
        "ot-logo",
        "w=96",
        "w=48",
        "w=64",
    ]
    return blockedFragments.contains { lower.contains($0) }
}
