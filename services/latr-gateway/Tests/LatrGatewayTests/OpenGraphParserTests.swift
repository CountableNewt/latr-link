import Foundation
import Testing

@testable import LatrGatewayLib

@Suite("HtmlTextDecoder")
struct HtmlTextDecoderTests {
    @Test("decodes named, decimal, hex, and unicode escapes")
    func decodesCommonEscapes() {
        #expect(HtmlTextDecoder.decode("It&apos;s fine") == "It's fine")
        #expect(HtmlTextDecoder.decode("Don&#39;t stop") == "Don't stop")
        #expect(HtmlTextDecoder.decode("Don&#039;t stop") == "Don't stop")
        #expect(HtmlTextDecoder.decode("Don&#x27;t stop") == "Don't stop")
        #expect(HtmlTextDecoder.decode("Say \\u0027hello\\u0027") == "Say 'hello'")
    }

    @Test("decodes double-encoded entities")
    func decodesDoubleEncoded() {
        #expect(HtmlTextDecoder.decode("Tom&amp;#39;s") == "Tom's")
    }

    @Test("preserves unknown entities")
    func preservesUnknown() {
        #expect(HtmlTextDecoder.decode("&unknown; entity") == "&unknown; entity")
    }
}

@Suite("OpenGraphParser")
struct OpenGraphParserTests {
    @Test("decodes apostrophe entities in metadata")
    func decodesApostropheEntities() {
        let html = """
        <head>
          <meta property="og:title" content="Tom&amp;#39;s Guide"/>
          <meta property="og:description" content="It&apos;s \\u0027great\\u0027"/>
        </head>
        """

        let parsed = parseOpenGraphMarkup(html: html, resolvedPageURL: "https://news.example/item")
        #expect(parsed.title == "Tom's Guide")
        #expect(parsed.description == "It's 'great'")
    }

    @Test("reads og author and twitter creator fallbacks")
    func readsAuthorFallbacks() {
        let html = """
        <head>
          <meta property="article:author" content="https://facebook.com/pages/example"/>
          <meta name="twitter:creator" content="@ada"/>
        </head>
        """

        let parsed = parseOpenGraphMarkup(html: html, resolvedPageURL: "https://news.example/item")
        #expect(parsed.author == "@ada")
    }

    @Test("reads secure image and JSON-LD author")
    func readsExtendedMetadata() {
        let html = """
        <head>
          <meta property="og:image:secure_url" content="https://cdn.example/secure.png"/>
          <script type="application/ld+json">
            {"@type":"Article","author":{"@type":"Person","name":"Grace Hopper"}}
          </script>
        </head>
        """

        let parsed = parseOpenGraphMarkup(html: html, resolvedPageURL: "https://news.example/item")
        #expect(parsed.image == "https://cdn.example/secure.png")
        #expect(parsed.author == "Grace Hopper")
    }

    @Test("reads GitHub-style twitter card metadata")
    func readsGitHubStyleMetadata() {
        let html = """
        <head>
          <meta property="og:title" content="GitHub - Stygian-Tech/latr-link: Read Later for the ATmosphere"/>
          <meta property="og:image" content="https://opengraph.githubassets.com/66390003499b2bd4089870fd52bb97da2415d3367d7bf850698cda3035bfb8c9/Stygian-Tech/latr-link"/>
          <meta name="twitter:title" content="GitHub - Stygian-Tech/latr-link: Read Later for the ATmosphere"/>
          <meta name="twitter:image" content="https://opengraph.githubassets.com/66390003499b2bd4089870fd52bb97da2415d3367d7bf850698cda3035bfb8c9/Stygian-Tech/latr-link"/>
          <title>GitHub - Stygian-Tech/latr-link: Read Later for the ATmosphere · GitHub</title>
        </head>
        """

        let parsed = parseOpenGraphMarkup(html: html, resolvedPageURL: "https://github.com/Stygian-Tech/latr-link")
        #expect(parsed.title == "GitHub - Stygian-Tech/latr-link: Read Later for the ATmosphere")
        #expect(parsed.image?.contains("opengraph.githubassets.com") == true)
    }

    @Test("resolves relative og:image against final page URL")
    func resolvesRelativeImage() {
        let html = """
        <head>
          <meta property="og:title" content="NFTrig"/>
          <meta property="og:image" content="/static/browse/0.3.4/images/arxiv-logo-fb.png"/>
        </head>
        """

        let parsed = parseOpenGraphMarkup(html: html, resolvedPageURL: "https://arxiv.org/abs/2301.00001")
        #expect(parsed.title == "NFTrig")
        #expect(parsed.image == "https://arxiv.org/static/browse/0.3.4/images/arxiv-logo-fb.png")
    }

    @Test("reads JSON-LD headline and image fallbacks")
    func readsJsonLdHeadlineAndImage() {
        let html = """
        <head>
          <script type="application/ld+json">
            {"@type":"Article","headline":"JSON-LD Headline","image":"https://cdn.example/article.png"}
          </script>
        </head>
        """

        let parsed = parseOpenGraphMarkup(html: html, resolvedPageURL: "https://news.example/item")
        #expect(parsed.title == "JSON-LD Headline")
        #expect(parsed.image == "https://cdn.example/article.png")
    }
}
