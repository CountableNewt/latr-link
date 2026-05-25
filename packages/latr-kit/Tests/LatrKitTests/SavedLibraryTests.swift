import LatrKit
import XCTest

final class SavedLibraryTests: XCTestCase {
    private let did = "did:plc:testviewer"

    private func library(using repository: InMemoryRepository = InMemoryRepository()) -> (SavedLibrary, InMemoryRepository) {
        (SavedLibrary(repository: repository, repositoryDID: did), repository)
    }

    func testEnsureExternalSaveCreatesDeterministicWrapperOnce() async throws {
        let (library, repository) = library()
        let first = try await library.ensureExternalSave(for: "https://Example.COM/article?utm_source=x")
        let second = try await library.ensureExternalSave(for: "https://example.com/article")

        XCTAssertEqual(first.normalizedURL, "https://example.com/article")
        XCTAssertEqual(second.wrapperURI, first.wrapperURI)
        XCTAssertEqual(
            repository.snapshotKeys().filter { $0.hasPrefix("\(LexiconCollection.external.identifier):") }.count,
            1
        )
    }

    func testSaveURLCreatesRecordsWithPreview() async throws {
        let (library, repository) = library()
        try await library.save(
            url: "https://news.example/story",
            preview: OpenGraphPreview(
                title: "Story",
                description: "Lead",
                image: "https://news.example/og.png"
            )
        )

        let externalKey = RecordKey.key(forNormalizedURL: "https://news.example/story")
        let external = try await library.externalSave(withKey: externalKey)
        let wrapperURI = ATURI.externalSave(repositoryDID: did, recordKey: externalKey)
        let itemKey = RecordKey.key(forSubjectURI: wrapperURI)
        let item = try await library.savedItem(withKey: itemKey)

        XCTAssertEqual(external?.value.title, "Story")
        XCTAssertEqual(item?.value.state, .unread)
        XCTAssertTrue(repository.hasRecord(collection: .savedItem, key: itemKey))
    }

    func testSetStateUpdatesExistingItem() async throws {
        let (library, _) = library()
        let subjectURI = "at://did:plc:author/app.bsky.feed.post/state"
        _ = try await library.upsertSavedItem(subjectURI: subjectURI, state: .unread)
        let key = RecordKey.key(forSubjectURI: subjectURI)
        try await library.setState(ofSavedItemWithKey: key, to: .archived)

        let record = try await library.savedItem(withKey: key)
        XCTAssertEqual(record?.value.state, .archived)
    }

    func testRemoveSavedItemRemovesOnlyEdge() async throws {
        let (library, repository) = library()
        try await library.save(url: "https://delete.example/x")
        let externalKey = RecordKey.key(forNormalizedURL: "https://delete.example/x")
        let wrapperURI = ATURI.externalSave(repositoryDID: did, recordKey: externalKey)
        let itemKey = RecordKey.key(forSubjectURI: wrapperURI)

        try await library.removeSavedItem(withKey: itemKey)

        XCTAssertFalse(repository.hasRecord(collection: .savedItem, key: itemKey))
        XCTAssertTrue(repository.hasRecord(collection: .external, key: externalKey))
    }

    func testExternalSaveDisplayTitlePrefersTitleThenSiteThenURL() {
        let bare = ExternalSave(
            url: "https://fallback.example",
            normalizedUrl: "https://fallback.example",
            fingerprint: "abc",
            createdAt: "2026-01-01T00:00:00Z"
        )
        XCTAssertEqual(bare.displayTitle, "https://fallback.example")

        let withSite = ExternalSave(
            url: "https://x.com",
            normalizedUrl: "https://x.com",
            fingerprint: "abc",
            createdAt: "2026-01-01T00:00:00Z",
            site: "Example Org"
        )
        XCTAssertEqual(withSite.displayTitle, "Example Org")

        let withTitle = ExternalSave(
            url: "https://x.com",
            normalizedUrl: "https://x.com",
            fingerprint: "abc",
            createdAt: "2026-01-01T00:00:00Z",
            title: "Headline",
            site: "Example Org"
        )
        XCTAssertEqual(withTitle.displayTitle, "Headline")
    }
}
