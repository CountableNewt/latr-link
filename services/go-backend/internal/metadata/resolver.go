package metadata

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"
)

type Resolver struct {
	client                *http.Client
	identityBase, plcBase string
	appViewBases          []string
}
type Resolution struct {
	SubjectURI string `json:"subjectUri,omitempty"`
	Warning    string `json:"warning,omitempty"`
}

func New(client *http.Client) *Resolver {
	identity := strings.TrimRight(first(os.Getenv("LATR_GATEWAY_IDENTITY_URL"), os.Getenv("LATR_IDENTITY_BASE_URL")), "/")
	if identity == "" {
		identity = "https://bsky.social"
	}
	plc := strings.TrimRight(first(os.Getenv("PLC_URL"), os.Getenv("PLC_DIRECTORY_URL")), "/")
	if plc == "" {
		plc = "https://plc.directory"
	}
	bases := strings.FieldsFunc(first(os.Getenv("LATR_GATEWAY_APPVIEW_URLS"), os.Getenv("LATR_APPVIEW_BASE_URLS")), func(r rune) bool { return r == ',' || r == ' ' })
	foundDefault := false
	for _, base := range bases {
		if strings.TrimRight(base, "/") == "https://public.api.bsky.app" {
			foundDefault = true
		}
	}
	if !foundDefault {
		bases = append(bases, "https://public.api.bsky.app")
	}
	return &Resolver{client: newClient(client), identityBase: identity, plcBase: plc, appViewBases: bases}
}

