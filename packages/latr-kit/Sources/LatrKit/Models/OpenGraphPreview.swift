import Foundation

/// Parsed Open Graph fields merged onto saved records.
public struct OpenGraphPreview: Sendable, Equatable {
    public var title: String?
    public var description: String?
    public var image: String?
    public var siteName: String?
    public var author: String?

    public init(
        title: String? = nil,
        description: String? = nil,
        image: String? = nil,
        siteName: String? = nil,
        author: String? = nil
    ) {
        self.title = title
        self.description = description
        self.image = image
        self.siteName = siteName
        self.author = author
    }
}

public enum OpenGraphLimits {
    public static let title = 2048
    public static let excerpt = 8192
    public static let site = 512
    public static let author = 512
}
