package gateway

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/CountableNewt/latr-link/services/go-backend/internal/auth"
	"github.com/CountableNewt/latr-link/services/go-backend/internal/bookmarks"
	"github.com/CountableNewt/latr-link/services/go-backend/internal/httpx"
	"github.com/CountableNewt/latr-link/services/go-backend/internal/metadata"
)

type fakeAuthentication func(*http.Request, bool) (auth.Context, error)

func (f fakeAuthentication) Authenticate(r *http.Request, required bool) (auth.Context, error) {
	return f(r, required)
}

type fakeTransport func(*http.Request) (*http.Response, error)

func (f fakeTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

type fakeState struct {
	previews               map[string]map[string]any
	readyErr, errorCleanup error
	cleanupCalls           int
}

func (f *fakeState) Claim(context.Context, string, time.Time) error { return nil }
func (f *fakeState) Preview(_ context.Context, s string) (map[string]any, error) {
	return f.previews[s], nil
}
func (f *fakeState) PutPreview(_ context.Context, s string, v map[string]any) error {
	if f.previews == nil {
		f.previews = map[string]map[string]any{}
	}
	f.previews[s] = v
	return nil
}
func (f *fakeState) Ready(context.Context) error   { return f.readyErr }
func (f *fakeState) Cleanup(context.Context) error { f.cleanupCalls++; return f.errorCleanup }
func jsonHTTP(code int, v any) *http.Response {
	body, _ := json.Marshal(v)
	return &http.Response{StatusCode: code, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(string(body)))}
}
func request(t *testing.T, s *Server, verb, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(verb, "https://preview.example"+path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	rr := httptest.NewRecorder()
	s.ServeHTTP(rr, req)
	return rr
}
func errorCode(t *testing.T, rr *httptest.ResponseRecorder) string {
	t.Helper()
	var out struct{ Error string }
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("not JSON: %s", rr.Body.String())
	}
	return out.Error
}
func TestRetiredRoutesNeverAuthenticate(t *testing.T) {
	calls := 0
	s := &Server{Kind: "gateway", Auth: fakeAuthentication(func(*http.Request, bool) (auth.Context, error) { calls++; return auth.Context{}, nil })}
	for _, path := range []string{"/v1/latr/developer/clients", "/xrpc/link.latr.developer.createKey", "/oauth/latrkit-client-metadata.json", "/v1/latr/saves", "/xrpc/link.latr.saved.saveUrl"} {
		rr := request(t, s, "POST", path, `{}`)
		if rr.Code != 410 && rr.Code != 404 {
			t.Errorf("%s: status %d body %s", path, rr.Code, rr.Body.String())
		}
		if rr.Header().Get("Cache-Control") != "private, no-store" {
			t.Errorf("%s missing no-store", path)
		}
	}
	if calls != 0 {
		t.Fatalf("retired endpoints authenticated %d times", calls)
	}
}
func TestXRPCRejectsMalformedInputBeforeAuthentication(t *testing.T) {
	calls := 0
	s := &Server{Kind: "gateway", Auth: fakeAuthentication(func(*http.Request, bool) (auth.Context, error) { calls++; return auth.Context{}, nil })}
	cases := []struct {
		verb, path, body string
		status           int
	}{
		{"GET", "/xrpc/link.latr.unknown", "", 404},
		{"GET", "/xrpc/link.latr.bookmarks.saveBookmark", "", 405},
		{"GET", "/xrpc/link.latr.bookmarks.listBookmarks?limit=1&limit=2", "", 400},
		{"GET", "/xrpc/link.latr.bookmarks.listBookmarks?unknown=true", "", 400},
		{"GET", "/xrpc/link.latr.bookmarks.listBookmarks?limit=101", "", 400},
		{"GET", "/xrpc/link.latr.bookmarks.listBookmarks?limit=1.2", "", 400},
		{"GET", "/xrpc/link.latr.bookmarks.listBookmarks?cursor=%zz", "", 400},
		{"GET", "/xrpc/link.latr.bookmarks.listBookmarks?cursor=a;b", "", 400},
		{"POST", "/xrpc/link.latr.bookmarks.saveBookmark", `{"subject":"https://example.com","unknown":true}`, 400},
		{"POST", "/xrpc/link.latr.bookmarks.saveBookmark?subject=https://example.com", `{"subject":"https://example.com"}`, 400},
		{"POST", "/xrpc/link.latr.bookmarks.saveBookmark", `[]`, 400},
		{"POST", "/xrpc/link.latr.bookmarks.saveBookmark", `null`, 400},
		{"POST", "/xrpc/link.latr.bookmarks.saveBookmark", `{} {}`, 400},
		{"POST", "/xrpc/link.latr.bookmarks.saveBookmark", `{"subject":true}`, 400},
		{"POST", "/xrpc/link.latr.bookmarks.setTags", `{"bookmarkUri":"at://did:plc:one/community.lexicon.bookmarks.bookmark/key","tags":[1]}`, 400},
	}
	for _, tc := range cases {
		t.Run(tc.path+tc.body, func(t *testing.T) {
			rr := request(t, s, tc.verb, tc.path, tc.body)
			if rr.Code != tc.status {
				t.Fatalf("got %d %s", rr.Code, rr.Body.String())
			}
			if tc.status == 405 && rr.Header().Get("Allow") != "POST" {
				t.Fatal("missing Allow header")
			}
			if tc.status == 404 && errorCode(t, rr) != "XrpcNotSupported" {
				t.Fatal(rr.Body.String())
			}
		})
	}
	if calls != 0 {
		t.Fatalf("malformed input authenticated %d times", calls)
	}
}
func TestJSONContentTypeAndBodyBound(t *testing.T) {
	s := &Server{Kind: "gateway"}
	for _, tc := range []struct{ media, body string }{{"text/plain", `{"subject":"https://example.com"}`}, {"", `{}`}, {"application/json", `{"subject":"` + strings.Repeat("a", 1<<20) + `"}`}} {
		req := httptest.NewRequest("POST", "https://preview.example/xrpc/link.latr.bookmarks.saveBookmark", strings.NewReader(tc.body))
		if tc.media != "" {
			req.Header.Set("Content-Type", tc.media)
		}
		rr := httptest.NewRecorder()
		s.ServeHTTP(rr, req)
		if rr.Code != 400 || errorCode(t, rr) != "InvalidRequest" {
			t.Fatalf("%d %s", rr.Code, rr.Body.String())
		}
	}
}
func TestOperationalRoutesAndCleanupSecret(t *testing.T) {
	state := &fakeState{}
	s := &Server{Kind: "gateway", State: state, CronSecret: "secret"}
	rr := request(t, s, "GET", "/health", "")
	if rr.Code != 200 {
		t.Fatal(rr.Code)
	}
	rr = request(t, s, "GET", "/ready", "")
	if rr.Code != 200 {
		t.Fatal(rr.Code)
	}
	state.readyErr = errors.New("database unavailable")
	rr = request(t, s, "GET", "/ready", "")
	if rr.Code != 503 || strings.Contains(rr.Body.String(), "database") {
		t.Fatalf("%d %s", rr.Code, rr.Body.String())
	}
	rr = request(t, s, "GET", "/internal/cleanup", "")
	if rr.Code != 401 || state.cleanupCalls != 0 {
		t.Fatalf("%d calls=%d", rr.Code, state.cleanupCalls)
	}
	req := httptest.NewRequest("GET", "https://preview.example/internal/cleanup", nil)
	req.Header.Set("Authorization", "Bearer secret")
	rr = httptest.NewRecorder()
	s.ServeHTTP(rr, req)
	if rr.Code != 200 || state.cleanupCalls != 1 {
		t.Fatalf("%d calls=%d", rr.Code, state.cleanupCalls)
	}
}
func TestAuthenticatedListsRemainViewerScoped(t *testing.T) {
	seen := []string{}
	s := &Server{Kind: "gateway", State: &fakeState{}, Auth: fakeAuthentication(func(r *http.Request, required bool) (auth.Context, error) {
		if !required {
			t.Fatal("public gateway skipped internal client policy")
		}
		return auth.Context{DID: r.Header.Get("X-Test-Viewer"), PDSEndpoint: "https://pds.example", SignatureVerified: true}, nil
	})}
	s.HTTP = &http.Client{Transport: fakeTransport(func(r *http.Request) (*http.Response, error) {
		repo := r.URL.Query().Get("repo")
		seen = append(seen, repo)
		records := []any{}
		if r.URL.Query().Get("collection") == bookmarks.Collection {
			records = append(records, map[string]any{"uri": "at://" + repo + "/" + bookmarks.Collection + "/key", "cid": "cid", "value": map[string]any{"$type": bookmarks.Collection, "subject": "https://example.com/" + repo, "createdAt": "2026-01-01T00:00:00Z"}})
		}
		return jsonHTTP(200, map[string]any{"records": records}), nil
	})}
	for _, did := range []string{"did:plc:alice", "did:plc:bob"} {
		req := httptest.NewRequest("GET", "https://preview.example/xrpc/link.latr.bookmarks.listBookmarks", nil)
		req.Header.Set("X-Test-Viewer", did)
		rr := httptest.NewRecorder()
		s.ServeHTTP(rr, req)
		if rr.Code != 200 || !strings.Contains(rr.Body.String(), "at://"+did+"/") {
			t.Fatalf("viewer %s: %d %s", did, rr.Code, rr.Body.String())
		}
		other := "did:plc:alice"
		if did == other {
			other = "did:plc:bob"
		}
		if strings.Contains(rr.Body.String(), other) {
			t.Fatal("viewer result contains another viewer")
		}
	}
	if len(seen) != 4 || seen[0] != "did:plc:alice" || seen[1] != "did:plc:alice" || seen[2] != "did:plc:bob" || seen[3] != "did:plc:bob" {
		t.Fatalf("repo calls=%v", seen)
	}
}
func TestMetadataCacheHitAvoidsNetworkAndKeepsPrivateCaching(t *testing.T) {
	subject := "https://example.com/article"
	client := &http.Client{Transport: fakeTransport(func(*http.Request) (*http.Response, error) {
		t.Fatal("cached metadata made network request")
		return nil, nil
	})}
	s := &Server{Kind: "metadata", State: &fakeState{previews: map[string]map[string]any{subject: {"title": "Cached title"}}}, HTTP: client, Metadata: metadata.New(client), Auth: fakeAuthentication(func(*http.Request, bool) (auth.Context, error) { return auth.Context{SignatureVerified: true}, nil })}
	rr := request(t, s, "GET", "/xrpc/link.latr.preview.getOpenGraph?url="+url.QueryEscape(subject), "")
	if rr.Code != 200 || !strings.Contains(rr.Body.String(), "Cached title") || rr.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatalf("%d %s", rr.Code, rr.Body.String())
	}
}
func TestUnverifiedMetadataSessionAttestsBeforeCache(t *testing.T) {
	called := false
	client := &http.Client{Transport: fakeTransport(func(req *http.Request) (*http.Response, error) {
		called = true
		if req.URL.Path != "/xrpc/com.atproto.server.getSession" {
			t.Fatalf("unexpected request %s", req.URL)
		}
		return jsonHTTP(401, map[string]any{"error": "InvalidToken"}), nil
	})}
	proof := "a." + base64.RawURLEncoding.EncodeToString([]byte(`{"htu":"https://pds.example/xrpc/com.atproto.server.getSession","htm":"GET"}`)) + ".sig"
	s := &Server{Kind: "metadata", HTTP: client, State: &fakeState{previews: map[string]map[string]any{"https://example.com": {"title": "Never return this"}}}, Auth: fakeAuthentication(func(*http.Request, bool) (auth.Context, error) {
		return auth.Context{DID: "did:plc:one", PDSEndpoint: "https://pds.example", UpstreamProofs: auth.NewProofPool(proof)}, nil
	})}
	rr := request(t, s, "GET", "/xrpc/link.latr.preview.getOpenGraph?url=https://example.com", "")
	if !called || rr.Code != 401 || strings.Contains(rr.Body.String(), "Never return") {
		t.Fatalf("called=%v status=%d body=%s", called, rr.Code, rr.Body.String())
	}
}
func TestMetadataServiceRejectsBookmarkCalls(t *testing.T) {
	calls := 0
	s := &Server{Kind: "metadata", Auth: fakeAuthentication(func(*http.Request, bool) (auth.Context, error) { calls++; return auth.Context{}, nil })}
	rr := request(t, s, "GET", "/xrpc/link.latr.bookmarks.listBookmarks", "")
	if rr.Code != 404 || calls != 0 {
		t.Fatalf("%d auth calls %d", rr.Code, calls)
	}
}
func TestAuthenticationErrorsUseXRPCNames(t *testing.T) {
	s := &Server{Kind: "gateway", Auth: fakeAuthentication(func(*http.Request, bool) (auth.Context, error) {
		return auth.Context{}, httpx.NewError(401, "missing_auth", "Missing authorization")
	})}
	rr := request(t, s, "GET", "/xrpc/link.latr.bookmarks.listBookmarks", "")
	if rr.Code != 401 || errorCode(t, rr) != "AuthRequired" {
		t.Fatalf("%d %s", rr.Code, rr.Body.String())
	}
}
func TestInternalClientsAcceptOnlyConfiguredCredentials(t *testing.T) {
	clients := ParseClients("latr-link-web=YWJjZA==;the-social-wire-web=other")
	for _, tc := range []struct{ id, key, legacy, want string }{{"latr-link-web", "YWJjZA==", "", "latr-link-web"}, {"", "", "other", "the-social-wire-web"}, {"unknown", "other", "", ""}, {"latr-link-web", "wrong", "", ""}, {"", "", "unregistered", ""}} {
		h := make(http.Header)
		h.Set("X-Latr-Client-Id", tc.id)
		h.Set("X-Latr-API-Key", tc.key)
		h.Set("X-Latr-Official-Client", tc.legacy)
		got, err := clients.ResolveClientID(context.Background(), h, true)
		if tc.want == "" {
			if err == nil {
				t.Fatalf("accepted %#v", tc)
			}
		} else if err != nil || got != tc.want {
			t.Fatalf("got=%q err=%v", got, err)
		}
	}
}

