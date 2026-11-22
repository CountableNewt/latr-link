package gateway

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/CountableNewt/latr-link/services/go-backend/internal/auth"
	"github.com/CountableNewt/latr-link/services/go-backend/internal/bookmarks"
	"github.com/CountableNewt/latr-link/services/go-backend/internal/httpx"
	"github.com/CountableNewt/latr-link/services/go-backend/internal/metadata"
	"github.com/CountableNewt/latr-link/services/go-backend/internal/pds"
	"github.com/CountableNewt/latr-link/services/go-backend/internal/storage"
)

type State interface {
	auth.ReplayStore
	Preview(context.Context, string) (map[string]any, error)
	PutPreview(context.Context, string, map[string]any) error
	Ready(context.Context) error
	Cleanup(context.Context) error
}
type Authentication interface {
	Authenticate(*http.Request, bool) (auth.Context, error)
}
type Server struct {
	Auth       Authentication
	State      State
	HTTP       *http.Client
	Metadata   *metadata.Resolver
	Kind       string
	CronSecret string
}

func FromEnvironment(kind string) (*Server, error) {
	client := httpx.PublicClient(25 * time.Second)
	clients, err := ParseClients(os.Getenv("LATR_GATEWAY_OFFICIAL_CLIENT_CREDENTIALS"))
	if err != nil {
		return nil, fmt.Errorf("LATR_GATEWAY_OFFICIAL_CLIENT_CREDENTIALS: %w", err)
	}
	store, err := storage.New(os.Getenv("TURSO_DATABASE_URL"), os.Getenv("TURSO_AUTH_TOKEN"), nil)
	if err != nil {
		return nil, err
	}
	return &Server{Auth: &auth.Authenticator{HTTPClient: client, Replay: store, Clients: clients, ProxyKey: os.Getenv("LATR_GATEWAY_PROXY_SECRET")}, State: store, HTTP: client, Metadata: metadata.New(client), Kind: kind, CronSecret: os.Getenv("CRON_SECRET")}, nil
}

