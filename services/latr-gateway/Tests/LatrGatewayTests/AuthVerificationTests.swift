import AsyncHTTPClient
import Crypto
import Foundation
import Hummingbird
import HTTPTypes
@testable import LatrGatewayLib
import NIOCore
import XCTest

final class AuthVerificationTests: XCTestCase {
    func testAuthExtractorsAcceptForwardedProxyHeaders() throws {
        var headers = HTTPFields()
        headers[HTTPField.Name(forwardedAuthorizationHeader)!] = "DPoP forwarded-token"
        headers[HTTPField.Name(forwardedDPOPHeader)!] = "forwarded.dpop.jwt"
        headers[HTTPField.Name(upstreamDPOPHeader)!] = "upstream.dpop.jwt"

        XCTAssertEqual(
            extractAuthorizationHeader(from: headers),
            "DPoP forwarded-token"
        )
        XCTAssertEqual(extractDPOPHeader(from: headers), "forwarded.dpop.jwt")
        XCTAssertEqual(extractUpstreamDPOPHeader(from: headers), "upstream.dpop.jwt")
    }

    func testAuthExtractorsAcceptLowercaseForwardedProxyHeaders() throws {
        var headers = HTTPFields()
        headers[HTTPField.Name(forwardedAuthorizationHeader.lowercased())!] =
            "DPoP forwarded-token"
        headers[HTTPField.Name(forwardedDPOPHeader.lowercased())!] =
            "forwarded.dpop.jwt"
        headers[HTTPField.Name(upstreamDPOPHeader.lowercased())!] =
            "upstream.dpop.jwt"

        XCTAssertEqual(
            extractAuthorizationHeader(from: headers),
            "DPoP forwarded-token"
        )
        XCTAssertEqual(extractDPOPHeader(from: headers), "forwarded.dpop.jwt")
        XCTAssertEqual(extractUpstreamDPOPHeader(from: headers), "upstream.dpop.jwt")
    }

    func testAuthExtractorsPreferStandardHeadersOverForwardedProxyHeaders() throws {
        var headers = HTTPFields()
        headers[.authorization] = "DPoP standard-token"
        headers[HTTPField.Name(forwardedAuthorizationHeader)!] = "DPoP forwarded-token"
        headers[HTTPField.Name("DPoP")!] = "standard.dpop.jwt"
        headers[HTTPField.Name(forwardedDPOPHeader)!] = "forwarded.dpop.jwt"

        XCTAssertEqual(extractAuthorizationHeader(from: headers), "DPoP standard-token")
        XCTAssertEqual(extractDPOPHeader(from: headers), "standard.dpop.jwt")
    }

    func testDPoPRejectsUnsignedProofThatUsedToPassStructureCheck() throws {
        let token = unsignedAccessToken()
        let proof = unsignedProof(
            htm: "GET",
            htu: "https://api.testing.latr.link/v1/latr/saves",
            accessToken: token
        )

        XCTAssertThrowsError(
            try verifyGatewayDPoP(
                proof: proof,
                accessToken: token,
                request: request(path: "/v1/latr/saves")
            )
        )
    }

    func testDPoPRejectsWrongRequestBinding() throws {
        let key = P256.Signing.PrivateKey()
        let jwk = jwk(for: key.publicKey)
        let token = try signedAccessToken(signingKey: key, dpopJWK: jwk)
        let proof = try signedDPoP(
            signingKey: key,
            jwk: jwk,
            htm: "POST",
            htu: "https://api.testing.latr.link/v1/latr/saves",
            accessToken: token
        )

        XCTAssertThrowsError(
            try verifyGatewayDPoP(
                proof: proof,
                accessToken: token,
                request: request(path: "/v1/latr/saves")
            )
        )
    }

    func testDPoPAcceptsForwardedProxyPrefixForSameGatewayRoute() throws {
        let key = P256.Signing.PrivateKey()
        let jwk = jwk(for: key.publicKey)
        let token = try signedAccessToken(signingKey: key, dpopJWK: jwk)
        let proof = try signedDPoP(
            signingKey: key,
            jwk: jwk,
            htm: "GET",
            htu: "https://testing.latr.link/api/latr-gateway/v1/latr/saves",
            accessToken: token
        )

        XCTAssertNoThrow(
            try verifyGatewayDPoP(
                proof: proof,
                accessToken: token,
                request: request(
                    path: "/v1/latr/saves",
                    headers: [
                        HTTPField.Name("X-Forwarded-Host")!: "testing.latr.link",
                        HTTPField.Name("X-Forwarded-Proto")!: "https",
                    ]
                )
            )
        )
    }

