import Foundation
import LatrGatewayLib
import Testing

@Suite("Save body decoding")
struct SaveBodyTests {
    @Test("Subject save requires subjectUri")
    func subjectSaveRequiresSubjectUri() {
        let data = Data(#"{"kind":"subject"}"#.utf8)
        #expect(throws: GatewayError.self) {
            try JSONDecoder().decode(SaveBody.self, from: data)
        }
    }

    @Test("URL save requires url")
    func urlSaveRequiresUrl() {
        let data = Data(#"{"kind":"url"}"#.utf8)
        #expect(throws: GatewayError.self) {
            try JSONDecoder().decode(SaveBody.self, from: data)
        }
    }

    @Test("Decodes subject save with linked web url")
    func decodesSubjectSave() throws {
        let data = Data(
            #"{"kind":"subject","subjectUri":"at://did:plc:abc/app.bsky.feed.post/rkey","linkedWebUrl":"https://example.com"}"#
                .utf8
        )
        let body = try JSONDecoder().decode(SaveBody.self, from: data)
        guard case let .subject(subjectUri, linkedWebUrl) = body else {
            Issue.record("Expected subject save body")
            return
        }
        #expect(subjectUri == "at://did:plc:abc/app.bsky.feed.post/rkey")
        #expect(linkedWebUrl == "https://example.com")
    }
}
