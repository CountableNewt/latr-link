package gateway

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"
	"testing"
)

func TestInternalHashedCredentialRotation(t *testing.T) {
	hash := func(s string) string { d := sha256.Sum256([]byte(s)); return hex.EncodeToString(d[:]) }
	clients, err := ParseClients("first-party=sha256:" + hash("old-key") + "|sha256:" + hash("new-key"))
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"old-key", "new-key"} {
		h := http.Header{"X-Latr-Client-Id": []string{"first-party"}, "X-Latr-Api-Key": []string{key}}
		id, err := clients.ResolveClientID(context.Background(), h, true)
		if err != nil || id != "first-party" {
			t.Fatalf("existing key rejected: %v", err)
		}
	}
	for _, key := range []string{hash("old-key"), "sha256:" + hash("old-key"), "unregistered"} {
		h := http.Header{"X-Latr-Client-Id": []string{"first-party"}, "X-Latr-Api-Key": []string{key}}
		if _, err := clients.ResolveClientID(context.Background(), h, true); err == nil {
			t.Fatal("hash or unknown key accepted as a credential")
		}
	}
}

func TestParseClientsRejectsInvalidEnvironmentConfiguration(t *testing.T) {
	for _, raw := range []string{
		"", " ; , ", "web", "=secret", "web=", "web=secret;broken",
		"web=secret,web=other", "web=secret|", "web=|secret", "web=secret||other",
		"web=secret| other", "web=sha256:nope", "web=sha256:abcd",
	} {
		t.Run(raw, func(t *testing.T) {
			clients, err := ParseClients(raw)
			if err == nil || clients != nil {
				t.Fatal("invalid environment configuration accepted")
			}
			if strings.Contains(err.Error(), "secret") || strings.Contains(err.Error(), "nope") {
				t.Fatal("configuration error exposes credential")
			}
		})
	}
}

func TestInternalPlaintextCredentialRotation(t *testing.T) {
	clients, err := ParseClients(" web = old-key|new-key ; social:YWJjZA== ")
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"old-key", "new-key"} {
		h := make(http.Header)
		h.Set("X-Latr-Client-Id", "web")
		h.Set("X-Latr-API-Key", key)
		if id, err := clients.ResolveClientID(context.Background(), h, true); err != nil || id != "web" {
			t.Fatalf("rotation credential rejected: %v", err)
		}
	}
	if clients["social"] != "YWJjZA==" {
		t.Fatal("base64 credential padding lost")
	}
	if credentialMatches("secret|", "") {
		t.Fatal("empty credential accepted")
	}
}

func TestInternalClientCredentialsRequiredOnlyWhenRequested(t *testing.T) {
	clients, err := ParseClients("web=secret")
	if err != nil {
		t.Fatal(err)
	}
	if id, err := clients.ResolveClientID(context.Background(), make(http.Header), false); err != nil || id != "" {
		t.Fatal("optional unauthenticated request rejected")
	}
	if _, err := clients.ResolveClientID(context.Background(), make(http.Header), true); err == nil {
		t.Fatal("required credentials missing")
	}
	h := make(http.Header)
	h.Set("X-Latr-API-Key", "unconfigured")
	if _, err := clients.ResolveClientID(context.Background(), h, false); err == nil {
		t.Fatal("invalid optional credential accepted")
	}
}

func TestStartupRejectsInvalidCredentialsBeforeDatabaseConfiguration(t *testing.T) {
	t.Setenv("LATR_GATEWAY_OFFICIAL_CLIENT_CREDENTIALS", "web=secret;broken")
	t.Setenv("TURSO_DATABASE_URL", "")
	if _, err := FromEnvironment("gateway"); err == nil || !strings.HasPrefix(err.Error(), "LATR_GATEWAY_OFFICIAL_CLIENT_CREDENTIALS:") {
		t.Fatalf("expected credential configuration error, got %v", err)
	}
}