    func testDPoPAcceptsHostedAuthorityWhenSchemeIsMissing() throws {
        let key = P256.Signing.PrivateKey()
        let jwk = jwk(for: key.publicKey)
        let token = try signedAccessToken(signingKey: key, dpopJWK: jwk)
        let proof = try signedDPoP(
            signingKey: key,
            jwk: jwk,
            htm: "GET",
            htu: "https://api.testing.latr.link/v1/latr/saves",
            accessToken: token
        )

        XCTAssertNoThrow(
            try verifyGatewayDPoP(
                proof: proof,
                accessToken: token,
                request: request(
                    path: "/v1/latr/saves",
                    scheme: nil,
                    authority: "api.testing.latr.link"
                )
            )
        )
    }

    func testDPoPAcceptsProofURLWithoutQueryString() throws {
        let key = P256.Signing.PrivateKey()
        let jwk = jwk(for: key.publicKey)
        let token = try signedAccessToken(signingKey: key, dpopJWK: jwk)
        let proof = try signedDPoP(
            signingKey: key,
            jwk: jwk,
            htm: "GET",
            htu: "https://api.testing.latr.link/v1/latr/og-preview",
            accessToken: token
        )

        XCTAssertNoThrow(
            try verifyGatewayDPoP(
                proof: proof,
                accessToken: token,
                request: request(
                    path: "/v1/latr/og-preview?url=https%3A%2F%2Fexample.com",
                    scheme: nil,
                    authority: "api.testing.latr.link"
                )
            )
        )
    }

