package gateway

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"testing"
)

func TestInternalHashedCredentialRotation(t *testing.T) {
	hash := func(s string) string { d := sha256.Sum256([]byte(s)); return hex.EncodeToString(d[:]) }
	clients := ParseClients("first-party=sha256:" + hash("old-key") + "|sha256:" + hash("new-key"))
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
