import AsyncHTTPClient
import Foundation
import Logging

private let maxHTMLBytes = 512 * 1024
private let ogResolverLogger = Logger(label: "latr-gateway.og")

public func resolveOpenGraphForURL(
    url: String,
    httpClient: HTTPClient,
    prefetchedHTML: String? = nil,
    prefetchedFinalURL: String? = nil
) async -> OpenGraphFields? {
    let trimmed = url.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let parsed = URL(string: trimmed),
          let scheme = parsed.scheme?.lowercased(),
          scheme == "http" || scheme == "https"
    else {
        return nil
    }

    var resolvedURL = prefetchedFinalURL ?? trimmed
    var htmlForSignals: String?
    var fields = OpenGraphFields()

    if let html = prefetchedHTML, !html.isEmpty {
        htmlForSignals = html
        fields = enrichOpenGraphFields(
            parseOpenGraphFromHeadOnly(html: html, resolvedPageURL: resolvedURL),
            resolvedPageURL: resolvedURL
        )
    } else {
        switch await fetchURLBodyLimited(target: trimmed, maxBytes: maxHTMLBytes, httpClient: httpClient) {
        case let .success(text, finalURL):
            htmlForSignals = text
            resolvedURL = finalURL
            fields = enrichOpenGraphFields(
                parseOpenGraphMarkup(html: text, resolvedPageURL: finalURL),
                resolvedPageURL: finalURL
            )
        case let .failure(reason):
            ogResolverLogger.warning(
                "OG fetch failed",
                metadata: ["url": .string(trimmed), "reason": .string(reason)]
            )
        }
    }

    let signals = htmlForSignals.map {
        openGraphMetaSignals(html: $0, resolvedPageURL: resolvedURL)
    }

    if openGraphNeedsReaderEnhancement(fields: fields, signals: signals, pageURL: trimmed) {
        fields = await enhanceOpenGraphFields(
            url: trimmed,
            current: fields,
            httpClient: httpClient
        )
    } else if fields.hasAnyValue {
        ogResolverLogger.info(
            "OG resolved from direct fetch",
            metadata: ["url": .string(trimmed), "finalUrl": .string(resolvedURL)]
        )
    } else if htmlForSignals != nil {
        ogResolverLogger.info(
            "OG parse returned no usable fields",
            metadata: ["url": .string(trimmed), "finalUrl": .string(resolvedURL)]
        )
    }

    if fields.hasAnyValue {
        return fields
    }

    ogResolverLogger.info(
        "OG using degraded URL fallback",
        metadata: ["url": .string(trimmed)]
    )
    return enrichOpenGraphFields(degradedOpenGraphFields(from: trimmed), resolvedPageURL: trimmed)
}

private func enhanceOpenGraphFields(
    url: String,
    current: OpenGraphFields,
    httpClient: HTTPClient
) async -> OpenGraphFields {
    var enhanced = current

    if let microlink = await fetchOpenGraphViaMicrolink(url: url, httpClient: httpClient),
       microlink.hasAnyValue
    {
        ogResolverLogger.info("OG enhanced via microlink", metadata: ["url": .string(url)])
        enhanced = enrichOpenGraphFields(
            mergeOpenGraphFields(primary: microlink, fallback: enhanced),
            resolvedPageURL: url
        )
    }

    if openGraphNeedsReaderEnhancement(fields: enhanced, signals: nil, pageURL: url),
       let reader = await fetchOpenGraphViaReaderProxy(url: url, httpClient: httpClient),
       reader.hasAnyValue
    {
        ogResolverLogger.info("OG enhanced via reader proxy", metadata: ["url": .string(url)])
        enhanced = enrichOpenGraphFields(
            mergeOpenGraphFields(primary: reader, fallback: enhanced),
            resolvedPageURL: url
        )
    }

    return enhanced
}
