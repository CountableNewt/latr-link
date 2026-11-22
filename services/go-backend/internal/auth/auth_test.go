package auth

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func jwt(t *testing.T, k *ecdsa.PrivateKey, h, c any) string {
	t.Helper()
	hb, _ := json.Marshal(h)
	cb, _ := json.Marshal(c)
	input := base64.RawURLEncoding.EncodeToString(hb) + "." + base64.RawURLEncoding.EncodeToString(cb)
	hash := sha256.Sum256([]byte(input))
	r, s, e := ecdsa.Sign(rand.Reader, k, hash[:])
	if e != nil {
		t.Fatal(e)
	}
	sig := make([]byte, 64)
	r.FillBytes(sig[:32])
	s.FillBytes(sig[32:])
	return input + "." + base64.RawURLEncoding.EncodeToString(sig)
}

type transport func(*http.Request) (*http.Response, error)

func (f transport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

type replay struct{ seen map[string]bool }

func (r *replay) Claim(_ context.Context, k string, _ time.Time) error {
	if r.seen[k] {
		return unauthorized("replay", "replay")
	}
	r.seen[k] = true
	return nil
}
func TestAuthenticateSignatureReplayAndBinding(t *testing.T) {
	k, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	enc := func(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }
	j := jwk{Kty: "EC", Crv: "P-256", X: enc(k.X.FillBytes(make([]byte, 32))), Y: enc(k.Y.FillBytes(make([]byte, 32)))}
	now := time.Now()
	issuedAt := now.Unix()
	token := jwt(t, k, map[string]any{"alg": "ES256"}, map[string]any{"sub": "did:plc:test", "iss": "https://issuer.test", "exp": now.Unix() + 600, "cnf": map[string]string{"jkt": thumbprint(j)}})
	hash := sha256.Sum256([]byte(token))
	makeProof := func(htu string) string {
		return jwt(t, k, map[string]any{"alg": "ES256", "typ": "dpop+jwt", "jwk": j}, map[string]any{"htm": "GET", "htu": htu, "iat": issuedAt, "jti": "unique", "ath": enc(hash[:])})
	}
	allowedIssuer := "https://issuer.test"
	client := &http.Client{Transport: transport(func(r *http.Request) (*http.Response, error) {
		var body string
		switch r.URL.Path {
		case "/.well-known/oauth-authorization-server":
			body = `{"issuer":"https://issuer.test","jwks_uri":"https://issuer.test/keys"}`
		case "/.well-known/oauth-protected-resource":
			body = `{"resource":"https://pds.test","authorization_servers":["` + allowedIssuer + `"]}`
		case "/keys":
			b, _ := json.Marshal(map[string]any{"keys": []jwk{j}})
			body = string(b)
		default:
			body = `{"id":"did:plc:test","service":[{"id":"#other","serviceEndpoint":{"uri":"https://other.test"}},{"id":"#atproto_pds","serviceEndpoint":"https://pds.test"}]}`
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body))}, nil
	})}
	a := Authenticator{HTTPClient: client, Replay: &replay{map[string]bool{}}, Now: func() time.Time { return now }}
	r := httptest.NewRequest("GET", "https://gateway.test/xrpc/list", nil)
	r.Header.Set("Authorization", "DPoP "+token)
	r.Header.Set("DPoP", makeProof("https://gateway.test/xrpc/list"))
	got, e := a.Authenticate(r, false)
	if e != nil || got.DID != "did:plc:test" || !got.SignatureVerified || got.PDSEndpoint != "https://pds.test" {
		t.Fatalf("auth: %+v %v", got, e)
	}
	if _, e = a.Authenticate(r, false); e == nil {
		t.Fatal("replay accepted")
	}
	allowedIssuer = "https://legitimate-other-issuer.test"
	a.Replay = &replay{map[string]bool{}}
	if _, e = a.Authenticate(r, false); e == nil {
		t.Fatal("issuer not authorized by PDS accepted")
	}
	allowedIssuer = "https://issuer.test"
	issuedAt = now.Unix() - 300
	a.Replay = replayFunc(func(_ context.Context, _ string, expires time.Time) error {
		if expires.Unix() <= now.Unix() {
			t.Fatal("accepted proof expires immediately")
		}
		return nil
	})
	r.Header.Set("DPoP", makeProof("https://gateway.test/xrpc/list"))
	if _, e = a.Authenticate(r, false); e != nil {
		t.Fatal(e)
	}
	r.Header.Set("DPoP", makeProof("https://other.test/xrpc/list"))
	if _, e = a.Authenticate(r, false); e == nil {
		t.Fatal("wrong URL accepted")
	}
	for _, tc := range []struct{ name, header, value, target string }{
		{"original URL changes route", "X-Original-URL", "https://gateway.test/xrpc/other", "https://gateway.test/xrpc/other"},
		{"original URI changes route", "X-Original-URI", "/xrpc/other", "https://gateway.test/xrpc/other"},
		{"forwarded URI changes route", "X-Forwarded-URI", "/xrpc/other", "https://gateway.test/xrpc/other"},
		{"rewrite URL changes route", "X-Rewrite-URL", "https://gateway.test/xrpc/other", "https://gateway.test/xrpc/other"},
		{"forwarded host changes origin", "X-Forwarded-Host", "spoof.test", "https://spoof.test/xrpc/list"},
		{"forwarded host fabricates proxy", "X-Forwarded-Host", "spoof.test", "https://spoof.test/api/latr-gateway/xrpc/list"},
		{"forwarded scheme changes origin", "X-Forwarded-Proto", "http", "http://gateway.test/xrpc/list"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r.Header.Set(tc.header, tc.value)
			r.Header.Set("DPoP", makeProof(tc.target))
			if _, err := a.Authenticate(r, false); err == nil {
				t.Fatal("unsigned header authorized a different DPoP target")
			}
			r.Header.Del(tc.header)
		})
	}
	r.Host = "internal.binding.vercel"
	external := "https://branch-preview.vercel.app/api/latr-gateway/xrpc/list"
	r.Header.Set("DPoP", makeProof(external))
	a.ProxyKey = "proxy-secret"
	signProxyURL(r, a.ProxyKey, external)
	if _, e = a.Authenticate(r, false); e != nil {
		t.Fatalf("signed original proxy URL rejected: %v", e)
	}
	r.Header.Set("X-Latr-Proxy-Signature", strings.Repeat("0", 64))
	if _, e = a.Authenticate(r, false); e == nil {
		t.Fatal("forged original proxy URL accepted")
	}

}
func TestProofPoolConsumesMatchingProofOnlyOnce(t *testing.T) {
	raw := func(verb, path string) string {
		b, _ := json.Marshal(map[string]string{"htm": verb, "htu": path})
		return "h." + base64.RawURLEncoding.EncodeToString(b) + ".s"
	}
	one := raw("GET", "https://pds.test/xrpc/list?cursor=a")
	two := raw("POST", "https://pds.test/xrpc/write")
	p := NewProofPool(one + "," + two)
	if _, ok := p.Consume("write", "GET", "https://pds.test"); ok {
		t.Fatal("wrong method matched")
	}
	if got, ok := p.Consume("list", "GET", "https://pds.test"); !ok || got != one {
		t.Fatal("matching failed")
	}
	if _, ok := p.Consume("list", "GET", "https://pds.test"); ok {
		t.Fatal("proof reused")
	}
	if _, ok := p.Consume("write", "POST", "https://pds.test"); !ok {
		t.Fatal("other proof lost")
	}
}

