import LatrKit
import XCTest

final class URLNormalizerTests: XCTestCase {
    func testLowercasesHostAndScheme() {
        XCTAssertEqual(URLNormalizer.normalizedString(from: "HTTPS://Example.COM/foo"), "https://example.com/foo")
    }

    func testStripsFragment() {
        XCTAssertEqual(URLNormalizer.normalizedString(from: "https://a.com/x#y"), "https://a.com/x")
    }

    func testDropsTrackingParams() {
        XCTAssertEqual(
            URLNormalizer.normalizedString(from: "https://a.com/p?utm_source=x&ok=1&utm_campaign=z&fbclid=1&gclid=g&ref=r"),
            "https://a.com/p?ok=1"
        )
    }

    func testRejectsNonHTTP() {
        XCTAssertNil(URLNormalizer.normalizedString(from: "ftp://a.com"))
    }
}
