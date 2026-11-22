package gateway

import (
	"net/http"
	"os"
	"strings"
)

// Public metadata is deployment-relative. Previews must allow unauthenticated
// metadata fetches by PDS authorization servers; browser OAuth still uses PKCE.
func (s *Server) oauthMetadata(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	if r.Method != "GET" || (path != "/oauth/client-metadata.json" && path != "/oauth/extension-client-metadata.json") {
		respondError(w, r, invalid("Unknown OAuth metadata route"))
		return
	}
	origin := "https://" + r.Host
	redirect := strings.TrimRight(os.Getenv("LATR_GATEWAY_OAUTH_PUBLIC_ORIGIN"), "/")
	if redirect == "" {
		redirect = origin
	}
	scope := "atproto repo:community.lexicon.bookmarks.bookmark?action=create&action=update&action=delete include:link.latr.authFull repo:link.latr.saved.external?action=delete repo:link.latr.saved.item?action=delete repo:com.latr.saved.external?action=delete repo:com.latr.saved.item?action=delete"
	name, callback := "L@tr.link", "/callback"
	if path == "/oauth/extension-client-metadata.json" {
		name += " Extension"
		callback = "/extension/callback"
	} else {
		scope += " include:app.userinput.authFull blob:*/*"
	}
	jsonResponse(w, 200, map[string]any{"client_id": origin + path, "application_type": "web", "grant_types": []string{"authorization_code", "refresh_token"}, "response_types": []string{"code"}, "redirect_uris": []string{redirect + callback}, "scope": scope, "token_endpoint_auth_method": "none", "dpop_bound_access_tokens": true, "client_name": name, "client_uri": redirect})
}
