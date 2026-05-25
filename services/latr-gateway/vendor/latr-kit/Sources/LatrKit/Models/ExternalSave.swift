import Foundation

/// A per-user URL wrapper record (`com.latr.saved.external`).
public struct ExternalSave: Codable, Sendable, Equatable {
    public var type: String
    public var url: String
    public var normalizedUrl: String
    public var fingerprint: String
    public var createdAt: String
    public var title: String?
    public var excerpt: String?
    public var site: String?
    public var image: String?
    public var language: String?
    public var publishedAt: String?
    public var author: String?

    enum CodingKeys: String, CodingKey {
        case type = "$type"
        case url
        case normalizedUrl
        case fingerprint
        case createdAt
        case title
        case excerpt
        case site
        case image
        case language
        case publishedAt
        case author
    }

    public init(
        url: String,
        normalizedUrl: String,
        fingerprint: String,
        createdAt: String,
        title: String? = nil,
        excerpt: String? = nil,
        site: String? = nil,
        image: String? = nil,
        language: String? = nil,
        publishedAt: String? = nil,
        author: String? = nil
    ) {
        self.type = LexiconCollection.external.identifier
        self.url = url
        self.normalizedUrl = normalizedUrl
        self.fingerprint = fingerprint
        self.createdAt = createdAt
        self.title = title
        self.excerpt = excerpt
        self.site = site
        self.image = image
        self.language = language
        self.publishedAt = publishedAt
        self.author = author
    }

    /// Best available human-readable title for display.
    public var displayTitle: String {
        if let title = title?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty {
            return title
        }
        if let site = site?.trimmingCharacters(in: .whitespacesAndNewlines), !site.isEmpty {
            return site
        }
        if !normalizedUrl.isEmpty {
            return normalizedUrl
        }
        if !url.isEmpty {
            return url
        }
        return "Saved link"
    }
}
