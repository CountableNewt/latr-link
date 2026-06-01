import AsyncHTTPClient
import Foundation

private let cardybAPIBase = "https://cardyb.bsky.app/v1/extract"

private struct CardybResponse: Decodable {
    let error: String?
    let title: String?
    let description: String?
    let image: String?
}

func fetchOpenGraphViaCardyb(url: String, httpClient: HTTPClient) async -> OpenGraphFields? {
    guard var components = URLComponents(string: cardybAPIBase) else { return nil }
    components.queryItems = [URLQueryItem(name: "url", value: url)]
    guard let target = components.url?.absoluteString else { return nil }

    switch await fetchURLBodyLimited(
        target: target,
        maxBytes: 128 * 1024,
        accept: "application/json",
        httpClient: httpClient
    ) {
    case let .success(text, _):
        return parseCardybResponse(text, sourceURL: url)
    case .failure:
        return nil
    }
}

public func parseCardybResponse(_ json: String, sourceURL: String) -> OpenGraphFields? {
    guard let payload = try? JSONDecoder().decode(CardybResponse.self, from: Data(json.utf8)) else {
        return nil
    }

    if let error = payload.error?.trimmingCharacters(in: .whitespacesAndNewlines), !error.isEmpty {
        return nil
    }

    let title = payload.title?.trimmingCharacters(in: .whitespacesAndNewlines)
    let description = payload.description?.trimmingCharacters(in: .whitespacesAndNewlines)
    let image = payload.image?.trimmingCharacters(in: .whitespacesAndNewlines)
    let siteName = hostnameLabel(from: sourceURL)

    let fields = OpenGraphFields(
        title: title?.isEmpty == false ? title : siteName,
        description: description?.isEmpty == false ? description : nil,
        image: image?.isEmpty == false ? image : nil,
        siteName: siteName
    )

    guard fields.hasAnyValue,
          !isWeakOpenGraphTitle(fields.title, siteName: fields.siteName, pageURL: sourceURL)
              || fields.image?.isEmpty == false
    else {
        return nil
    }

    return fields
}
