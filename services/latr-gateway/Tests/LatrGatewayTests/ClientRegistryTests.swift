import HTTPTypes
import LatrGatewayLib
import XCTest

final class ClientRegistryTests: XCTestCase {
    private func registryURL() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("latr-client-registry-\(UUID().uuidString).json")
    }

    private func makeHeaders(_ values: [String: String]) -> HTTPFields {
        var headers = HTTPFields()
        for (name, value) in values {
            guard let fieldName = HTTPField.Name(name) else { continue }
            headers[fieldName] = value
        }
        return headers
    }

    func testRegisterClientPersistsAndVerifiesAPIKey() async throws {
        let url = registryURL()
        let registry = ClientRegistry(bootstrapKeys: [:], registryURL: url)

        let registered = try await registry.registerClient(
            clientID: "Social-Wire",
            displayName: "The Social Wire"
        )
        XCTAssertEqual(registered.clientId, "social-wire")
        XCTAssertTrue(registered.apiKey.hasPrefix("latr_"))

        let resolved = try await registry.resolveClientID(
            from: makeHeaders([
                latrClientIDHeader: registered.clientId,
                latrAPIKeyHeader: registered.apiKey,
            ]),
            requireClientAPIKey: true
        )
        XCTAssertEqual(resolved, "social-wire")

        let reloaded = ClientRegistry(bootstrapKeys: [:], registryURL: url)
        let resolvedAgain = try await reloaded.resolveClientID(
            from: makeHeaders([
                latrClientIDHeader: registered.clientId,
                latrAPIKeyHeader: registered.apiKey,
            ]),
            requireClientAPIKey: true
        )
        XCTAssertEqual(resolvedAgain, "social-wire")
    }

    func testBootstrapKeysTakePrecedenceOverRegistry() async throws {
        let registry = ClientRegistry(
            bootstrapKeys: ["latr-web": "bootstrap-secret"],
            registryURL: registryURL()
        )

        let resolved = try await registry.resolveClientID(
            from: makeHeaders([
                latrClientIDHeader: "latr-web",
                latrAPIKeyHeader: "bootstrap-secret",
            ]),
            requireClientAPIKey: true
        )
        XCTAssertEqual(resolved, "latr-web")
    }

    func testRegisterClientRejectsDuplicate() async throws {
        let registry = ClientRegistry(bootstrapKeys: [:], registryURL: registryURL())
        _ = try await registry.registerClient(clientID: "latr-web", displayName: nil)

        do {
            _ = try await registry.registerClient(clientID: "latr-web", displayName: nil)
            XCTFail("Expected duplicate registration to fail")
        } catch let error as GatewayError {
            XCTAssertEqual(error.code, "client_exists")
        }
    }

    func testRevokeClientRemovesRegisteredCredential() async throws {
        let url = registryURL()
        let registry = ClientRegistry(bootstrapKeys: [:], registryURL: url)
        let registered = try await registry.registerClient(clientID: "revoke-me", displayName: nil)
        _ = try await registry.revokeClient(clientID: "revoke-me")

        do {
            _ = try await registry.resolveClientID(
                from: makeHeaders([
                    latrClientIDHeader: registered.clientId,
                    latrAPIKeyHeader: registered.apiKey,
                ]),
                requireClientAPIKey: true
            )
            XCTFail("Expected revoked client to fail verification")
        } catch let error as GatewayError {
            XCTAssertEqual(error.code, "client_api_key_policy")
        }
    }
}
