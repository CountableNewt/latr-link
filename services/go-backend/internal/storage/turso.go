// Package storage keeps serverless operational state in Turso, never in local files.
package storage

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var ErrReplay = errors.New("DPoP proof already used")

type Store struct {
	URL, Token string
	Client     *http.Client
}
type value struct {
	Type  string `json:"type"`
	Value string `json:"value"`
}
type result struct {
	Rows     [][]value `json:"rows"`
	Affected int       `json:"affected_row_count"`
}

func New(rawURL, token string, client *http.Client) (*Store, error) {
	rawURL = strings.Replace(rawURL, "libsql://", "https://", 1)
	rawURL = strings.Replace(rawURL, "turso://", "https://", 1)
	u, err := url.Parse(rawURL)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || token == "" {
		return nil, errors.New("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required")
	}
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	return &Store{URL: strings.TrimRight(u.String(), "/") + "/v2/pipeline", Token: token, Client: client}, nil
}

// Query uses the documented stateless HTTP pipeline and closes every connection.
// SQL errors never include credentials or remote response bodies in public errors.
func (s *Store) Query(ctx context.Context, sql string, args ...string) (result, error) {
	vals := make([]value, len(args))
	for i, a := range args {
		vals[i] = value{Type: "text", Value: a}
	}
	body, _ := json.Marshal(map[string]any{"requests": []any{map[string]any{"type": "execute", "stmt": map[string]any{"sql": sql, "args": vals}}, map[string]any{"type": "close"}}})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.URL, bytes.NewReader(body))
	if err != nil {
		return result{}, err
	}
	req.Header.Set("Authorization", "Bearer "+s.Token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.Client.Do(req)
	if err != nil {
		return result{}, fmt.Errorf("operational database unavailable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return result{}, errors.New("operational database unavailable")
	}
	var decoded struct {
		Results []struct {
			Type     string `json:"type"`
			Response struct {
				Result result `json:"result"`
			} `json:"response"`
		} `json:"results"`
	}
	if err = json.NewDecoder(io.LimitReader(resp.Body, 2<<20)).Decode(&decoded); err != nil {
		return result{}, errors.New("invalid database response")
	}
	if len(decoded.Results) != 2 || decoded.Results[0].Type != "ok" || decoded.Results[1].Type != "ok" {
		return result{}, errors.New("operational database query failed")
	}
	return decoded.Results[0].Response.Result, nil
}

// Claim atomically replaces only expired claims. Exactly one replica can win.
func (s *Store) Claim(ctx context.Context, key string, expires time.Time) error {
	r, err := s.Query(ctx, `INSERT INTO dpop_replay(proof_hash, expires_at) VALUES (?, ?)
 ON CONFLICT(proof_hash) DO UPDATE SET expires_at=excluded.expires_at
 WHERE dpop_replay.expires_at <= unixepoch()`, key, fmt.Sprint(expires.Unix()))
	if err != nil {
		return err
	}
	if r.Affected != 1 {
		return ErrReplay
	}
	return nil
}

func hash(subject string) string {
	v := sha256.Sum256([]byte(subject))
	return hex.EncodeToString(v[:])
}

func (s *Store) Preview(ctx context.Context, subject string) (map[string]any, error) {
	r, err := s.Query(ctx, `SELECT title,description,image_url,site_name,author FROM bookmark_previews WHERE subject_hash=? AND julianday(expires_at)>julianday('now')`, hash(subject))
	if err != nil {
		return nil, err
	}
	if len(r.Rows) == 0 {
		return nil, nil
	}
	if len(r.Rows[0]) != 5 {
		return nil, errors.New("invalid preview row")
	}
	out := map[string]any{}
	for i, k := range []string{"title", "description", "image", "siteName", "author"} {
		if r.Rows[0][i].Type != "null" && r.Rows[0][i].Value != "" {
			out[k] = r.Rows[0][i].Value
		}
	}
	return out, nil
}

func (s *Store) PutPreview(ctx context.Context, subject string, fields map[string]any) error {
	args := []string{hash(subject), subject}
	for _, k := range []string{"title", "description", "image", "siteName", "author"} {
		v, _ := fields[k].(string)
		args = append(args, v)
	}
	_, err := s.Query(ctx, `INSERT INTO bookmark_previews(subject_hash,subject,title,description,image_url,site_name,author) VALUES (?,?,?,?,?,?,?)
 ON CONFLICT(subject_hash) DO UPDATE SET subject=excluded.subject,title=excluded.title,description=excluded.description,image_url=excluded.image_url,site_name=excluded.site_name,author=excluded.author,updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now'),expires_at=strftime('%Y-%m-%dT%H:%M:%SZ','now','+7 days')`, args...)
	return err
}

func (s *Store) Ready(ctx context.Context) error {
	_, err := s.Query(ctx, "SELECT 1 FROM dpop_replay LIMIT 1")
	return err
}

// Cleanup is bounded by the expiry index and can be called by the daily cron.
func (s *Store) Cleanup(ctx context.Context) error {
	for _, sql := range []string{`DELETE FROM dpop_replay WHERE proof_hash IN (SELECT proof_hash FROM dpop_replay WHERE expires_at<=unixepoch() LIMIT 10000)`, `DELETE FROM bookmark_previews WHERE subject_hash IN (SELECT subject_hash FROM bookmark_previews WHERE expires_at<strftime('%Y-%m-%dT%H:%M:%SZ','now') LIMIT 1000)`} {
		if _, err := s.Query(ctx, sql); err != nil {
			return err
		}
	}
	return nil
}