// OpenGraph bounds a direct fetch and optional parallel fallback providers to 30 seconds total.
func (r *Resolver) OpenGraph(ctx context.Context, raw string) (Fields, error) {
	raw = strings.TrimSpace(raw)
	if err := ValidateURL(raw); err != nil {
		return Fields{}, err
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	body, final, fetchErr := r.fetch(ctx, raw, "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8", maxHTMLBytes)
	fields := Fields{}
	if fetchErr == nil {
		fields = Parse(string(body), final)
	}
	signals := scan(head(string(body))).meta
	if fields.Image == "" || signals["og:title"] == "" && signals["twitter:title"] == "" || weakTitle(fields, raw) {
		candidates := make([]Fields, 3)
		var wg sync.WaitGroup
		providers := []func(context.Context, string) Fields{r.microlink, r.reader, r.cardyb}
		for i, provider := range providers {
			wg.Add(1)
			go func(i int, p func(context.Context, string) Fields) { defer wg.Done(); candidates[i] = p(ctx, raw) }(i, provider)
		}
		wg.Wait()
		best := fields
		for _, candidate := range candidates {
			if quality(candidate, raw) > quality(best, raw) {
				best = candidate
			}
		}
		fields = merge(best, fields)
	}
	if fields == (Fields{}) {
		fields = fallback(raw)
	}
	return enrich(fields, raw), nil
}
func (r *Resolver) Resolve(ctx context.Context, raw string) (Resolution, error) {
	if err := ValidateURL(raw); err != nil {
		return Resolution{Warning: err.Error()}, nil
	}
	u, _ := url.Parse(strings.TrimSpace(raw))
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	if (u.Hostname() == "bsky.app" || strings.HasSuffix(u.Hostname(), ".bsky.app")) && len(parts) == 4 && parts[0] == "profile" && parts[2] == "post" {
		if did := r.resolveActor(ctx, parts[1]); did != "" {
			return Resolution{SubjectURI: "at://" + did + "/app.bsky.feed.post/" + parts[3]}, nil
		}
	}
	body, _, err := r.fetch(ctx, raw, "text/html,application/xhtml+xml", maxHTMLBytes)
	if err != nil {
		return Resolution{Warning: err.Error()}, nil
	}
	return Resolution{SubjectURI: ExtractAtURI(string(body))}, nil
}
func (r *Resolver) getJSON(ctx context.Context, target string, out any) error {
	body, _, err := r.fetch(ctx, target, "application/json", 2*1024*1024)
	if err != nil {
		return err
	}
	return json.Unmarshal(body, out)
}
func xrpc(base, method string, q url.Values) string {
	return strings.TrimRight(base, "/") + "/xrpc/" + method + "?" + q.Encode()
}
func (r *Resolver) resolveActor(ctx context.Context, actor string) string {
	if strings.HasPrefix(actor, "did:") {
		return actor
	}
	var payload struct {
		DID string `json:"did"`
	}
	if r.getJSON(ctx, xrpc(r.identityBase, "com.atproto.identity.resolveHandle", url.Values{"handle": {actor}}), &payload) == nil && strings.HasPrefix(payload.DID, "did:") {
		return payload.DID
	}
	for _, base := range r.appViewBases {
		payload.DID = ""
		if r.getJSON(ctx, xrpc(base, "app.bsky.actor.getProfile", url.Values{"actor": {actor}}), &payload) == nil && strings.HasPrefix(payload.DID, "did:") {
			return payload.DID
		}
	}
	return ""
}
func (r *Resolver) microlink(ctx context.Context, raw string) Fields {
	target := "https://api.microlink.io/?" + url.Values{"url": {raw}}.Encode()
	body, _, err := r.fetch(ctx, target, "application/json", 256*1024)
	if err != nil {
		return Fields{}
	}
	return ParseMicrolink(body, raw)
}
func ParseMicrolink(body []byte, raw string) Fields {
	var p struct {
		Status string `json:"status"`
		Data   struct {
			Title, Description, Author, Publisher string
			Image                                 struct {
				URL string `json:"url"`
			}
		} `json:"data"`
	}
	if json.Unmarshal(body, &p) != nil || p.Status != "success" {
		return Fields{}
	}
	return Fields{Title: decode(p.Data.Title), Description: decode(p.Data.Description), Image: absolute(raw, p.Data.Image.URL), SiteName: first(p.Data.Publisher, hostname(raw)), Author: author(p.Data.Author)}
}
func (r *Resolver) cardyb(ctx context.Context, raw string) Fields {
	body, _, err := r.fetch(ctx, "https://cardyb.bsky.app/v1/extract?"+url.Values{"url": {raw}}.Encode(), "application/json", 128*1024)
	if err != nil {
		return Fields{}
	}
	return ParseCardyb(body, raw)
}
func ParseCardyb(body []byte, raw string) Fields {
	var p struct{ Error, Title, Description, Image string }
	if json.Unmarshal(body, &p) != nil || p.Error != "" {
		return Fields{}
	}
	f := Fields{Title: decode(p.Title), Description: decode(p.Description), Image: absolute(raw, p.Image), SiteName: hostname(raw)}
	if weakTitle(f, raw) && f.Image == "" {
		return Fields{}
	}
	return f
}
func (r *Resolver) reader(ctx context.Context, raw string) Fields {
	body, _, err := r.fetch(ctx, "https://r.jina.ai/"+raw, "application/json,text/plain,*/*", maxHTMLBytes)
	if err != nil {
		return Fields{}
	}
	return ParseReader(body, raw)
}

var markdownImage = regexp.MustCompile(`!\[[^\]]*\]\((https?://[^)\s]+)\)`)

func ParseReader(body []byte, raw string) Fields {
	var p struct {
		Data struct {
			Title, Description string
			Metadata           map[string]string
		}
	}
	if json.Unmarshal(body, &p) == nil {
		m := p.Data.Metadata
		return Fields{
			Title: first(m["og:title"], m["twitter:title"], p.Data.Title), Description: first(m["og:description"], m["twitter:description"], m["description"], p.Data.Description),
			Image:    absolute(raw, first(m["og:image"], m["og:image:url"], m["og:image:secure_url"], m["twitter:image"], m["parsely-image-url"])),
			SiteName: first(m["og:site_name"], m["application-name"], hostname(raw)), Author: first(author(m["author"]), author(m["article:author"]), author(m["parsely-author"]), author(m["og:article:author"])),
		}
	}
	f := Fields{SiteName: hostname(raw)}
	inMarkdown := false
	for _, line := range strings.Split(string(body), "\n") {
		line = strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(line, "Title: "):
			f.Title = decode(strings.TrimPrefix(line, "Title: "))
		case strings.HasPrefix(line, "Description: "):
			f.Description = decode(strings.TrimPrefix(line, "Description: "))
		case strings.HasPrefix(line, "Markdown Content:"):
			inMarkdown = true
		case inMarkdown && f.Title == "" && strings.HasPrefix(line, "# "):
			f.Title = decode(strings.TrimPrefix(line, "# "))
		}
	}
	for _, match := range markdownImage.FindAllStringSubmatch(string(body), -1) {
		lower := strings.ToLower(match[1])
		decorative := false
		for _, part := range []string{"author_profile", "/authors/", "avatar", "favicon", "cookie", "logo.png", "ot-logo", "w=96", "w=48", "w=64"} {
			if strings.Contains(lower, part) {
				decorative = true
				break
			}
		}
		if !decorative {
			f.Image = match[1]
			break
		}
	}
	return f
}

