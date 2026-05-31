import Foundation

public struct SaveOKResponse: Encodable, Sendable {
    public let ok: Bool
    public let kind: String
    public let subjectUri: String?
    public let linkedWebUrl: String?
    public let storage: String?

    public init(
        ok: Bool,
        kind: String,
        subjectUri: String? = nil,
        linkedWebUrl: String? = nil,
        storage: String? = nil
    ) {
        self.ok = ok
        self.kind = kind
        self.subjectUri = subjectUri
        self.linkedWebUrl = linkedWebUrl
        self.storage = storage
    }
}
