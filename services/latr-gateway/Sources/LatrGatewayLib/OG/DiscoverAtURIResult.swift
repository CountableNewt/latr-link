import Foundation

public struct DiscoverAtURIResult: Encodable, Sendable {
    public let subjectUri: String?
    public let warning: String?

    public init(subjectUri: String?, warning: String? = nil) {
        self.subjectUri = subjectUri
        self.warning = warning
    }
}
