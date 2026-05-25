import Foundation

public struct RepositoryRecord<Value: Codable & Sendable>: Codable, Sendable {
    public let uri: String
    public let cid: String
    public let value: Value

    public init(uri: String, cid: String, value: Value) {
        self.uri = uri
        self.cid = cid
        self.value = value
    }
}

public struct RecordList<Value: Codable & Sendable>: Sendable {
    public let records: [RepositoryRecord<Value>]
    public let cursor: String?

    public init(records: [RepositoryRecord<Value>], cursor: String?) {
        self.records = records
        self.cursor = cursor
    }
}

public struct CreateRecordResponse: Sendable {
    public let uri: String

    public init(uri: String) {
        self.uri = uri
    }
}

public struct UpdateRecordResponse: Sendable {
    public let uri: String

    public init(uri: String) {
        self.uri = uri
    }
}

/// Abstraction over ATProto `com.atproto.repo.*` operations.
public protocol RepositoryClient: Sendable {
    func listRecords<Value>(
        in repository: String,
        collection: LexiconCollection,
        limit: Int?,
        startingAfter cursor: String?
    ) async throws -> RecordList<Value> where Value: Codable & Sendable

    func record<Value>(
        in repository: String,
        collection: LexiconCollection,
        withKey key: String
    ) async throws -> RepositoryRecord<Value>? where Value: Codable & Sendable

    func createRecord(
        in repository: String,
        collection: LexiconCollection,
        withKey key: String,
        value: some Encodable & Sendable
    ) async throws -> CreateRecordResponse

    func updateRecord(
        in repository: String,
        collection: LexiconCollection,
        withKey key: String,
        value: some Encodable & Sendable
    ) async throws -> UpdateRecordResponse

    func deleteRecord(
        in repository: String,
        collection: LexiconCollection,
        withKey key: String
    ) async throws
}
