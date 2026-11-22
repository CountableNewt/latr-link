package metadata

import (
	"context"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type roundTrip func(*http.Request) (*http.Response, error)

func (f roundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func response(code int, body string) *http.Response {
	return &http.Response{StatusCode: code, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}
}
func TestParseMetadataParity(t *testing.T) {
	cases := []struct {
		name, markup string
		want         Fields
	}{
		{"entities", `<head><meta property="og:title" content="Tom&amp;#39;s Guide"><meta property="og:description" content="It&apos;s \u0027great\u0027"></head>`, Fields{Title: "Tom's Guide", Description: "It's 'great'"}},
		{"authorFallback", `<head><meta property="article:author" content="https://facebook.com/pages/example"><meta name="twitter:creator" content="@ada"></head>`, Fields{Author: "@ada"}},
		{"jsonLD", `<head><script type="application/ld+json">{"@type":"Article","headline":"JSON-LD Headline","image":{"url":"/hero.png"},"author":{"name":"Grace Hopper"}}</script></head>`, Fields{Title: "JSON-LD Headline", Image: "https://news.example/hero.png", Author: "Grace Hopper"}},
		{"relative", `<head><meta property="og:title" content="NFTrig"><meta property="og:image" content="/static/logo.png"></head>`, Fields{Title: "NFTrig", Image: "https://news.example/static/logo.png"}},
		{"attributeSyntax", `<head><meta content='A > B &amp; C' property=og:title><meta NAME=twitter:image CONTENT=/hero.png></head>`, Fields{Title: "A > B & C", Image: "https://news.example/hero.png"}},
		{"imageScheme", `<head><meta property="og:image" content="javascript:alert(1)"></head>`, Fields{}},
		{"headPrecedence", `<head><meta property="og:title" content="Head"></head><body><meta property="og:title" content="Body"><meta property="og:image" content="/body.png"></body>`, Fields{Title: "Head", Image: "https://news.example/body.png"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := Parse(tc.markup, "https://news.example/item")
			if got != tc.want {
				t.Fatalf("got %#v want %#v", got, tc.want)
			}
		})
	}
}
func TestExtractAtURIPrefersNativeInHead(t *testing.T) {
	raw := `<head><link href="at://did:plc:one/link.latr.saved.external/key"><meta content="at://did:plc:one/site.standard.document/key"></head><body><meta content="at://did:plc:body/app.bsky.feed.post/key"></body>`
	if got := ExtractAtURI(raw); got != "at://did:plc:one/site.standard.document/key" {
		t.Fatal(got)
	}
}
func TestValidateURLBlocksPrivateDestinations(t *testing.T) {
	for _, raw := range []string{"http://localhost", "http://localhost.", "http://a.local", "http://10.1.2.3", "http://127.0.0.1", "http://[::ffff:127.0.0.1]", "http://[fd13::1]", "http://[fe80::1]", "http://169.254.169.254", "http://100.64.0.1", "http://2130706433", "http://127.1", "ftp://example.com", "https://user:password@example.com"} {
		t.Run(raw, func(t *testing.T) {
			if ValidateURL(raw) == nil {
				t.Fatal("accepted unsafe URL")
			}
		})
	}
	for _, raw := range []string{"https://example.com/article", "http://8.8.8.8/", "https://[2606:4700:4700::1111]/"} {
		if err := ValidateURL(raw); err != nil {
			t.Fatalf("%s: %v", raw, err)
		}
	}
}
func TestFetchRevalidatesRedirect(t *testing.T) {
	calls := 0
	r := New(&http.Client{Transport: roundTrip(func(req *http.Request) (*http.Response, error) {
		calls++
		resp := response(302, "")
		resp.Header.Set("Location", "http://169.254.169.254/latest/meta-data")
		resp.Request = req
		return resp, nil
	})})
	_, _, err := r.fetch(context.Background(), "https://example.com/", "text/html", 100)
	if err == nil || err.Error() != "blocked_redirect" || calls != 1 {
		t.Fatalf("calls=%d err=%v", calls, err)
	}
}
func TestFetchBodyLimitAndHeaders(t *testing.T) {
	r := New(&http.Client{Transport: roundTrip(func(req *http.Request) (*http.Response, error) {
		if req.Header.Get("Authorization") != "" || req.Header.Get("DPoP") != "" {
			t.Fatal("viewer credentials leaked")
		}
		if req.Header.Get("User-Agent") == "" {
			t.Fatal("missing UA")
		}
		return response(200, strings.Repeat("a", 200)), nil
	})})
	body, _, err := r.fetch(context.Background(), "https://example.com/", "text/html", 100)
	if err != nil || len(body) != 100 {
		t.Fatalf("body=%d err=%v", len(body), err)
	}
}
func TestResolverDirectCardAvoidsFallbackCalls(t *testing.T) {
	calls := 0
	r := New(&http.Client{Transport: roundTrip(func(req *http.Request) (*http.Response, error) {
		calls++
		return response(200, `<head><meta property="og:title" content="An actual article"><meta property="og:image" content="/hero.jpg"><meta property="og:description" content="Description"></head>`), nil
	})})
	fields, err := r.OpenGraph(context.Background(), "https://example.com/story")
	if err != nil || fields.Title != "An actual article" || calls != 1 {
		t.Fatalf("%#v calls=%d err=%v", fields, calls, err)
	}
}
func TestFallbackProviderSelectsStrongCard(t *testing.T) {
	r := New(&http.Client{Transport: roundTrip(func(req *http.Request) (*http.Response, error) {
		switch req.URL.Hostname() {
		case "example.com":
			return response(200, `<title>Home</title>`), nil
		case "api.microlink.io":
			return response(200, `{"status":"success","data":{"title":"A substantial article","image":{"url":"https://cdn.example/hero.png"},"author":"Ada"}}`), nil
		default:
			return response(503, ""), nil
		}
	})})
	fields, err := r.OpenGraph(context.Background(), "https://example.com/story")
	if err != nil || fields.Title != "A substantial article" || fields.Author != "Ada" || fields.Image != "https://cdn.example/hero.png" {
		t.Fatalf("%#v err=%v", fields, err)
	}
}
func TestGoldenProviderFixtures(t *testing.T) {
	cases := []struct {
		file, url, title, image string
		microlink               bool
	}{
		{"verge-939026-microlink.json", "https://www.theverge.com/column/939026/user-replaceable-batteries-eu-european-union-legislation", "User-replaceable batteries are coming back in a big way", "https://platform.theverge.com/wp-content/uploads/", true},
		{"verge-940524-microlink.json", "https://www.theverge.com/tech/940524/amd", "AMD’s new pitch: our old tech is so good you should just keep using it", "https://platform.theverge.com/wp-content/uploads/", true},
		{"verge-937620-microlink.json", "https://www.theverge.com/features/937620/games", "Roids were all the rage at the Enhanced Games", "https://platform.theverge.com/wp-content/uploads/", true},
		{"nyt-20260531-cardyb.json", "https://www.nytimes.com/2026/05/31/article", "Trump Hits the Stalemate Phase", "https://cardyb.bsky.app/v1/image", false},
		{"macstories-remctl-cardyb.json", "https://www.macstories.net/stories/introducing-remctl", "Introducing RemCTL", "https://cardyb.bsky.app/v1/image", false},
		{"cnn-20260531-cardyb.json", "https://www.cnn.com/2026/05/31/article", "Iran’s reopened underground missile sites", "https://cardyb.bsky.app/v1/image", false},
	}
	for _, tc := range cases {
		t.Run(tc.file, func(t *testing.T) {
			body, err := os.ReadFile(filepath.Join("testdata", tc.file))
			if err != nil {
				t.Fatal(err)
			}
			var fields Fields
			if tc.microlink {
				fields = ParseMicrolink(body, tc.url)
			} else {
				fields = ParseCardyb(body, tc.url)
			}
			if !strings.HasPrefix(fields.Title, tc.title) || !strings.HasPrefix(fields.Image, tc.image) {
				t.Fatalf("%#v", fields)
			}
		})
	}
}
func TestReaderSkipsDecorativeImage(t *testing.T) {
	body := []byte("Title: Article\nDescription: Desc\nMarkdown Content:\n![Logo](https://cdn.example/logo.png)\n![Hero](https://cdn.example/story.jpg)")
	got := ParseReader(body, "https://example.com/story")
	if got.Title != "Article" || got.Image != "https://cdn.example/story.jpg" {
		t.Fatalf("%#v", got)
	}
}
func TestResolveBskyHandleAndHead(t *testing.T) {
	r := New(&http.Client{Transport: roundTrip(func(req *http.Request) (*http.Response, error) {
		if req.URL.Path == "/xrpc/com.atproto.identity.resolveHandle" {
			return response(200, `{"did":"did:plc:ada"}`), nil
		}
		return response(200, `<head><link rel="alternate" href="at://did:plc:writer/site.standard.document/article"></head>`), nil
	})})
	got, err := r.Resolve(context.Background(), "https://bsky.app/profile/ada.test/post/123")
	if err != nil || got.SubjectURI != "at://did:plc:ada/app.bsky.feed.post/123" {
		t.Fatalf("%#v %v", got, err)
	}
	got, err = r.Resolve(context.Background(), "https://example.com/article")
	if err != nil || got.SubjectURI != "at://did:plc:writer/site.standard.document/article" {
		t.Fatalf("%#v %v", got, err)
	}
}

func TestSubjectUsesDiscoveredAppViewBeforeFallback(t *testing.T) {
	calls := []string{}
	r := New(&http.Client{Transport: roundTrip(func(req *http.Request) (*http.Response, error) {
		calls = append(calls, req.URL.Hostname())
		switch req.URL.Hostname() {
		case "plc.directory":
			return response(200, `{"id":"did:plc:writer","service":[{"id":"#bsky_appview","type":"CustomAppView","serviceEndpoint":"https://appview.example"},{"type":"AtprotoPersonalDataServer","serviceEndpoint":"https://pds.example"}]}`), nil
		case "appview.example":
			return response(200, `{"posts":[{"record":{"text":"A post"},"author":{"handle":"writer.test"},"embed":{"images":[{"fullsize":"https://cdn.example/photo.jpg"}]}}]}`), nil
		default:
			t.Fatalf("unexpected host %s", req.URL.Hostname())
			return nil, nil
		}
	})})
	got, err := r.Subject(context.Background(), "at://did:plc:writer/app.bsky.feed.post/key")
	want := Fields{Title: "A post", Author: "@writer.test", SiteName: "writer.test", Image: "https://cdn.example/photo.jpg"}
	if err != nil || got != want {
		t.Fatalf("got %#v err=%v", got, err)
	}
	if len(calls) != 2 || calls[1] != "appview.example" {
		t.Fatalf("calls=%v", calls)
	}
}
func TestSubjectPDSExternalAndGenericParity(t *testing.T) {
	r := New(&http.Client{Transport: roundTrip(func(req *http.Request) (*http.Response, error) {
		if req.URL.Hostname() == "plc.directory" {
			return response(200, `{"id":"did:plc:writer","service":[{"type":"AtprotoPersonalDataServer","serviceEndpoint":"https://pds.example"}]}`), nil
		}
		if req.URL.Query().Get("collection") == "link.latr.saved.external" {
			return response(200, `{"value":{"title":"Article","excerpt":"Excerpt","image":"https://cdn.example/photo.jpg","site":"Publisher","author":"Ada"}}`), nil
		}
		return response(200, `{"value":{"title":"Document","description":"Ignored","image":{"ref":{"$link":"blob"}}}}`), nil
	})})
	got, err := r.Subject(context.Background(), "at://did:plc:writer/link.latr.saved.external/key")
	want := Fields{Title: "Article", Description: "Excerpt", Image: "https://cdn.example/photo.jpg", SiteName: "Publisher", Author: "Ada"}
	if err != nil || got != want {
		t.Fatalf("%#v %v", got, err)
	}
	got, err = r.Subject(context.Background(), "at://did:plc:writer/site.standard.document/key")
	if err != nil || got != (Fields{Title: "Document"}) {
		t.Fatalf("%#v %v", got, err)
	}
}
func TestProviderWorkRespectsCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	r := New(&http.Client{Transport: roundTrip(func(req *http.Request) (*http.Response, error) { return nil, req.Context().Err() })})
	_, err := r.OpenGraph(ctx, "https://example.com/story")
	if err != nil {
		t.Fatal(err)
	}
}
