import Foundation

/// Consumes one client-minted upstream DPoP proof per matching PDS XRPC call.
final class UpstreamProofPool: @unchecked Sendable {
    private let lock = NSLock()
    private var proofs: [String]

    init(rawHeader: String?) {
        if let raw = rawHeader?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty {
            proofs = raw.split(separator: ",")
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
        } else {
            proofs = []
        }
    }

    func consume(forXrpcMethod method: String, httpMethod: String) -> (proof: String, url: String)? {
        lock.lock()
        defer { lock.unlock() }

        for (index, proof) in proofs.enumerated() {
            guard let htu = decodeJWTClaimString(proof, claim: "htu"),
                  let htm = decodeJWTClaimString(proof, claim: "htm"),
                  htm.uppercased() == httpMethod.uppercased()
            else {
                continue
            }

            let normalized = htu.split(separator: "?").first.map(String.init) ?? htu
            guard normalized.hasSuffix("/xrpc/\(method)") else { continue }

            proofs.remove(at: index)
            return (proof, normalized)
        }

        return nil
    }
}

private func decodeJWTClaimString(_ jwt: String, claim: String) -> String? {
    let parts = jwt.split(separator: ".", omittingEmptySubsequences: false)
    guard parts.count >= 2 else { return nil }

    var payloadB64 = String(parts[1])
        .replacingOccurrences(of: "-", with: "+")
        .replacingOccurrences(of: "_", with: "/")
    let padding = (4 - payloadB64.count % 4) % 4
    payloadB64.append(String(repeating: "=", count: padding))

    guard let data = Data(base64Encoded: payloadB64),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let value = json[claim] as? String
    else {
        return nil
    }
    return value
}