func TestProbeCountsBookmarkedRecords(t *testing.T) {
	did := "did:plc:one"
	s := &Server{Kind: "gateway", Auth: fakeAuthentication(func(*http.Request, bool) (auth.Context, error) {
		return auth.Context{DID: did, PDSEndpoint: "https://pds.example", ClientID: "latr-link-web", SignatureVerified: true}, nil
	})}
	s.HTTP = &http.Client{Transport: fakeTransport(func(r *http.Request) (*http.Response, error) {
		records := []any{}
		if r.URL.Query().Get("collection") == bookmarks.Collection {
			records = append(records, map[string]any{"uri": "at://" + did + "/" + bookmarks.Collection + "/key", "cid": "cid", "value": map[string]any{"subject": "https://example.com/article", "createdAt": "2026-01-01T00:00:00Z"}})
		}
		return jsonHTTP(200, map[string]any{"records": records}), nil
	})}
	rr := request(t, s, "GET", "/xrpc/link.latr.auth.probe", "")
	var out struct {
		SampleCount int  `json:"sampleCount"`
		OK          bool `json:"ok"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if rr.Code != 200 || !out.OK || out.SampleCount != 1 {
		t.Fatalf("%d %s", rr.Code, rr.Body.String())
	}
}
func TestProbeCannotAttestUnverifiedTokenWithoutUpstreamProof(t *testing.T) {
	s := &Server{Kind: "gateway", Auth: fakeAuthentication(func(*http.Request, bool) (auth.Context, error) {
		return auth.Context{DID: "did:plc:one", PDSEndpoint: "https://pds.example"}, nil
	}), HTTP: &http.Client{Transport: fakeTransport(func(*http.Request) (*http.Response, error) {
		t.Fatal("missing upstream proof reached PDS")
		return nil, nil
	})}}
	rr := request(t, s, "GET", "/xrpc/link.latr.auth.probe", "")
	if rr.Code != 401 {
		t.Fatalf("%d %s", rr.Code, rr.Body.String())
	}
}
