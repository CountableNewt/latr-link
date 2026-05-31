import Foundation
import LatrKit

public struct SavedItemsResponse: Encodable, Sendable {
    public let records: [RepositoryRecord<SavedItem>]
}
