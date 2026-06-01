import AsyncHTTPClient
import Foundation

private let microlinkAPIBase = "https://api.microlink.io/"

private struct MicrolinkResponse: Decodable {
    struct ImagePayload: Decodable {
        let url: String?
    }

    struct DataPayload: Decodable {
        let title: String?
        let description: String?
        let author: String?
        let publisher: String?
        let image: ImagePayload?
    }

    let status: String?
    let data: DataPayload?
}

func fetchOpenGraphViaMicrolink(url: String, httpClient: HTTPClient) async -> OpenGraphFields? {
    guard var components = URLComponents(string: microlinkAPIBase) else { return nil }
    components.queryItems = [URLQueryItem(name: "url", value: url)]

    guard let target = components.url?.absoluteString else { return nil }

    switch await fetchURLBodyLimited(
        target: target,
        maxBytes: 256 * 1024,
        accept: "application/json",
        httpClient: httpClient
    ) {
    case let .success(text, _):
        return parseMicrolinkResponse(text, sourceURL: url)
    case .failure:
        return nil
    }
}

public func parseMicrolinkResponse(_ json: String, sourceURL: String) -> OpenGraphFields? {
    guard let payload = try? JSONDecoder().decode(MicrolinkResponse.self, from: Data(json.utf8)).data else {
        return nil
    }

    let title = payload.title?.trimmingCharacters(in: .whitespacesAndNewlines)
    let description = payload.description?.trimmingCharacters(in: .whitespacesAndNewlines)
    let image = payload.image?.url?.trimmingCharacters(in: .whitespacesAndNewlines)
    let siteName = payload.publisher?.trimmingCharacters(in: .whitespacesAndNewlines)
        ?? hostnameLabel(from: sourceURL)
    let author = payload.author?.trimmingCharacters(in: .whitespacesAndNewlines)

    guard title?.isEmpty == false || image?.isEmpty == false || siteName != nil else {
        return nil
    }

    return OpenGraphFields(
        title: title?.isEmpty == false ? title : siteName,
        description: description?.isEmpty == false ? description : nil,
        image: image?.isEmpty == false ? image : nil,
        siteName: siteName,
        author: author?.isEmpty == false ? author : nil
    )
}