func jsonResponse(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func respondError(w http.ResponseWriter, r *http.Request, err error) {
	status, code, msg := 500, "internal_error", "Request failed"
	var e *httpx.Error
	if errors.As(err, &e) {
		status, code, msg = e.Status, e.Code, e.Message
	}
	if errors.Is(err, pds.ErrConflict) {
		status, code, msg = 409, "conflict", "Record changed; refresh and retry"
	}
	if errors.Is(err, pds.ErrNotFound) {
		status, code, msg = 404, "bookmark_not_found", "Bookmark not found"
	}
	if strings.HasPrefix(r.URL.Path, "/xrpc/") {
		names := map[string]string{"invalid_request": "InvalidRequest", "invalid_url": "InvalidUrl", "missing_auth": "AuthRequired", "invalid_token": "InvalidToken", "missing_dpop": "InvalidDpop", "invalid_dpop": "InvalidDpop", "invalid_dpop_replay": "InvalidDpop", "client_auth_required": "ClientAuthRequired", "bookmark_not_found": "BookmarkNotFound", "conflict": "Conflict", "xrpc_not_supported": "XrpcNotSupported", "retired": "XrpcNotSupported"}
		if name, ok := names[code]; ok {
			code = name
		} else if status == 401 {
			code = "InvalidToken"
		} else if status >= 500 {
			code = "UpstreamFailure"
		}
	}
	jsonResponse(w, status, map[string]any{"error": code, "message": msg})
}
func isMetadata(path string) bool {
	return path == "/xrpc/link.latr.preview.getOpenGraph" || path == "/xrpc/link.latr.discovery.resolveUrl" || path == "/v1/latr/og-preview" || path == "/v1/latr/discover/at-uri"
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Authorization,Content-Type,DPoP,X-ATProto-Upstream-DPoP,X-Latr-Client-Id,X-Latr-API-Key,X-Latr-Official-Client")
	w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
	w.Header().Set("Access-Control-Expose-Headers", "DPoP-Nonce")
	if r.Method == "OPTIONS" {
		w.WriteHeader(204)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 55*time.Second)
	defer cancel()
	r = r.WithContext(ctx)
	path := r.URL.Path
	if path == "/health" && r.Method == "GET" {
		jsonResponse(w, 200, map[string]any{"status": "ok", "service": "latr-" + s.Kind})
		return
	}
	if path == "/ready" && r.Method == "GET" {
		if s.State == nil || s.State.Ready(ctx) != nil {
			jsonResponse(w, 503, map[string]any{"status": "unavailable"})
		} else {
			jsonResponse(w, 200, map[string]any{"status": "ok"})
		}
		return
	}
	if path == "/internal/cleanup" && r.Method == "GET" {
		if s.CronSecret == "" || !constantEqual(r.Header.Get("Authorization"), "Bearer "+s.CronSecret) {
			respondError(w, r, httpx.NewError(401, "missing_auth", "Unauthorized"))
			return
		}
		if err := s.State.Cleanup(ctx); err != nil {
			respondError(w, r, err)
			return
		}
		jsonResponse(w, 200, map[string]any{"ok": true})
		return
	}
	if strings.HasPrefix(path, "/v1/latr/") || strings.HasPrefix(path, "/xrpc/link.latr.saved.") || strings.HasPrefix(path, "/xrpc/link.latr.developer.") || path == "/oauth/latrkit-client-metadata.json" {
		respondError(w, r, httpx.NewError(410, "retired", "This API has been retired; use the current bookmark APIs"))
		return
	}
	if strings.HasPrefix(path, "/oauth/") {
		s.oauthMetadata(w, r)
		return
	}
	if s.Kind == "metadata" && !isMetadata(path) {
		respondError(w, r, httpx.NewError(404, "not_found", "Not found"))
		return
	}
	var c contract
	var in map[string]any
	var err error
	if strings.HasPrefix(path, "/xrpc/") {
		var ok bool
		c, ok = contracts[strings.TrimPrefix(path, "/xrpc/")]
		if !ok {
			respondError(w, r, httpx.NewError(404, "xrpc_not_supported", "XRPC method is not supported"))
			return
		}
		if c.Verb != r.Method {
			w.Header().Set("Allow", c.Verb)
			respondError(w, r, httpx.NewError(405, "invalid_request", "XRPC method was invoked with the wrong HTTP verb"))
			return
		}
		in, err = input(r, c)
		if err != nil {
			respondError(w, r, err)
			return
		}
		if proof := str(in, "upstreamDpopProof"); proof != "" && r.Header.Get("X-ATProto-Upstream-DPoP") == "" {
			r.Header.Set("X-ATProto-Upstream-DPoP", proof)
		}
	}
	if !strings.HasPrefix(path, "/xrpc/") {
		respondError(w, r, httpx.NewError(404, "not_found", "Not found"))
		return
	}
	if s.Auth == nil {
		respondError(w, r, httpx.NewError(503, "auth_unavailable", "Authentication unavailable"))
		return
	}
	viewer, err := s.Auth.Authenticate(r, true)
	if err != nil {
		respondError(w, r, err)
		return
	}
	if (isMetadata(path) || path == "/xrpc/link.latr.auth.probe") && !viewer.SignatureVerified {
		if err = pds.New(viewer, s.HTTP).Attest(ctx); err != nil {
			respondError(w, r, err)
			return
		}
	}
	library := bookmarks.New(viewer, s.HTTP)
	var out any
	switch strings.TrimPrefix(path, "/xrpc/") {
	case "link.latr.bookmarks.listBookmarks":
		out, err = library.List(ctx, num(in, "limit", 50), str(in, "cursor"), str(in, "tag"))
	case "link.latr.bookmarks.listTags":
		out, err = library.Tags(ctx, num(in, "limit", 100), str(in, "cursor"))
	case "link.latr.bookmarks.getBookmark":
		out, err = library.Get(ctx, str(in, "subject"))
	case "link.latr.bookmarks.saveBookmark":
		out, err = library.Save(ctx, str(in, "subject"), tags(in))
	case "link.latr.bookmarks.syncMetadata":
		out, err = library.SyncMetadata(ctx, num(in, "limit", 50), str(in, "cursor"))
	case "link.latr.bookmarks.setState":
		err = library.SetState(ctx, str(in, "bookmarkUri"), str(in, "state"))
		out = map[string]any{"ok": true}
	case "link.latr.bookmarks.setTags":
		out, err = library.SetTags(ctx, str(in, "bookmarkUri"), tags(in))
	case "link.latr.bookmarks.renameTag":
		out, err = library.RenameTag(ctx, str(in, "tag"), str(in, "replacement"), num(in, "limit", 25), str(in, "cursor"))
	case "link.latr.bookmarks.deleteTag":
		out, err = library.DeleteTag(ctx, str(in, "tag"), num(in, "limit", 25), str(in, "cursor"))
	case "link.latr.bookmarks.deleteBookmark":
		err = library.Delete(ctx, str(in, "bookmarkUri"))
		out = map[string]any{"ok": true}
	case "link.latr.bookmarks.migrateLegacy":
		out, err = library.Migrate(ctx, num(in, "limit", 25), str(in, "cursor"))
	case "link.latr.preview.getOpenGraph":
		out, err = s.openGraph(ctx, str(in, "url"))
	case "link.latr.discovery.resolveUrl":
		out, err = s.Metadata.Resolve(ctx, str(in, "url"))
	case "link.latr.auth.probe":
		out, err = s.probe(ctx, viewer)
	default:
		err = httpx.NewError(404, "xrpc_not_supported", "XRPC method is not supported")
	}
	if err != nil {
		respondError(w, r, err)
		return
	}
	s.enrich(ctx, out, strings.HasSuffix(path, "saveBookmark"))
	jsonResponse(w, 200, out)
}

func (s *Server) probe(ctx context.Context, a auth.Context) (map[string]any, error) {
	page, err := bookmarks.New(a, s.HTTP).List(ctx, 1, "", "")
	if err != nil {
		return nil, err
	}
	count := 0
	switch values := page["bookmarks"].(type) {
	case []any:
		count = len(values)
	case []map[string]any:
		count = len(values)
	}
	return map[string]any{"ok": true, "did": a.DID, "clientId": a.ClientID, "pdsWriteThrough": true, "sampleCount": count, "upstreamDpop": a.UpstreamProofs != nil}, nil
}
func (s *Server) openGraph(ctx context.Context, subject string) (map[string]any, error) {
	if s.State != nil {
		if fields, err := s.State.Preview(ctx, subject); err == nil && fields != nil {
			return fields, nil
		}
	}
	fields, err := s.Metadata.OpenGraph(ctx, subject)
	if err != nil {
		return nil, httpx.NewError(400, "invalid_url", "Unable to resolve URL metadata")
	}
	data, _ := json.Marshal(fields)
	var result map[string]any
	_ = json.Unmarshal(data, &result)
	if s.State != nil && len(result) > 0 {
		_ = s.State.PutPreview(ctx, subject, result)
	}
	return result, nil
}
func (s *Server) enrich(ctx context.Context, v any, fetch bool) {
	m, ok := v.(map[string]any)
	if !ok {
		return
	}
	if value, ok := m["value"].(map[string]any); ok {
		subject := str(value, "subject")
		if s.State != nil {
			if fields, err := s.State.Preview(ctx, subject); err == nil && fields != nil {
				m["preview"] = fields
				return
			}
		}
		if fetch && (strings.HasPrefix(subject, "https://") || strings.HasPrefix(subject, "http://")) {
			if fields, err := s.openGraph(ctx, subject); err == nil {
				m["preview"] = fields
			}
		}
	}
	for _, k := range []string{"bookmark", "bookmarks"} {
		switch child := m[k].(type) {
		case map[string]any:
			s.enrich(ctx, child, false)
		case []any:
			for _, row := range child {
				s.enrich(ctx, row, false)
			}
		case []map[string]any:
			for _, row := range child {
				s.enrich(ctx, row, false)
			}
		}
	}
}
