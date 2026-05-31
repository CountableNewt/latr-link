import Foundation

public enum SaveBody: Decodable, Sendable {
    case url(String)
    case subject(subjectUri: String, linkedWebUrl: String?)

    enum CodingKeys: String, CodingKey {
        case kind
        case url
        case subjectUri
        case linkedWebUrl
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try container.decode(String.self, forKey: .kind)
        switch kind {
        case "url":
            self = .url(try container.decode(String.self, forKey: .url))
        case "subject":
            self = .subject(
                subjectUri: try container.decode(String.self, forKey: .subjectUri),
                linkedWebUrl: try container.decodeIfPresent(String.self, forKey: .linkedWebUrl)
            )
        default:
            throw GatewayError(status: .badRequest, message: "invalid save body", code: "invalid_body")
        }
    }
}
