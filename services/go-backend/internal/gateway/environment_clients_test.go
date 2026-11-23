package gateway

import (
	"context"
	"net/http"
	"strings"
	"testing"
)

func TestAdditionalClientsPreserveExistingCredentials(t *testing.T) {
	t.Setenv("LATR_GATEWAY_OFFICIAL_CLIENT_CREDENTIALS", "web=existing;social=old")
	t.Setenv("LATR_GATEWAY_ADDITIONAL_CLIENT_CREDENTIALS", "social=new;ios=native")
	clients, err := clientsFromEnvironment()
	if err != nil {
		t.Fatal(err)
	}
	for _, pair := range [][2]string{{"web", "existing"}, {"social", "old"}, {"social", "new"}, {"ios", "native"}} {
		h := make(http.Header)
		h.Set("X-Latr-Client-Id", pair[0])
		h.Set("X-Latr-API-Key", pair[1])
		if id, err := clients.ResolveClientID(context.Background(), h, true); err != nil || id != pair[0] {
			t.Fatalf("configured client rejected: %v", err)
		}
	}
}

func TestAdditionalClientsAreOptionalButCannotReplacePrimaryConfiguration(t *testing.T) {
	t.Setenv("LATR_GATEWAY_OFFICIAL_CLIENT_CREDENTIALS", "web=existing")
	t.Setenv("LATR_GATEWAY_ADDITIONAL_CLIENT_CREDENTIALS", "")
	clients, err := clientsFromEnvironment()
	if err != nil || len(clients) != 1 || clients["web"] != "existing" {
		t.Fatalf("primary configuration changed: %v", err)
	}
	t.Setenv("LATR_GATEWAY_OFFICIAL_CLIENT_CREDENTIALS", "")
	t.Setenv("LATR_GATEWAY_ADDITIONAL_CLIENT_CREDENTIALS", "social=new")
	if _, err := clientsFromEnvironment(); err == nil || !strings.HasPrefix(err.Error(), "LATR_GATEWAY_OFFICIAL_CLIENT_CREDENTIALS:") {
		t.Fatalf("invalid primary configuration accepted: %v", err)
	}
}

func TestAdditionalClientsRejectInvalidConfigurationWithoutLeakingSecrets(t *testing.T) {
	t.Setenv("LATR_GATEWAY_OFFICIAL_CLIENT_CREDENTIALS", "web=existing")
	for _, raw := range []string{"social=private|", "social=private;social=other", "social=sha256:private"} {
		t.Setenv("LATR_GATEWAY_ADDITIONAL_CLIENT_CREDENTIALS", raw)
		clients, err := clientsFromEnvironment()
		if err == nil || clients != nil || !strings.HasPrefix(err.Error(), "LATR_GATEWAY_ADDITIONAL_CLIENT_CREDENTIALS:") {
			t.Fatal("invalid additional credentials accepted")
		}
		if strings.Contains(err.Error(), "private") {
			t.Fatal("credential leaked in configuration error")
		}
	}
}
