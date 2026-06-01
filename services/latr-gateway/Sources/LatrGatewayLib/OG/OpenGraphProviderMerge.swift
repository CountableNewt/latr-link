import Foundation

public func openGraphQualityScore(_ fields: OpenGraphFields, pageURL: String) -> Int {
    var score = 0
    if fields.image?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false {
        score += 4
    }
    if !isWeakOpenGraphTitle(fields.title, siteName: fields.siteName, pageURL: pageURL) {
        score += 3
    }
    if fields.description?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false {
        score += 1
    }
    if fields.author?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false {
        score += 1
    }
    return score
}

public func bestOpenGraphFields(candidates: [OpenGraphFields], pageURL: String) -> OpenGraphFields {
    candidates.max {
        openGraphQualityScore($0, pageURL: pageURL) < openGraphQualityScore($1, pageURL: pageURL)
    } ?? OpenGraphFields()
}

public func sanitizeRemoteOpenGraphFields(_ fields: OpenGraphFields, pageURL: String) -> OpenGraphFields? {
    guard fields.hasAnyValue else { return nil }
    let score = openGraphQualityScore(fields, pageURL: pageURL)
    guard score > 0 else { return nil }
    return fields
}
