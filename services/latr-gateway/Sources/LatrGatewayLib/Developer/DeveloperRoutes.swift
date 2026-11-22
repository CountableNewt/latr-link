import AsyncHTTPClient
import Foundation
import Hummingbird

public enum DeveloperRoutes {
    public static func register(on latr: RouterGroup<BasicRequestContext>, services: GatewayServices) {
        let developer = latr.group("developer")
        for path in ["clients", "clients/:clientId", "clients/:clientId/keys", "clients/:clientId/keys/:keyId", "usage"] {
            developer.get(RouterPath(path)) { _, _ in retiredDeveloperResponse() }
            developer.post(RouterPath(path)) { _, _ in retiredDeveloperResponse() }
            developer.delete(RouterPath(path)) { _, _ in retiredDeveloperResponse() }
        }
    }
}

func handleDeveloper(
    request: Request,
    services: GatewayServices,
    errorResponder: @Sendable (Error) -> Response = errorResponse,
    handler: (AuthContext) async throws -> Response
) async -> Response {
    do {
        let auth = try await authenticateDeveloperRequest(
            request,
            config: services.config,
            store: services.developerStore,
            httpClient: services.httpClient
        )
        try await attestDeveloperOAuthSessionIfNeeded(auth: auth) {
            try await services.repositoryClient(for: auth).attestOAuthSession()
        }
        return try await handler(auth)
    } catch {
        return errorResponder(error)
    }
}

func attestDeveloperOAuthSessionIfNeeded(
    auth: AuthContext,
    attest: @Sendable () async throws -> Void
) async throws {
    guard !auth.accessTokenSignatureVerified else { return }
    try await attest()
}

private func authenticateDeveloperRequest(
    _ request: Request,
    config: GatewayConfig,
    store: any DeveloperStore,
    httpClient: HTTPClient
) async throws -> AuthContext {
    try await authenticateRequest(
        request,
        config: config,
        store: store,
        httpClient: httpClient,
        requireClientAPIKey: false
    )
}

func retiredDeveloperResponse() -> Response {
    var response = (try? jsonResponse(ErrorBody(error: "developer_api_retired", message: "Public developer registration and API keys have been retired."), status: .gone)) ?? Response(status: .gone)
    response.headers[.cacheControl] = "no-store"
    return response
}
