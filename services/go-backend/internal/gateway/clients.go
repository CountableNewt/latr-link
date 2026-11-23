package gateway

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"

	"github.com/CountableNewt/latr-link/services/go-backend/internal/httpx"
)

// Clients is internal configuration only: no user registration or key issuance.
type Clients map[string]string

func ParseClients(raw string) (Clients, error) {
	out := Clients{}
	for _, part := range strings.FieldsFunc(raw, func(r rune) bool { return r == ',' || r == ';' }) {
		i := strings.IndexAny(part, "=:")
		if i < 0 {
			return nil, errors.New("internal client credentials must use client-id=credential pairs")
		}
		id, key := strings.TrimSpace(part[:i]), strings.TrimSpace(part[i+1:])
		if id == "" || key == "" {
			return nil, errors.New("internal client IDs and credentials must be nonempty")
		}
		if _, exists := out[id]; exists {
			return nil, errors.New("duplicate internal client ID; use | for credential rotation")
		}
		for _, credential := range strings.Split(key, "|") {
			if credential == "" || credential != strings.TrimSpace(credential) {
				return nil, errors.New("internal client rotation credentials must be nonempty and have no surrounding whitespace")
			}
			if digest, ok := strings.CutPrefix(credential, "sha256:"); ok {
				decoded, err := hex.DecodeString(digest)
				if err != nil || len(decoded) != sha256.Size {
					return nil, errors.New("internal client credential hashes must be SHA-256 hex digests")
				}
			}
		}
		out[id] = key
	}
	if len(out) == 0 {
		return nil, errors.New("internal client credentials must not be empty")
	}
	return out, nil
}

func constantEqual(a, b string) bool {
	aa, bb := sha256.Sum256([]byte(a)), sha256.Sum256([]byte(b))
	return subtle.ConstantTimeCompare(aa[:], bb[:]) == 1
}

// Existing first-party keys can be retained as hashes without moving a public
// developer registry or recovering plaintext keys. Multiple active keys support
// overlapping rotations. The stored hash itself is never an access credential.
func credentialMatches(configured, supplied string) bool {
	if supplied == "" {
		return false
	}
	matched := false
	for _, expected := range strings.Split(configured, "|") {
		if digest, ok := strings.CutPrefix(expected, "sha256:"); ok {
			decoded, err := hex.DecodeString(digest)
			actual := sha256.Sum256([]byte(supplied))
			if err == nil && len(decoded) == sha256.Size {
				matched = subtle.ConstantTimeCompare(decoded, actual[:]) == 1 || matched
			}
		} else {
			matched = constantEqual(expected, supplied) || matched
		}
	}
	return matched
}

func (c Clients) ResolveClientID(_ context.Context, h http.Header, required bool) (string, error) {
	legacy := strings.TrimSpace(h.Get("X-Latr-Official-Client"))
	id, key := strings.TrimSpace(h.Get("X-Latr-Client-Id")), strings.TrimSpace(h.Get("X-Latr-API-Key"))
	if legacy != "" {
		for candidate, expected := range c {
			if credentialMatches(expected, legacy) {
				return candidate, nil
			}
		}
	}
	if expected, ok := c[id]; ok && key != "" && credentialMatches(expected, key) {
		return id, nil
	}
	if !required && legacy == "" && id == "" && key == "" {
		return "", nil
	}
	return "", &httpx.Error{Status: 401, Code: "client_auth_required", Message: "An internally configured client credential is required"}
}
