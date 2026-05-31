import Foundation

public struct SaveURLPipelineResult: Sendable, Equatable {
    public let kind: String
    public let subjectUri: String
    public let linkedWebUrl: String?
    public let storage: String

    public init(kind: String, subjectUri: String, linkedWebUrl: String?, storage: String) {
        self.kind = kind
        self.subjectUri = subjectUri
        self.linkedWebUrl = linkedWebUrl
        self.storage = storage
    }
}
