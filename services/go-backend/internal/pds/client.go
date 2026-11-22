package pds

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/CountableNewt/latr-link/services/go-backend/internal/auth"
	"github.com/CountableNewt/latr-link/services/go-backend/internal/httpx"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var ErrConflict = errors.New("PDS record conflict")
var ErrNotFound = errors.New("PDS record not found")

type Client struct {
	Auth       auth.Context
	HTTPClient *http.Client
}

func New(a auth.Context, c *http.Client) *Client {
	if c == nil {
		c = httpx.PublicClient(30 * time.Second)
	}
	return &Client{a, c}
}
func (c *Client) Call(ctx context.Context, method, verb string, query url.Values, input, out any, authenticated bool) error {
	base := strings.TrimRight(c.Auth.PDSEndpoint, "/")
	u, e := url.Parse(base + "/xrpc/" + method)
	if e != nil || u.Host == "" {
		return httpx.NewError(502, "pds_error", "Invalid PDS URL")
	}
	u.RawQuery = query.Encode()
	var body bytes.Buffer
	if input != nil {
		if e = json.NewEncoder(&body).Encode(input); e != nil {
			return e
		}
	}
	req, e := http.NewRequestWithContext(ctx, verb, u.String(), &body)
	if e != nil {
		return e
	}
	req.Header.Set("Accept", "application/json")
	if input != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if authenticated {
		proof, ok := c.Auth.UpstreamProofs.Consume(method, verb, base)
		if !ok {
			return httpx.NewError(401, "missing_upstream_dpop", "Missing valid upstream DPoP proof for PDS "+method)
		}
		authorization := c.Auth.AuthorizationHeader
		if authorization == "" {
			authorization = "DPoP " + c.Auth.AccessToken
		}
		req.Header.Set("Authorization", authorization)
		req.Header.Set("DPoP", proof)
	}
	resp, e := c.HTTPClient.Do(req)
	if e != nil {
		return httpx.NewError(502, "pds_error", "PDS request failed")
	}
	var raw json.RawMessage
	if e = httpx.ReadJSON(resp, 2<<20, &raw); e != nil {
		return httpx.NewError(502, "pds_error", "Invalid PDS response")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var failure struct{ Error, Message string }
		_ = json.Unmarshal(raw, &failure)
		if method == "com.atproto.repo.getRecord" && (resp.StatusCode == 404 || (resp.StatusCode == 400 && (failure.Error == "RecordNotFound" || strings.Contains(strings.ToLower(failure.Message), "could not locate record")))) {
			return ErrNotFound
		}
		if (resp.StatusCode == 400 || resp.StatusCode == 409) && strings.Contains(strings.ToLower(failure.Error+failure.Message), "swap") {
			return ErrConflict
		}
		status, code := 502, "pds_error"
		if resp.StatusCode == 401 {
			status, code = 401, "pds_unauthorized"
		}
		if resp.StatusCode == 403 {
			status, code = 403, "pds_forbidden"
		}
		return httpx.NewError(status, code, fmt.Sprintf("PDS %s failed (%d): %s: %s", method, resp.StatusCode, failure.Error, failure.Message))
	}
	if out == nil || len(raw) == 0 {
		return nil
	}
	if e = json.Unmarshal(raw, out); e != nil {
		return httpx.NewError(502, "pds_record_decode", "PDS record could not be decoded")
	}
	return nil
}
func (c *Client) Attest(ctx context.Context) error { // Attestation always requires a correctly targeted upstream proof.
	a := c.Auth
	a.SignatureVerified = false
	copy := *c
	copy.Auth = a
	var session struct{ DID string }
	if e := copy.Call(ctx, "com.atproto.server.getSession", "GET", nil, nil, &session, true); e != nil {
		return e
	}
	if session.DID != a.DID {
		return httpx.NewError(401, "pds_session_did_mismatch", "PDS session DID did not match access-token subject")
	}
	return nil
}