// Subject previews public AT records via DID-discovered AppViews with a PDS fallback.
func (r *Resolver) Subject(ctx context.Context, uri string) (Fields, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	uri = CanonicalAtURI(uri)
	if uri == "" {
		return Fields{}, errors.New("invalid_subject")
	}
	parts := strings.SplitN(strings.TrimPrefix(uri, "at://"), "/", 3)
	repo := parts[0]
	if !strings.HasPrefix(repo, "did:") {
		repo = r.resolveActor(ctx, repo)
		if repo == "" {
			return Fields{}, errors.New("unresolved_actor")
		}
	}
	var doc struct {
		ID      string `json:"id"`
		Service []struct {
			ID       string `json:"id"`
			Type     string `json:"type"`
			Endpoint any    `json:"serviceEndpoint"`
		} `json:"service"`
	}
	docURL := ""
	switch {
	case strings.HasPrefix(repo, "did:plc:"), strings.HasPrefix(repo, "did:pr:"):
		docURL = r.plcBase + "/" + url.PathEscape(repo)
	case strings.HasPrefix(repo, "did:web:"):
		segments := strings.Split(strings.TrimPrefix(repo, "did:web:"), ":")
		host, _ := url.PathUnescape(segments[0])
		docURL = "https://" + host + "/.well-known/did.json"
		if len(segments) > 1 {
			docURL = "https://" + host + "/" + strings.Join(segments[1:], "/") + "/did.json"
		}
	}
	bases := []string{}
	pds := ""
	if docURL != "" && r.getJSON(ctx, docURL, &doc) == nil && doc.ID == repo {
		for _, service := range doc.Service {
			endpoint, ok := service.Endpoint.(string)
			if !ok {
				continue
			}
			if service.Type == "AtprotoPersonalDataServer" {
				pds = endpoint
			}
			if strings.HasSuffix(service.Type, "AppView") || service.ID == "#bsky_appview" || service.ID == "#atproto_appview" {
				bases = append(bases, endpoint)
			}
		}
	}
	bases = append(bases, r.appViewBases...)
	if parts[1] == "app.bsky.feed.post" {
		for _, base := range bases {
			var payload struct {
				Posts []struct {
					Record struct{ Text string }
					Author struct{ Handle string }
					Embed  struct {
						Images []struct{ Fullsize string }
						Thumb  string
					}
				}
			}
			if r.getJSON(ctx, xrpc(base, "app.bsky.feed.getPosts", url.Values{"uris[0]": {uri}}), &payload) == nil && len(payload.Posts) > 0 {
				p := payload.Posts[0]
				f := bskyFields(p.Record.Text, p.Author.Handle)
				if len(p.Embed.Images) > 0 {
					f.Image = p.Embed.Images[0].Fullsize
				} else {
					f.Image = p.Embed.Thumb
				}
				return f, nil
			}
		}
	}
	if pds == "" {
		return Fields{}, errors.New("pds_not_found")
	}
	var record struct{ Value map[string]any }
	if err := r.getJSON(ctx, xrpc(pds, "com.atproto.repo.getRecord", url.Values{"repo": {repo}, "collection": {parts[1]}, "rkey": {parts[2]}}), &record); err != nil {
		return Fields{}, err
	}
	v := record.Value
	str := func(k string) string { s, _ := v[k].(string); return s }
	if parts[1] == "app.bsky.feed.post" {
		return bskyFields(str("text"), ""), nil
	}
	if wrapper(uri) {
		return Fields{Title: decode(str("title")), Description: decode(str("excerpt")), Image: str("image"), SiteName: decode(str("site")), Author: decode(str("author"))}, nil
	}
	return Fields{Title: first(str("title"), truncate(str("text"), 160), str("name"))}, nil
}
func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}
func bskyFields(text, handle string) Fields {
	handle = strings.TrimPrefix(strings.TrimSpace(handle), "@")
	a := ""
	if handle != "" {
		a = "@" + handle
	}
	return Fields{Title: strings.TrimSpace(truncate(text, 160)), SiteName: handle, Author: a}
}
