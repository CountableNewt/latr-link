package metadata

import (
	"encoding/json"
	"html"
	"net/url"
	"strings"
	"unicode/utf8"

	htmlparse "golang.org/x/net/html"
)

type Fields struct {
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
	Image       string `json:"image,omitempty"`
	SiteName    string `json:"siteName,omitempty"`
	Author      string `json:"author,omitempty"`
}

func decode(s string) string {
	for i := 0; i < 3; i++ {
		next := html.UnescapeString(s)
		if next == s {
			break
		}
		s = next
	}
	// Publisher markup sometimes encodes JSON unicode escapes inside an HTML attribute.
	if strings.Contains(s, `\u`) {
		if b, err := json.Marshal(s); err == nil {
			b = []byte(strings.ReplaceAll(string(b), `\\u`, `\u`))
			var d string
			if json.Unmarshal(b, &d) == nil {
				s = d
			}
		}
	}
	return strings.Join(strings.Fields(s), " ")
}
func first(values ...string) string {
	for _, v := range values {
		if v = decode(v); v != "" {
			return v
		}
	}
	return ""
}
func merge(a, b Fields) Fields {
	return Fields{first(a.Title, b.Title), first(a.Description, b.Description), first(a.Image, b.Image), first(a.SiteName, b.SiteName), first(a.Author, b.Author)}
}
func hostname(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")
}
func absolute(base, raw string) string {
	if strings.TrimSpace(raw) == "" {
		return ""
	}
	u, err := url.Parse(decode(raw))
	if err != nil {
		return ""
	}
	b, err := url.Parse(base)
	if err != nil {
		return ""
	}
	u = b.ResolveReference(u)
	if u.Scheme != "http" && u.Scheme != "https" {
		return ""
	}
	if u.User != nil {
		return ""
	}
	return u.String()
}
func author(s string) string {
	s = decode(s)
	if strings.HasPrefix(strings.ToLower(s), "https://") || strings.HasPrefix(strings.ToLower(s), "http://") {
		return ""
	}
	return s
}

type markup struct {
	meta  map[string]string
	links map[string]string
	title string
	ld    []any
	uris  []string
}

func scan(raw string) markup {
	out := markup{meta: map[string]string{}, links: map[string]string{}}
	z := htmlparse.NewTokenizer(strings.NewReader(raw))
	var textFor string
	for {
		switch z.Next() {
		case htmlparse.ErrorToken:
			return out
		case htmlparse.StartTagToken, htmlparse.SelfClosingTagToken:
			token := z.Token()
			attrs := map[string]string{}
			for _, a := range token.Attr {
				attrs[strings.ToLower(a.Key)] = a.Val
			}
			switch token.Data {
			case "meta":
				key := strings.ToLower(first(attrs["property"], attrs["name"]))
				if out.meta[key] == "" {
					out.meta[key] = decode(attrs["content"])
				}
				if strings.HasPrefix(attrs["content"], "at://") {
					out.uris = append(out.uris, attrs["content"])
				}
			case "link":
				rel := strings.ToLower(attrs["rel"])
				if out.links[rel] == "" {
					out.links[rel] = attrs["href"]
				}
				if rel == "author" && out.meta["link:author"] == "" {
					out.meta["link:author"] = attrs["title"]
				}
				if strings.HasPrefix(attrs["href"], "at://") {
					out.uris = append(out.uris, attrs["href"])
				}
			case "title":
				textFor = "title"
			case "script":
				if strings.EqualFold(attrs["type"], "application/ld+json") {
					textFor = "ld"
				}
			}
		case htmlparse.TextToken:
			text := string(z.Text())
			if textFor == "title" && out.title == "" {
				out.title = decode(text)
			}
			if textFor == "ld" {
				var v any
				if json.Unmarshal([]byte(text), &v) == nil {
					out.ld = append(out.ld, v)
				}
			}
		case htmlparse.EndTagToken:
			textFor = ""
		}
	}
}
func ldMetadata(v any) (title, image, name string) {
	switch t := v.(type) {
	case []any:
		for _, entry := range t {
			a, b, c := ldMetadata(entry)
			title = first(title, a)
			image = first(image, b)
			name = first(name, c)
		}
	case map[string]any:
		str := func(key string) string { s, _ := t[key].(string); return s }
		title = first(str("headline"), str("title"))
		switch im := t["image"].(type) {
		case string:
			image = im
		case map[string]any:
			image, _ = im["url"].(string)
		case []any:
			if len(im) > 0 {
				if s, ok := im[0].(string); ok {
					image = s
				}
			}
		}
		image = first(image, str("thumbnailUrl"))
		var authorName func(any) string
		authorName = func(a any) string {
			switch x := a.(type) {
			case string:
				return author(x)
			case map[string]any:
				s, _ := x["name"].(string)
				return author(s)
			case []any:
				for _, entry := range x {
					if s := authorName(entry); s != "" {
						return s
					}
				}
			}
			return ""
		}
		name = authorName(t["author"])
		if graph, ok := t["@graph"]; ok {
			a, b, c := ldMetadata(graph)
			title = first(title, a)
			image = first(image, b)
			name = first(name, c)
		}
	}
	return
}
func parseScope(raw, pageURL string) Fields {
	s := scan(raw)
	m := s.meta
	var ldTitle, ldImage, ldAuthor string
	for _, ld := range s.ld {
		a, b, c := ldMetadata(ld)
		ldTitle = first(ldTitle, a)
		ldImage = first(ldImage, b)
		ldAuthor = first(ldAuthor, c)
	}
	return Fields{
		Title:       first(m["og:title"], m["twitter:title"], ldTitle, s.title),
		Description: first(m["og:description"], m["twitter:description"], m["description"]),
		Image:       absolute(pageURL, first(m["og:image"], m["og:image:secure_url"], m["og:image:url"], m["twitter:image"], m["twitter:image:src"], s.links["image_src"], ldImage)),
		SiteName:    m["og:site_name"],
		Author:      first(author(m["og:author"]), author(m["author"]), author(m["article:author"]), author(m["twitter:creator"]), author(m["dc.creator"]), author(m["link:author"]), ldAuthor),
	}
}
func head(raw string) string {
	lower := strings.ToLower(raw)
	if end := strings.Index(lower, "</head>"); end >= 0 {
		return raw[:end+7]
	}
	if len(raw) > 300000 {
		return raw[:300000]
	}
	return raw
}

