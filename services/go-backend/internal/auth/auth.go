package auth

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"github.com/CountableNewt/latr-link/services/go-backend/internal/httpx"
	secp "github.com/decred/dcrd/dcrec/secp256k1/v4"
	"math/big"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Context struct {
	DID, PDSEndpoint, AccessToken, AuthorizationHeader, DPoPProof, ClientID string
	SignatureVerified                                                       bool
	UpstreamProofs                                                          *ProofPool
}
type ReplayStore interface {
	Claim(context.Context, string, time.Time) error
}
type ClientResolver interface {
	ResolveClientID(context.Context, http.Header, bool) (string, error)
}
type Authenticator struct {
	HTTPClient *http.Client
	PLCURL     string
	ProxyKey   string
	Replay     ReplayStore
	Clients    ClientResolver
	Now        func() time.Time
}
type jwk struct{ Kty, Crv, X, Y, Kid, Alg string }
type tokenHeader struct {
	Typ, Alg, Kid string
	JWK           jwk
}
type tokenClaims struct {
	Sub, Iss           string
	Exp                int64
	Cnf                struct{ Jkt string }
	Htm, Htu, Jti, Ath string
	Iat                int64
}

func unauthorized(code, msg string) error { return httpx.NewError(401, code, msg) }
func decodeJWT(token string) (tokenHeader, tokenClaims, []byte, []byte, error) {
	var h tokenHeader
	var c tokenClaims
	p := strings.Split(token, ".")
	if len(p) != 3 {
		return h, c, nil, nil, unauthorized("invalid_token", "Malformed JWT")
	}
	hb, e := base64.RawURLEncoding.DecodeString(p[0])
	if e != nil {
		return h, c, nil, nil, e
	}
	cb, e := base64.RawURLEncoding.DecodeString(p[1])
	if e != nil {
		return h, c, nil, nil, e
	}
	sig, e := base64.RawURLEncoding.DecodeString(p[2])
	if e != nil {
		return h, c, nil, nil, e
	}
	if e = json.Unmarshal(hb, &h); e != nil {
		return h, c, nil, nil, e
	}
	e = json.Unmarshal(cb, &c)
	return h, c, []byte(p[0] + "." + p[1]), sig, e
}
func verifySignature(k jwk, alg string, input, sig []byte) bool {
	if k.Kty != "EC" || len(sig) != 64 {
		return false
	}
	xb, e := base64.RawURLEncoding.DecodeString(k.X)
	if e != nil || len(xb) != 32 {
		return false
	}
	yb, e := base64.RawURLEncoding.DecodeString(k.Y)
	if e != nil || len(yb) != 32 {
		return false
	}
	var curve elliptic.Curve
	switch {
	case alg == "ES256" && k.Crv == "P-256":
		curve = elliptic.P256()
	case alg == "ES256K" && k.Crv == "secp256k1":
		curve = secp.S256()
	default:
		return false
	}
	x, y := new(big.Int).SetBytes(xb), new(big.Int).SetBytes(yb)
	if !curve.IsOnCurve(x, y) {
		return false
	}
	hash := sha256.Sum256(input)
	return ecdsa.Verify(&ecdsa.PublicKey{Curve: curve, X: x, Y: y}, hash[:], new(big.Int).SetBytes(sig[:32]), new(big.Int).SetBytes(sig[32:]))
}
func thumbprint(k jwk) string {
	data := fmt.Sprintf(`{"crv":%q,"kty":%q,"x":%q,"y":%q}`, k.Crv, k.Kty, k.X, k.Y)
	h := sha256.Sum256([]byte(data))
	return base64.RawURLEncoding.EncodeToString(h[:])
}
func normalizeHTU(raw string) string {
	u, e := url.Parse(raw)
	if e != nil {
		return ""
	}
	u.RawQuery = ""
	u.Fragment = ""
	u.Scheme = strings.ToLower(u.Scheme)
	u.Host = strings.ToLower(u.Host)
	return u.String()
}

