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
}
