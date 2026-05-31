import Foundation

public struct FederatedSubjectClientConfig: Sendable {
    public let plcURL: String
    /// AppView bases used after DID-document discovery (deduped fallbacks).
    public let appViewBaseURLs: [String]
    /// Identity relay used before PDS/identity endpoints from DID documents.
    public let identityBaseURL: String

    public init(
        plcURL: String,
        appViewBaseURLs: [String] = [FederatedSubjectClient.defaultAppViewBaseURL],
        identityBaseURL: String = FederatedSubjectClient.defaultIdentityBaseURL
    ) {
        self.plcURL = plcURL
        self.appViewBaseURLs = appViewBaseURLs
        self.identityBaseURL = identityBaseURL
    }
}
