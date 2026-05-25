import Foundation
import LatrKit

final class InMemoryRepository: RepositoryClient, @unchecked Sendable {
    private var store: [String: (uri: String, cid: String, json: Data)] = [:]

    func snapshotKeys() -> [String] { Array(store.keys) }

    private func storeKey(collection: LexiconCollection, key: String) -> String {
        "\(collection.identifier):\(key)"
    }

    func listRecords<Value>(
        in repository: String,
        collection: LexiconCollection,
        limit: Int?,
        startingAfter cursor: String?
    ) async throws -> RecordList<Value> where Value: Decodable, Value: Encodable, Value: Sendable {
        let prefix = "\(collection.identifier):"
        let all: [RepositoryRecord<Value>] = try store
            .filter { $0.key.hasPrefix(prefix) }
            .map { _, entry in
                let decoded = try JSONDecoder().decode(Value.self, from: entry.json)
                return RepositoryRecord(uri: entry.uri, cid: entry.cid, value: decoded)
            }

        let start = cursor.flatMap { Int($0) } ?? 0
        let pageLimit = limit ?? 100
        let page = Array(all.dropFirst(start).prefix(pageLimit))
        let next = start + pageLimit < all.count ? String(start + pageLimit) : nil
        return RecordList(records: page, cursor: next)
    }

    func record<Value>(
        in repository: String,
        collection: LexiconCollection,
        withKey key: String
    ) async throws -> RepositoryRecord<Value>? where Value: Decodable, Value: Encodable, Value: Sendable {
        guard let entry = store[storeKey(collection: collection, key: key)] else { return nil }
        let decoded = try JSONDecoder().decode(Value.self, from: entry.json)
        return RepositoryRecord(uri: entry.uri, cid: entry.cid, value: decoded)
    }

    func createRecord(
        in repository: String,
        collection: LexiconCollection,
        withKey key: String,
        value: some Encodable & Sendable
    ) async throws -> CreateRecordResponse {
        let uri = "at://\(repository)/\(collection.identifier)/\(key)"
        let json = try JSONEncoder().encode(value)
        store[storeKey(collection: collection, key: key)] = (uri: uri, cid: "bafytest", json: json)
        return CreateRecordResponse(uri: uri)
    }

    func updateRecord(
        in repository: String,
        collection: LexiconCollection,
        withKey key: String,
        value: some Encodable & Sendable
    ) async throws -> UpdateRecordResponse {
        let uri = "at://\(repository)/\(collection.identifier)/\(key)"
        let json = try JSONEncoder().encode(value)
        store[storeKey(collection: collection, key: key)] = (uri: uri, cid: "bafytest", json: json)
        return UpdateRecordResponse(uri: uri)
    }

    func deleteRecord(
        in repository: String,
        collection: LexiconCollection,
        withKey key: String
    ) async throws {
        store.removeValue(forKey: storeKey(collection: collection, key: key))
    }

    func hasRecord(collection: LexiconCollection, key: String) -> Bool {
        store[storeKey(collection: collection, key: key)] != nil
    }
}
