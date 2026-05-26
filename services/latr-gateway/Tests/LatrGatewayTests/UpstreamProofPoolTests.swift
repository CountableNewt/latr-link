@testable import LatrGatewayLib
import XCTest

final class UpstreamProofPoolTests: XCTestCase {
    func testConsumesMatchingProofOncePerCall() {
        let createOne =
            "eyJhbGciOiJub25lIn0.eyJodHUiOiJodHRwczovL3Bkcy5leGFtcGxlL3hycGMvY29tLmF0cHJvdG8ucmVwby5jcmVhdGVSZWNvcmQiLCJodG0iOiJQT1NUIn0.signature"
        let createTwo =
            "eyJhbGciOiJub25lIn0.eyJodHUiOiJodHRwczovL3Bkcy5leGFtcGxlL3hycGMvY29tLmF0cHJvdG8ucmVwby5jcmVhdGVSZWNvcmQiLCJodG0iOiJQT1NUIn0.signature2"
        let putProof =
            "eyJhbGciOiJub25lIn0.eyJodHUiOiJodHRwczovL3Bkcy5leGFtcGxlL3hycGMvY29tLmF0cHJvdG8ucmVwby5wdXRSZWNvcmQiLCJodG0iOiJQT1NUIn0.signature3"

        let pool = UpstreamProofPool(rawHeader: "\(createOne),\(createTwo),\(putProof)")

        let first = pool.consume(
            forXrpcMethod: "com.atproto.repo.createRecord",
            httpMethod: "POST"
        )
        XCTAssertEqual(first?.proof, createOne)
        XCTAssertEqual(
            first?.url,
            "https://pds.example/xrpc/com.atproto.repo.createRecord"
        )

        let second = pool.consume(
            forXrpcMethod: "com.atproto.repo.createRecord",
            httpMethod: "POST"
        )
        XCTAssertEqual(second?.proof, createTwo)

        let third = pool.consume(
            forXrpcMethod: "com.atproto.repo.putRecord",
            httpMethod: "POST"
        )
        XCTAssertEqual(third?.proof, putProof)

        XCTAssertNil(
            pool.consume(
                forXrpcMethod: "com.atproto.repo.createRecord",
                httpMethod: "POST"
            )
        )
    }
}