// signedProxyURL binds the original browser URL to this exact method and route.
// Vercel service bindings rewrite host headers, so only the trusted frontend can
// attest a public proxy URL that differs from the backend's connection URL.
func signedProxyURL(r *http.Request, proxyKey string) string {
	raw := r.Header.Get("X-Latr-Proxy-URL")
	signature, err := hex.DecodeString(r.Header.Get("X-Latr-Proxy-Signature"))
	if proxyKey == "" || raw == "" || err != nil || len(signature) != sha256.Size {
		return ""
	}
	mac := hmac.New(sha256.New, []byte(proxyKey))
	_, _ = mac.Write([]byte(r.Method + "\n" + raw))
	if !hmac.Equal(signature, mac.Sum(nil)) {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || u.User != nil || u.Fragment != "" || u.Path != "/api/latr-gateway"+r.URL.Path {
		return ""
	}
	if u.Scheme != "https" {
		ip := net.ParseIP(u.Hostname())
		if u.Scheme != "http" || (u.Hostname() != "localhost" && (ip == nil || !ip.IsLoopback())) {
			return ""
		}
	}
	return raw
}

// Only the connection authority and a cryptographically attested proxy URL can
// satisfy DPoP target binding. Forwarded/original headers are caller-controlled.
func requestURLs(r *http.Request, proxyKey string) []string {
	scheme := "https"
	authority := (&url.URL{Host: r.Host}).Hostname()
	ip := net.ParseIP(authority)
	if r.TLS == nil && (authority == "localhost" || (ip != nil && ip.IsLoopback())) {
		scheme = "http"
	}
	out := []string{scheme + "://" + r.Host + r.URL.RequestURI()}
	if original := signedProxyURL(r, proxyKey); original != "" {
		out = append(out, original)
	}

	return out
}
func (a *Authenticator) client() *http.Client {
	if a.HTTPClient != nil {
		return a.HTTPClient
	}
	return httpx.PublicClient(15 * time.Second)
}
func (a *Authenticator) get(ctx context.Context, raw string, out any) error {
	u, e := url.Parse(raw)
	if e != nil || u.Scheme != "https" || u.Host == "" || u.User != nil {
		return unauthorized("invalid_token", "Invalid identity metadata URL")
	}
	req, e := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	if e != nil {
		return e
	}
	resp, e := a.client().Do(req)
	if e != nil {
		return e
	}
	if resp.StatusCode != 200 {
		resp.Body.Close()
		return unauthorized("invalid_token", "Identity lookup failed")
	}
	return httpx.ReadJSON(resp, 1<<20, out)
}
func (a *Authenticator) Authenticate(r *http.Request, requireClient bool) (Context, error) {
	var result Context
	var e error
	if a.Clients != nil {
		result.ClientID, e = a.Clients.ResolveClientID(r.Context(), r.Header, requireClient)
		if e != nil {
			return result, e
		}
	} else if requireClient {
		return result, httpx.NewError(403, "client_credential_policy", "Gateway clients are not configured")
	}
	authorization := strings.TrimSpace(r.Header.Get("Authorization"))
	if authorization == "" {
		authorization = strings.TrimSpace(r.Header.Get("X-Latr-Forwarded-Authorization"))
	}
	parts := strings.Fields(authorization)
	if len(parts) != 2 || (!strings.EqualFold(parts[0], "DPoP") && !strings.EqualFold(parts[0], "Bearer")) {
		return result, unauthorized("missing_auth", "Authorization must prefix DPoP or Bearer")
	}
	proof := strings.TrimSpace(r.Header.Get("DPoP"))
	if proof == "" {
		proof = strings.TrimSpace(r.Header.Get("X-Latr-Forwarded-DPoP"))
	}
	if proof == "" {
		return result, unauthorized("missing_dpop", "Missing DPoP proof header")
	}
	h, c, input, sig, e := decodeJWT(proof)
	if e != nil {
		return result, unauthorized("invalid_dpop", "Malformed DPoP proof")
	}
	if !strings.EqualFold(h.Typ, "dpop+jwt") || h.Alg != "ES256" || !verifySignature(h.JWK, h.Alg, input, sig) {
		return result, unauthorized("invalid_dpop", "Invalid DPoP signature or key")
	}
	if !strings.EqualFold(c.Htm, r.Method) {
		return result, unauthorized("invalid_dpop", "DPoP method mismatch")
	}
	matched := false
	for _, candidate := range requestURLs(r, a.ProxyKey) {
		if normalizeHTU(c.Htu) == normalizeHTU(candidate) {
			matched = true
		}
	}
	if !matched {
		return result, unauthorized("invalid_dpop", "DPoP URL mismatch")
	}
	now := time.Now()
	if a.Now != nil {
		now = a.Now()
	}
	if c.Iat < now.Unix()-300 || c.Iat > now.Unix()+300 || strings.TrimSpace(c.Jti) == "" {
		return result, unauthorized("invalid_dpop", "DPoP proof expired or missing identifier")
	}
	hash := sha256.Sum256([]byte(parts[1]))
	if c.Ath != base64.RawURLEncoding.EncodeToString(hash[:]) {
		return result, unauthorized("invalid_dpop", "DPoP access token hash mismatch")
	}
	th, tc, ti, ts, e := decodeJWT(parts[1])
	if e != nil {
		return result, unauthorized("invalid_token", "Malformed access token")
	}
	if !strings.HasPrefix(tc.Sub, "did:") || tc.Exp <= now.Unix() {
		return result, unauthorized("invalid_token", "Invalid access token subject or expiry")
	}
	if tc.Cnf.Jkt != thumbprint(h.JWK) {
		return result, unauthorized("invalid_token", "Token DPoP key mismatch")
	}
	endpoint, e := a.ResolvePDS(r.Context(), tc.Sub)
	if e != nil {
		return result, e
	}
	var resource struct {
		Resource             string
		AuthorizationServers []string `json:"authorization_servers"`
	}
	if e = a.get(r.Context(), endpoint+"/.well-known/oauth-protected-resource", &resource); e != nil {
		return result, e
	}
	issuerAllowed := false
	for _, issuer := range resource.AuthorizationServers {
		if issuer == tc.Iss {
			issuerAllowed = true
		}
	}
	if !issuerAllowed || (resource.Resource != "" && strings.TrimRight(resource.Resource, "/") != endpoint) {
		return result, unauthorized("invalid_token", "Token issuer is not authorized by viewer PDS")
	}
	var meta struct {
		Issuer  string
		JWKSURI string `json:"jwks_uri"`
	}
	if e = a.get(r.Context(), strings.TrimRight(tc.Iss, "/")+"/.well-known/oauth-authorization-server", &meta); e != nil {
		return result, e
	}
	if meta.Issuer != "" && meta.Issuer != tc.Iss {
		return result, unauthorized("invalid_token", "Token issuer metadata mismatch")
	}
	var keys struct{ Keys []jwk }
	if e = a.get(r.Context(), meta.JWKSURI, &keys); e != nil {
		return result, e
	}
	switch th.Alg {
	case "ES256", "ES256K":
		if len(keys.Keys) > 0 {
			for _, k := range keys.Keys {
				if (th.Kid == "" || k.Kid == th.Kid) && (k.Alg == "" || k.Alg == th.Alg) && verifySignature(k, th.Alg, ti, ts) {
					result.SignatureVerified = true
					break
				}
			}
			if !result.SignatureVerified {
				return result, unauthorized("invalid_token", "Invalid token signature")
			}
		}
	case "HS256":
		if len(keys.Keys) > 0 {
			return result, unauthorized("invalid_token", "Token signing key not found")
		}
	default:
		return result, unauthorized("unsupported_token_alg", "Unsupported access token signing algorithm")
	}
	if a.Replay == nil {
		return result, httpx.NewError(503, "replay_store_unavailable", "DPoP replay protection unavailable")
	}
	if e = a.Replay.Claim(r.Context(), thumbprint(h.JWK)+":"+c.Jti, time.Unix(c.Iat+301, 0)); e != nil {
		return result, unauthorized("invalid_dpop_replay", "DPoP proof replayed or replay store unavailable")
	}
	result.DID = tc.Sub
	result.PDSEndpoint = endpoint
	result.AccessToken = parts[1]
	result.AuthorizationHeader = authorization
	result.DPoPProof = proof
	result.UpstreamProofs = NewProofPool(r.Header.Get("X-ATProto-Upstream-DPoP"))
	return result, nil
}
func (a *Authenticator) ResolvePDS(ctx context.Context, did string) (string, error) {
	var raw string
	if strings.HasPrefix(did, "did:web:") {
		segments := strings.Split(strings.TrimPrefix(did, "did:web:"), ":")
		host, e := url.PathUnescape(segments[0])
		if e != nil {
			return "", e
		}
		raw = "https://" + host + "/.well-known/did.json"
		if len(segments) > 1 {
			raw = "https://" + host + "/" + strings.Join(segments[1:], "/") + "/did.json"
		}
	} else if strings.HasPrefix(did, "did:plc:") || strings.HasPrefix(did, "did:pr:") {
		base := a.PLCURL
		if base == "" {
			base = "https://plc.directory"
		}
		raw = strings.TrimRight(base, "/") + "/" + url.PathEscape(did)
	} else {
		return "", httpx.NewError(502, "pds_resolve", "Unsupported DID method")
	}
	var doc struct {
		ID      string
		Service []struct {
			ID, Type        string
			ServiceEndpoint any
		}
	}
	if e := a.get(ctx, raw, &doc); e != nil {
		return "", e
	}
	if doc.ID != "" && doc.ID != did {
		return "", httpx.NewError(502, "pds_resolve", "DID document mismatch")
	}
	for _, s := range doc.Service {
		if s.ID == "#atproto_pds" || s.Type == "AtprotoPersonalDataServer" {
			endpoint, ok := s.ServiceEndpoint.(string)
			if !ok {
				continue
			}
			u, e := url.Parse(endpoint)
			if e == nil && u.Scheme == "https" && u.Host != "" && u.User == nil {
				return strings.TrimRight(u.String(), "/"), nil
			}
		}
	}
	return "", httpx.NewError(502, "pds_resolve", "Could not resolve viewer PDS")
}
