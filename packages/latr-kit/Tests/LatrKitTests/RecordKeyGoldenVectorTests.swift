import LatrKit
import XCTest

final class RecordKeyGoldenVectorTests: XCTestCase {
    func testEntryReadStateRkeyGoldenVector() {
        let subjectURI = "at://did:plc:alice/site.standard.document/abc123"
        XCTAssertEqual(
            RecordKey.key(forSubjectURI: subjectURI),
            "JPFAJWZIZ7VWQJ3CR2L7PEPRNZBZ6LJ7MKKO3RKWB642BF64NBXQ"
        )
    }

    func testLatrExternalRkeyGoldenVector() {
        XCTAssertEqual(
            RecordKey.key(forNormalizedURL: "https://example.com/article"),
            "MMSTQKIENDT2HHAGGI6J4OXJR4YQOLLEDS5TP2RXSF7VNO7LKU4Q"
        )
    }

    func testLatrFingerprintGoldenVector() {
        XCTAssertEqual(
            RecordKey.fingerprint(forNormalizedURL: "https://example.com/article"),
            "632538290468e7a39c06323c9e3ae98f31072d641cbb37ea37917f56bbeb5539"
        )
    }
}
