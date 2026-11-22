package pds

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"github.com/CountableNewt/latr-link/services/go-backend/internal/auth"
	"io"
	"net/http"
	"strings"
	"testing"
)

type transport func(*http.Request) (*http.Response, error)

func (f transport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestAttestationAndProofExhaustion(t *testing.T) {
	calls := 0
	client := &http.Client{Transport: transport(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.Header.Get("Authorization") != "DPoP token" || r.Header.Get("DPoP") == "" {
			t.Error("missing credentials")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"did":"did:plc:alice"}`))}, nil
	})}
	b, _ := json.Marshal(map[string]string{"htm": "GET", "htu": "https://pds.test/xrpc/com.atproto.server.getSession"})
	a := auth.Context{DID: "did:plc:alice", PDSEndpoint: "https://pds.test", AccessToken: "token", UpstreamProofs: auth.NewProofPool("h." + base64.RawURLEncoding.EncodeToString(b) + ".s")}
	c := New(a, client)
	if e := c.Attest(context.Background()); e != nil {
		t.Fatal(e)
	}
	if e := c.Attest(context.Background()); e == nil {
		t.Fatal("reused attestation proof")
	}
	if calls != 1 {
		t.Fatalf("calls: %d", calls)
	}
}
func TestMissingRecordMapping(t *testing.T) {
	client := &http.Client{Transport: transport(func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 400, Body: io.NopCloser(strings.NewReader(`{"error":"RecordNotFound"}`))}, nil
	})}
	c := New(auth.Context{PDSEndpoint: "https://pds.test"}, client)
	e := c.Call(context.Background(), "com.atproto.repo.getRecord", "GET", nil, nil, nil, false)
	if !errors.Is(e, ErrNotFound) {
		t.Fatalf("got %v", e)
	}
}

func TestSignedTokenCannotReuseGatewayProofUpstream(t *testing.T) {
	c := New(auth.Context{PDSEndpoint: "https://pds.test", SignatureVerified: true, DPoPProof: "gateway.proof.jwt"}, &http.Client{Transport: transport(func(r *http.Request) (*http.Response, error) {
		t.Fatal("request without targeted proof reached PDS")
		return nil, nil
	})})
	if e := c.Call(context.Background(), "com.atproto.repo.listRecords", "GET", nil, nil, nil, true); e == nil {
		t.Fatal("missing proof accepted")
	}
}
