import Foundation
import LatrKit

public struct StatePatchBody: Decodable, Sendable {
    public let state: SavedItemState
}
