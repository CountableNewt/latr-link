package storage

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestConcurrentReplayClaims(t *testing.T) {
	var mu sync.Mutex
	used := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer secret" {
			t.Error("missing database auth")
		}
		var body struct {
			Requests []struct {
				Type string `json:"type"`
				Stmt struct {
					SQL  string  `json:"sql"`
					Args []value `json:"args"`
				} `json:"stmt"`
			} `json:"requests"`
		}
		json.NewDecoder(r.Body).Decode(&body)
		if len(body.Requests) != 2 || body.Requests[1].Type != "close" {
			t.Error("connection not closed")
		}
		if !strings.Contains(body.Requests[0].Stmt.SQL, "ON CONFLICT") || body.Requests[0].Stmt.Args[0].Value != "proof" {
			t.Error("claim must be atomic and parameterized")
		}
		mu.Lock()
		n := 0
		if !used {
			n = 1
			used = true
		}
		mu.Unlock()
		json.NewEncoder(w).Encode(map[string]any{"results": []any{map[string]any{"type": "ok", "response": map[string]any{"result": map[string]any{"affected_row_count": n}}}, map[string]any{"type": "ok"}}})
	}))
	defer srv.Close()
	s := &Store{URL: srv.URL, Token: "secret", Client: srv.Client()}
	var wg sync.WaitGroup
	wins := 0
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			err := s.Claim(context.Background(), "proof", time.Now().Add(time.Minute))
			mu.Lock()
			defer mu.Unlock()
			if err == nil {
				wins++
			} else if err != ErrReplay {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if wins != 1 {
		t.Fatalf("%d winners", wins)
	}
}

func TestFailsClosed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Error(w, "secret diagnostic", 503) }))
	defer srv.Close()
	s := &Store{URL: srv.URL, Client: srv.Client()}
	if err := s.Claim(context.Background(), "proof", time.Now()); err == nil || strings.Contains(err.Error(), "secret") {
		t.Fatal("database outage must fail closed without leaking details")
	}
}

func TestDatabaseURLValidation(t *testing.T) {
	for _, raw := range []string{"", "http://example.com", "https://user:password@example.com", "https://example.com?token=secret"} {
		if _, err := New(raw, "token", nil); err == nil {
			t.Errorf("accepted %q", raw)
		}
	}
	s, err := New("libsql://example.turso.io", "token", nil)
	if err != nil || s.URL != "https://example.turso.io/v2/pipeline" {
		t.Fatal(s, err)
	}
}

// Missing optional metadata must still be a valid Hrana text argument.
func TestPreviewWritePreservesEmptyTextArguments(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			Requests []struct {
				Stmt struct {
					Args []map[string]any `json:"args"`
				} `json:"stmt"`
			} `json:"requests"`
		}
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			t.Error(err)
		}
		if len(input.Requests) != 2 || len(input.Requests[0].Stmt.Args) != 7 {
			t.Fatalf("unexpected pipeline %#v", input)
		}
		args := input.Requests[0].Stmt.Args
		if args[2]["value"] != "Article" {
			t.Errorf("title argument %#v", args[2])
		}
		for _, i := range []int{3, 4, 5, 6} {
			v, exists := args[i]["value"]
			if !exists || v != "" || args[i]["type"] != "text" {
				t.Errorf("empty text argument %d invalid: %#v", i, args[i])
			}
		}
		json.NewEncoder(w).Encode(map[string]any{"results": []any{map[string]any{"type": "ok", "response": map[string]any{"result": map[string]any{"affected_row_count": 1}}}, map[string]any{"type": "ok"}}})
	}))
	defer srv.Close()
	store := &Store{URL: srv.URL, Token: "secret", Client: srv.Client()}
	if err := store.PutPreview(context.Background(), "https://example.com/article", map[string]any{"title": "Article"}); err != nil {
		t.Fatal(err)
	}
}
