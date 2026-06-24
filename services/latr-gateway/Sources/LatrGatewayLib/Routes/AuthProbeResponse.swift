import Foundation

public struct AuthProbeResponse: Encodable, Sendable {
    public let ok: Bool
    public let did: String
    public let clientId: String?
    public let pdsWriteThrough: Bool
    public let sampleCount: Int
    public let upstreamDpop: Bool
}
