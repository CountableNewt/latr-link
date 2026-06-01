import Foundation
import LatrGatewayLib
import Testing

@Suite("Verge OpenGraph golden vectors")
struct VergeOpenGraphGoldenTests {
    private struct CaseSpec {
        let fixtureName: String
        let sourceURL: String
        let expectedTitle: String
        let expectedImagePrefix: String
    }

    private let cases: [CaseSpec] = [
        CaseSpec(
            fixtureName: "verge-939026-microlink",
            sourceURL: "https://www.theverge.com/column/939026/user-replaceable-batteries-eu-european-union-legislation",
            expectedTitle: "User-replaceable batteries are coming back in a big way",
            expectedImagePrefix: "https://platform.theverge.com/wp-content/uploads/"
        ),
        CaseSpec(
            fixtureName: "verge-940524-microlink",
            sourceURL: "https://www.theverge.com/tech/940524/amd-computex-am5-promise-2029-rx9070gre-7700x3d-5800x3d",
            expectedTitle: "AMD’s new pitch: our old tech is so good you should just keep using it",
            expectedImagePrefix: "https://platform.theverge.com/wp-content/uploads/"
        ),
        CaseSpec(
            fixtureName: "verge-937620-microlink",
            sourceURL: "https://www.theverge.com/features/937620/enhanced-games-performance-enhancing-drugs-science-health-sports",
            expectedTitle: "Roids were all the rage at the Enhanced Games",
            expectedImagePrefix: "https://platform.theverge.com/wp-content/uploads/"
        ),
    ]

    @Test("microlink fixtures expose article title and hero image")
    func microlinkFixtures() throws {
        for spec in cases {
            let json = try loadFixture(named: spec.fixtureName)
            let parsed = try #require(parseMicrolinkResponse(json, sourceURL: spec.sourceURL))
            #expect(parsed.title == spec.expectedTitle)
            #expect(parsed.image?.hasPrefix(spec.expectedImagePrefix) == true)
        }
    }

    @Test("slug-derived titles are treated as weak")
    func slugTitlesAreWeak() {
        let url = "https://www.theverge.com/column/939026/user-replaceable-batteries-eu-european-union-legislation"
        #expect(
            isWeakOpenGraphTitle(
                "User Replaceable Batteries Eu European Union Legislation",
                siteName: "The Verge",
                pageURL: url
            )
        )
    }

    private func loadFixture(named name: String) throws -> String {
        var url = URL(fileURLWithPath: #filePath)
        url.deleteLastPathComponent()
        url.append(path: "Fixtures/\(name).json")
        return try String(contentsOf: url, encoding: .utf8)
    }
}
