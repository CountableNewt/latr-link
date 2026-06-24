import Foundation
import LatrGatewayLib
import XCTest

final class WebOAuthClientMetadataTests: XCTestCase {
    func testBuildsGatewayMetadataWithSeparateRedirectOrigin() throws {
        let data = try WebOAuthClientMetadata.buildJSON(
            publicOrigin: "https://latr-link-dev-gateway.fly.dev",
            redirectOrigin: "https://testing.latr.link"
        )
        let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        XCTAssertEqual(
            obj?["client_id"] as? String,
            "https://latr-link-dev-gateway.fly.dev/oauth/client-metadata.json"
        )
        XCTAssertEqual(
            obj?["redirect_uris"] as? [String],
            ["https://testing.latr.link/callback"]
        )
        XCTAssertEqual(obj?["scope"] as? String, ATProtoOAuthScopes.scope)
    }
}
