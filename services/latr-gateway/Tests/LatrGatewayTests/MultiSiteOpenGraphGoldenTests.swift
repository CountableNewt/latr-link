import Foundation
import LatrGatewayLib
import Testing

@Suite("Multi-site OpenGraph golden vectors")
struct MultiSiteOpenGraphGoldenTests {
    private struct CaseSpec {
        let fixtureName: String
        let sourceURL: String
        let expectedTitlePrefix: String
        let expectedImagePrefix: String
    }

    private let cardybCases: [CaseSpec] = [
        CaseSpec(
            fixtureName: "nyt-20260531-cardyb",
            sourceURL: "https://www.nytimes.com/2026/05/31/us/politics/trump-iran-stalemate-ukraine-gaza.html",
            expectedTitlePrefix: "Trump Hits the Stalemate Phase",
            expectedImagePrefix: "https://cardyb.bsky.app/v1/image"
        ),
        CaseSpec(
            fixtureName: "macstories-remctl-cardyb",
            sourceURL: "https://www.macstories.net/stories/introducing-remctl-the-power-user-reminders-cli-for-macos-and-ai-agents/",
            expectedTitlePrefix: "Introducing RemCTL",
            expectedImagePrefix: "https://cardyb.bsky.app/v1/image"
        ),
        CaseSpec(
            fixtureName: "cnn-20260531-cardyb",
            sourceURL: "https://www.cnn.com/2026/05/31/us/iran-tunnels-reopened-us-strategy-bombing-invs",
            expectedTitlePrefix: "Iran’s reopened underground missile sites",
            expectedImagePrefix: "https://cardyb.bsky.app/v1/image"
        ),
    ]

    @Test("cardyb fixtures expose article title and hero image")
    func cardybFixtures() throws {
        for spec in cardybCases {
            let json = try loadFixture(named: spec.fixtureName)
            let parsed = try #require(parseCardybResponse(json, sourceURL: spec.sourceURL))
            #expect(parsed.title?.hasPrefix(spec.expectedTitlePrefix) == true)
            #expect(parsed.image?.hasPrefix(spec.expectedImagePrefix) == true)
        }
    }

    @Test("best provider merge prefers cardyb over weak direct parse")
    func mergeProviders() {
        let url = "https://www.nytimes.com/2026/05/31/us/politics/trump-iran-stalemate-ukraine-gaza.html"
        let weak = OpenGraphFields(title: "nytimes.com", siteName: "nytimes.com")
        let strong = OpenGraphFields(
            title: "Trump Hits the Stalemate Phase of His International Interventions, and It Stings",
            image: "https://cardyb.bsky.app/v1/image?url=https%3A%2F%2Fstatic01.nyt.com%2Fimages%2Fexample.jpg",
            siteName: "nytimes.com"
        )
        let best = bestOpenGraphFields(candidates: [weak, strong], pageURL: url)
        #expect(best.title == strong.title)
        #expect(best.image == strong.image)
    }

    private func loadFixture(named name: String) throws -> String {
        var url = URL(fileURLWithPath: #filePath)
        url.deleteLastPathComponent()
        url.append(path: "Fixtures/\(name).json")
        return try String(contentsOf: url, encoding: .utf8)
    }
}
