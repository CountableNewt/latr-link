import Foundation

/// A saved-item edge record (`com.latr.saved.item`).
public struct SavedItem: Codable, Sendable, Equatable {
    public var type: String
    public var subjectUri: String
    public var savedAt: String
    public var state: SavedItemState?
    public var tags: [String]?
    public var note: String?
    public var lastOpenedAt: String?
    public var linkedWebUrl: String?
    public var previewTitle: String?
    public var previewExcerpt: String?
    public var previewSite: String?
    public var previewImage: String?
    public var previewAuthor: String?

    enum CodingKeys: String, CodingKey {
        case type = "$type"
        case subjectUri
        case savedAt
        case state
        case tags
        case note
        case lastOpenedAt
        case linkedWebUrl
        case previewTitle
        case previewExcerpt
        case previewSite
        case previewImage
        case previewAuthor
    }

    public init(
        subjectUri: String,
        savedAt: String,
        state: SavedItemState? = nil,
        tags: [String]? = nil,
        note: String? = nil,
        lastOpenedAt: String? = nil,
        linkedWebUrl: String? = nil,
        previewTitle: String? = nil,
        previewExcerpt: String? = nil,
        previewSite: String? = nil,
        previewImage: String? = nil,
        previewAuthor: String? = nil
    ) {
        self.type = LexiconCollection.savedItem.identifier
        self.subjectUri = subjectUri
        self.savedAt = savedAt
        self.state = state
        self.tags = tags
        self.note = note
        self.lastOpenedAt = lastOpenedAt
        self.linkedWebUrl = linkedWebUrl
        self.previewTitle = previewTitle
        self.previewExcerpt = previewExcerpt
        self.previewSite = previewSite
        self.previewImage = previewImage
        self.previewAuthor = previewAuthor
    }
}
