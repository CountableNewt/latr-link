import Foundation

struct JWTPayload: Decodable {
    let sub: String?
    let exp: Int?
    let client_id: String?
    let azp: String?
    let aud: Audience?

    enum Audience: Decodable {
        case single(String)
        case multiple([String])

        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if let array = try? container.decode([String].self) {
                self = .multiple(array)
            } else {
                self = .single(try container.decode(String.self))
            }
        }

        var values: [String] {
            switch self {
            case let .single(value): [value]
            case let .multiple(values): values
            }
        }
    }
}

func decodeJWTPayload(_ token: String) throws -> JWTPayload {
    let parts = token.split(separator: ".", omittingEmptySubsequences: false)
    guard parts.count >= 2 else {
        throw GatewayError(status: .unauthorized, message: "Malformed access token", code: "invalid_token")
    }

    var payloadB64 = String(parts[1])
        .replacingOccurrences(of: "-", with: "+")
        .replacingOccurrences(of: "_", with: "/")
    let padding = (4 - payloadB64.count % 4) % 4
    payloadB64.append(String(repeating: "=", count: padding))

    guard let data = Data(base64Encoded: payloadB64) else {
        throw GatewayError(
            status: .unauthorized,
            message: "Malformed access token payload",
            code: "invalid_token"
        )
    }

    do {
        return try JSONDecoder().decode(JWTPayload.self, from: data)
    } catch {
        throw GatewayError(
            status: .unauthorized,
            message: "Malformed access token payload",
            code: "invalid_token"
        )
    }
}

func assertKnownClient(config: GatewayConfig, payload: JWTPayload) throws {
    guard config.oauthRequireKnownClient else { return }

    if config.oauthAllowedClientIDs.isEmpty {
        throw GatewayError(
            status: .forbidden,
            message: "Gateway client policy enabled but no allowlist configured",
            code: "client_policy"
        )
    }

    var candidates: [String] = []
    if let clientID = payload.client_id { candidates.append(clientID) }
    if let azp = payload.azp { candidates.append(azp) }
    if candidates.contains(where: { config.oauthAllowedClientIDs.contains($0) }) {
        return
    }

    if let aud = payload.aud?.values,
       aud.contains(where: { config.oauthAllowedClientIDs.contains($0) })
    {
        return
    }

    throw GatewayError(
        status: .forbidden,
        message: "OAuth client is not authorized for this gateway",
        code: "client_forbidden"
    )
}
