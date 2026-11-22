package auth

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"sync"
)

type ProofPool struct {
	mu     sync.Mutex
	proofs []string
}

func NewProofPool(raw string) *ProofPool {
	p := &ProofPool{}
	for _, v := range strings.Split(raw, ",") {
		if v = strings.TrimSpace(v); v != "" {
			p.proofs = append(p.proofs, v)
		}
	}
	return p
}
func (p *ProofPool) Consume(method, verb, base string) (string, bool) {
	if p == nil {
		return "", false
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	expected := strings.TrimRight(base, "/") + "/xrpc/" + method
	for i, v := range p.proofs {
		var claims struct{ HTU, HTM string }
		parts := strings.Split(v, ".")
		if len(parts) != 3 {
			continue
		}
		b, e := base64.RawURLEncoding.DecodeString(parts[1])
		if e != nil || json.Unmarshal(b, &claims) != nil {
			continue
		}
		if strings.EqualFold(claims.HTM, verb) && strings.SplitN(claims.HTU, "?", 2)[0] == expected {
			p.proofs = append(p.proofs[:i], p.proofs[i+1:]...)
			return v, true
		}
	}
	return "", false
}
