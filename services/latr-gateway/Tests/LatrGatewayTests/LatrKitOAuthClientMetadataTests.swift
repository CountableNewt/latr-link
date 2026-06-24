import Foundation
import LatrGatewayLib
import XCTest

final class LatrKitOAuthClientMetadataTests: XCTestCase {
    func testBuildsGatewayMetadataWithSeparateRedirectOrigin() throws {
        let data = try LatrKitOAuthClientMetadata.buildJSON(
            publicOrigin: "https://api.testing.latr.link",
            redirectOrigin: "https://testing.latrkit.dev"
        )
        let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        XCTAssertEqual(
            obj?["client_id"] as? String,
            "https://api.testing.latr.link/oauth/latrkit-client-metadata.json"
        )
        XCTAssertEqual(obj?["client_uri"] as? String, "https://api.testing.latr.link")
        XCTAssertEqual(
            obj?["redirect_uris"] as? [String],
            ["https://testing.latrkit.dev/callback"]
        )
        XCTAssertEqual(obj?["scope"] as? String, LatrKitOAuthClientMetadata.scope)
    }
}