    func testOAuthVerifierRejectsTamperedAccessTokenSignature() async throws {
        let key = P256.Signing.PrivateKey()
        let jwk = jwk(for: key.publicKey)
        let token = try signedAccessToken(signingKey: key, dpopJWK: jwk)
        let tampered = "\(token)a"
        let httpClient = HTTPClient(eventLoopGroupProvider: .singleton)
        let verifier = OAuthTokenVerifier(
            httpClient: httpClient,
            fetchData: { url in
                if url.absoluteString == "https://auth.example/.well-known/oauth-authorization-server" {
                    return Data(#"{"issuer":"https://auth.example","jwks_uri":"https://auth.example/jwks.json"}"#.utf8)
                }
                if url.absoluteString == "https://auth.example/jwks.json" {
                    let jwks = #"{"keys":[{"kty":"EC","kid":"test-key","crv":"P-256","x":"\#(jwk.x)","y":"\#(jwk.y)"}]}"#
                    return Data(jwks.utf8)
                }
                throw GatewayError(status: .unauthorized, message: "unexpected url", code: "test")
            }
        )

        do {
            _ = try await verifier.verify(accessToken: tampered, dpopJWK: jwk)
            XCTFail("tampered token should fail verification")
        } catch {}
        try await httpClient.shutdown()
    }

    func testOAuthVerifierReportsUnsupportedES256KTokens() async throws {
        let key = P256.Signing.PrivateKey()
        let jwk = jwk(for: key.publicKey)
        let token = try unsupportedES256KAccessToken(dpopJWK: jwk)
        let httpClient = HTTPClient(eventLoopGroupProvider: .singleton)
        let verifier = OAuthTokenVerifier(
            httpClient: httpClient,
            fetchData: { url in
                if url.absoluteString == "https://auth.example/.well-known/oauth-authorization-server" {
                    return Data(#"{"issuer":"https://auth.example","jwks_uri":"https://auth.example/jwks.json"}"#.utf8)
                }
                if url.absoluteString == "https://auth.example/jwks.json" {
                    let jwks = #"{"keys":[{"kty":"EC","kid":"test-key","crv":"secp256k1","x":"test","y":"test"}]}"#
                    return Data(jwks.utf8)
                }
                throw GatewayError(status: .unauthorized, message: "unexpected url", code: "test")
            }
        )

        do {
            _ = try await verifier.verify(accessToken: token, dpopJWK: jwk)
            XCTFail("ES256K token verification should fail until secp256k1 support is added")
        } catch let error as GatewayError {
            XCTAssertEqual(error.code, "unsupported_token_alg")
        }
        try await httpClient.shutdown()
    }

    private func request(
        path: String,
        scheme: String? = "https",
        authority: String? = "api.testing.latr.link",
        headers: HTTPFields = [:]
    ) -> Request {
        Request(
            head: HTTPRequest(
                method: .get,
                scheme: scheme,
                authority: authority,
                path: path,
                headerFields: headers
            ),
            body: RequestBody(buffer: ByteBuffer())
        )
    }

    private func unsignedAccessToken() -> String {
        let header = #"{"alg":"none"}"#
        let payload = #"{"sub":"did:plc:test","iss":"https://auth.example","exp":4102444800,"cnf":{"jkt":"test"}}"#
        return "\(base64URLEncode(Data(header.utf8))).\(base64URLEncode(Data(payload.utf8))).sig"
    }

    private func unsignedProof(htm: String, htu: String, accessToken: String) -> String {
        let header = #"{"typ":"dpop+jwt","alg":"none","jwk":{"kty":"EC","crv":"P-256","x":"test","y":"test"}}"#
        let ath = base64URLEncode(Data(SHA256.hash(data: Data(accessToken.utf8))))
        let payload = #"{"htm":"\#(htm)","htu":"\#(htu)","iat":1782860400,"jti":"unsigned-proof","ath":"\#(ath)"}"#
        return "\(base64URLEncode(Data(header.utf8))).\(base64URLEncode(Data(payload.utf8))).sig"
    }

    private func signedAccessToken(signingKey: P256.Signing.PrivateKey, dpopJWK: DPoPJWK) throws -> String {
        let header = #"{"alg":"ES256","kid":"test-key"}"#
        let jkt = try jwkThumbprint(dpopJWK)
        let payload = #"{"sub":"did:plc:test","iss":"https://auth.example","exp":4102444800,"cnf":{"jkt":"\#(jkt)"}}"#
        return try signJWT(header: header, payload: payload, signingKey: signingKey)
    }

    private func unsupportedES256KAccessToken(dpopJWK: DPoPJWK) throws -> String {
        let header = #"{"typ":"at+jwt","alg":"ES256K"}"#
        let jkt = try jwkThumbprint(dpopJWK)
        let payload = #"{"sub":"did:plc:test","iss":"https://auth.example","exp":4102444800,"cnf":{"jkt":"\#(jkt)"}}"#
        return "\(base64URLEncode(Data(header.utf8))).\(base64URLEncode(Data(payload.utf8))).sig"
    }

    private func signedDPoP(
        signingKey: P256.Signing.PrivateKey,
        jwk: DPoPJWK,
        htm: String,
        htu: String,
        accessToken: String
    ) throws -> String {
        let header = #"{"typ":"dpop+jwt","alg":"ES256","jwk":{"kty":"EC","crv":"P-256","x":"\#(jwk.x)","y":"\#(jwk.y)"}}"#
        let ath = base64URLEncode(Data(SHA256.hash(data: Data(accessToken.utf8))))
        let iat = Int(Date().timeIntervalSince1970)
        let payload = #"{"htm":"\#(htm)","htu":"\#(htu)","iat":\#(iat),"jti":"\#(UUID().uuidString)","ath":"\#(ath)"}"#
        return try signJWT(header: header, payload: payload, signingKey: signingKey)
    }

    private func signJWT(header: String, payload: String, signingKey: P256.Signing.PrivateKey) throws -> String {
        let signingInput = "\(base64URLEncode(Data(header.utf8))).\(base64URLEncode(Data(payload.utf8)))"
        let signature = try signingKey.signature(for: Data(signingInput.utf8)).rawRepresentation
        return "\(signingInput).\(base64URLEncode(signature))"
    }

    private func jwk(for publicKey: P256.Signing.PublicKey) -> DPoPJWK {
        let raw = publicKey.x963Representation
        return DPoPJWK(
            kty: "EC",
            crv: "P-256",
            x: base64URLEncode(raw.dropFirst().prefix(32)),
            y: base64URLEncode(raw.dropFirst(33).prefix(32))
        )
    }
}
