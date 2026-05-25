import Foundation

/// ATProto collection identifiers for L@tr lexicons.
public enum LexiconCollection: String, Sendable {
    case external = "com.latr.saved.external"
    case savedItem = "com.latr.saved.item"

    public var identifier: String { rawValue }
}