type replayFunc func(context.Context, string, time.Time) error

func (f replayFunc) Claim(c context.Context, k string, e time.Time) error { return f(c, k, e) }

func signProxyURL(r *http.Request, key, raw string) {
	r.Header.Set("X-Latr-Proxy-URL", raw)
	mac := hmac.New(sha256.New, []byte(key))
	_, _ = mac.Write([]byte(r.Method + "\n" + raw))
	r.Header.Set("X-Latr-Proxy-Signature", hex.EncodeToString(mac.Sum(nil)))
}
func TestSignedProxyURLBindsRouteMethodAndSecret(t *testing.T) {
	for _, tc := range []struct {
		name, raw, signingKey, verificationKey, method string
		valid                                          bool
	}{
		{"preview", "https://feature-abc.vercel.app/api/latr-gateway/xrpc/link.latr.bookmarks.saveBookmark?x=1", "secret", "secret", "POST", true},
		{"localhost", "http://localhost:3000/api/latr-gateway/xrpc/link.latr.bookmarks.saveBookmark", "secret", "secret", "POST", true},
		{"wrong secret", "https://feature-abc.vercel.app/api/latr-gateway/xrpc/link.latr.bookmarks.saveBookmark", "wrong", "secret", "POST", false},
		{"missing configured secret", "https://feature-abc.vercel.app/api/latr-gateway/xrpc/link.latr.bookmarks.saveBookmark", "secret", "", "POST", false},
		{"wrong path", "https://feature-abc.vercel.app/api/latr-gateway/xrpc/other", "secret", "secret", "POST", false},
		{"wrong method", "https://feature-abc.vercel.app/api/latr-gateway/xrpc/link.latr.bookmarks.saveBookmark", "secret", "secret", "GET", false},
		{"remote plaintext", "http://feature-abc.vercel.app/api/latr-gateway/xrpc/link.latr.bookmarks.saveBookmark", "secret", "secret", "POST", false},
		{"credentials", "https://user:password@example.com/api/latr-gateway/xrpc/link.latr.bookmarks.saveBookmark", "secret", "secret", "POST", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(tc.method, "https://backend.internal/xrpc/link.latr.bookmarks.saveBookmark", nil)
			signProxyURL(r, tc.signingKey, tc.raw)
			r.Method = "POST"
			got := signedProxyURL(r, tc.verificationKey)
			if (got != "") != tc.valid {
				t.Fatalf("got %q valid=%v", got, tc.valid)
			}
		})
	}
}
