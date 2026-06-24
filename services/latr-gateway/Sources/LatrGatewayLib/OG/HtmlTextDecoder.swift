import Foundation

enum HtmlTextDecoder {
    private static let namedEntities: [String: String] = [
        "quot": "\"",
        "apos": "'",
        "lt": "<",
        "gt": ">",
        "amp": "&",
        "nbsp": "\u{00a0}",
        "rsquo": "\u{2019}",
        "lsquo": "\u{2018}",
        "rdquo": "\u{201d}",
        "ldquo": "\u{201c}",
        "hellip": "\u{2026}",
    ]

    static func decode(_ string: String, maxPasses: Int = 3) -> String {
        var previous = ""
        var current = string
        var passes = 0
        while current != previous, passes < maxPasses {
            previous = current
            current = decodeOnce(current)
            passes += 1
        }
        return current
    }

    private static func decodeOnce(_ string: String) -> String {
        var result = decodeUnicodeEscapes(string)
        result = decodeDecimalEntities(result)
        result = decodeHexEntities(result)
        result = decodeNamedEntities(result)
        return result
    }

    private static func decodeUnicodeEscapes(_ string: String) -> String {
        guard let regex = try? NSRegularExpression(pattern: #"\\u([0-9a-fA-F]{4})"#) else {
            return string
        }
        return replaceMatches(in: string, regex: regex) { match, source in
            guard let hexRange = Range(match.range(at: 1), in: source) else { return nil }
            let hex = String(source[hexRange])
            guard let code = Int(hex, radix: 16),
                  let scalar = Unicode.Scalar(code)
            else { return nil }
            return String(scalar)
        }
    }

    private static func decodeDecimalEntities(_ string: String) -> String {
        guard let regex = try? NSRegularExpression(pattern: #"&#(\d+);"#) else {
            return string
        }
        return replaceMatches(in: string, regex: regex) { match, source in
            guard let codeRange = Range(match.range(at: 1), in: source) else { return nil }
            let codeString = String(source[codeRange])
            guard let code = Int(codeString),
                  let scalar = Unicode.Scalar(code)
            else { return nil }
            return String(scalar)
        }
    }

    private static func decodeHexEntities(_ string: String) -> String {
        guard let regex = try? NSRegularExpression(pattern: #"&#x([0-9a-fA-F]+);"#,
                                                   options: [.caseInsensitive])
        else {
            return string
        }
        return replaceMatches(in: string, regex: regex) { match, source in
            guard let hexRange = Range(match.range(at: 1), in: source) else { return nil }
            let hex = String(source[hexRange])
            guard let code = Int(hex, radix: 16),
                  let scalar = Unicode.Scalar(code)
            else { return nil }
            return String(scalar)
        }
    }

    private static func decodeNamedEntities(_ string: String) -> String {
        guard let regex = try? NSRegularExpression(pattern: #"&([a-z]+);"#,
                                                   options: [.caseInsensitive])
        else {
            return string
        }
        return replaceMatches(in: string, regex: regex) { match, source in
            guard let nameRange = Range(match.range(at: 1), in: source) else { return nil }
            let name = String(source[nameRange]).lowercased()
            return namedEntities[name]
        }
    }

    private static func replaceMatches(
        in string: String,
        regex: NSRegularExpression,
        transform: (NSTextCheckingResult, String) -> String?
    ) -> String {
        let range = NSRange(string.startIndex..., in: string)
        let matches = regex.matches(in: string, range: range).reversed()
        var result = string
        for match in matches {
            guard let matchRange = Range(match.range, in: result),
                  let replacement = transform(match, result)
            else { continue }
            result.replaceSubrange(matchRange, with: replacement)
        }
        return result
    }
}
