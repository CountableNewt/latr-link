import Foundation
import LatrKit

public struct SavedItemLookupResponse: Encodable, Sendable {
    public let record: RepositoryRecord<SavedItem>?
}
