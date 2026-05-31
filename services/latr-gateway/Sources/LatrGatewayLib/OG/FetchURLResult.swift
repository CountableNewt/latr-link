import AsyncHTTPClient
import Foundation

public enum FetchURLResult: Sendable {
    case success(text: String, finalURL: String)
    case failure(reason: String)
}
