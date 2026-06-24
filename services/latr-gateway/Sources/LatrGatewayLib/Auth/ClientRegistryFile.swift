import Foundation

struct ClientRegistryFile: Codable {
    var clients: [String: RegisteredClientRecord]
}