// Parse prioritizes head metadata and falls back to document metadata for incomplete cards.
func Parse(raw, pageURL string) Fields {
	return merge(parseScope(head(raw), pageURL), parseScope(raw, pageURL))
}
func CanonicalAtURI(raw string) string {
	raw = strings.TrimSpace(raw)
	if !strings.HasPrefix(raw, "at://") {
		return ""
	}
	parts := strings.Split(strings.TrimPrefix(raw, "at://"), "/")
	if len(parts) < 3 || parts[0] == "" || parts[1] == "" || parts[2] == "" {
		return ""
	}
	if strings.ContainsAny(raw, "\r\n\t ") {
		return ""
	}
	return raw
}
func wrapper(raw string) bool {
	return strings.Contains(raw, "/link.latr.saved.external/") || strings.Contains(raw, "/com.latr.saved.external/")
}

// ExtractAtURI preserves document order while preferring a native record over an external wrapper.
func ExtractAtURI(raw string) string {
	var fallback string
	for _, uri := range scan(head(raw)).uris {
		uri = CanonicalAtURI(decode(uri))
		if uri == "" {
			continue
		}
		if !wrapper(uri) {
			return uri
		}
		if fallback == "" {
			fallback = uri
		}
	}
	return fallback
}
func humanize(s string) string {
	s, _ = url.PathUnescape(s)
	words := strings.FieldsFunc(s, func(r rune) bool { return r == '-' || r == '_' })
	for i, w := range words {
		r, n := utf8.DecodeRuneInString(w)
		words[i] = strings.ToUpper(string(r)) + w[n:]
	}
	return strings.Join(words, " ")
}
func fallback(raw string) Fields {
	u, _ := url.Parse(raw)
	if u == nil {
		return Fields{}
	}
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	title := hostname(raw)
	if len(parts) > 0 && parts[len(parts)-1] != "" {
		title = humanize(parts[len(parts)-1])
	}
	return Fields{Title: title, SiteName: hostname(raw)}
}
func enrich(f Fields, raw string) Fields {
	f.SiteName = first(f.SiteName, hostname(raw))
	f.Title = first(f.Title, f.SiteName)
	return f
}
func weakTitle(f Fields, raw string) bool {
	lower := strings.ToLower(strings.TrimSpace(f.Title))
	if lower == "" || lower == strings.ToLower(f.SiteName) || lower == hostname(raw) {
		return true
	}
	switch lower {
	case "home", "homepage", "the verge", "verge", "news", "latest":
		return true
	}
	return strings.EqualFold(f.Title, fallback(raw).Title)
}
func quality(f Fields, raw string) int {
	score := 0
	if f.Image != "" {
		score += 4
	}
	if !weakTitle(f, raw) {
		score += 3
	}
	if f.Description != "" {
		score++
	}
	if f.Author != "" {
		score++
	}
	return score
}
