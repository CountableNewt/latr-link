package bookmarks

import (
	"context"
	"errors"
	"github.com/CountableNewt/latr-link/services/go-backend/internal/httpx"
	"github.com/CountableNewt/latr-link/services/go-backend/internal/pds"
	"sort"
	"strings"
)

var itemKnown = known("$type subjectUri savedAt state tags note lastOpenedAt linkedWebUrl previewTitle previewExcerpt previewSite previewImage previewAuthor")
var externalKnown = known("$type url normalizedUrl fingerprint createdAt title excerpt site image language publishedAt author")

func known(s string) map[string]bool {
	m := map[string]bool{}
	for _, k := range strings.Fields(s) {
		m[k] = true
	}
	return m
}
func unknown(v map[string]any, fields map[string]bool) bool {
	for k := range v {
		if !fields[k] {
			return true
		}
	}
	return false
}
func web(s string) bool { return strings.HasPrefix(s, "https://") || strings.HasPrefix(s, "http://") }
func collection(r Record) string {
	p := strings.Split(r.URI, "/")
	if len(p) == 5 {
		return p[3]
	}
	return ""
}
func (l *Library) Migrate(ctx context.Context, limit int, cursor string) (map[string]any, error) {
	externals := map[string]Record{}
	for _, col := range []string{"link.latr.saved.external", "com.latr.saved.external"} {
		rs, e := l.all(ctx, col)
		if e != nil {
			return nil, e
		}
		for _, r := range rs {
			externals[r.URI] = r
		}
	}
	groups := map[string][]Record{}
	for _, col := range []string{"link.latr.saved.item", "com.latr.saved.item"} {
		rs, e := l.all(ctx, col)
		if e != nil {
			return nil, e
		}
		for _, r := range rs {
			s := str(r.Value, "subjectUri")
			if w, ok := externals[s]; ok {
				original := strings.TrimSpace(str(w.Value, "url"))
				if web(original) {
					s = original
				} else {
					s = str(w.Value, "normalizedUrl")
				}
			} else if linked := strings.TrimSpace(str(r.Value, "linkedWebUrl")); web(linked) {
				s = linked
			}
			if s != "" {
				groups[s] = append(groups[s], r)
			}
		}
	}
	subjects := []string{}
	cursor = strings.TrimSpace(cursor)
	for s := range groups {
		if cursor == "" || s > cursor {
			subjects = append(subjects, s)
		}
	}
	sort.Strings(subjects)
	remaining := len(subjects)
	if len(subjects) > bound(limit, 100) {
		subjects = subjects[:bound(limit, 100)]
	}
	summary := map[string]any{"ok": true, "scanned": 0, "created": 0, "reused": 0, "duplicates": 0, "skippedConflict": 0, "cached": 0, "retired": 0}
	add := func(k string, n int) { summary[k] = summary[k].(int) + n }
	for _, s := range subjects {
		items := groups[s]
		sort.Slice(items, func(i, j int) bool { return items[i].URI < items[j].URI })
		add("scanned", len(items))
		if len(items) > 1 {
			add("duplicates", len(items)-1)
		}
		wrappers := map[string]Record{}
		notes := []string{}
		tags := []string{}
		createdAt := ""
		lastOpened := ""
		state := "archived"
		legacy := []string{}
		conflict := false
		for _, r := range items {
			if unknown(r.Value, itemKnown) {
				conflict = true
			}
			if w, ok := externals[str(r.Value, "subjectUri")]; ok {
				wrappers[w.URI] = w
				if unknown(w.Value, externalKnown) {
					conflict = true
				}
			}
			if n := strings.TrimSpace(str(r.Value, "note")); n != "" {
				notes = append(notes, n)
			}
			tags = append(tags, arr(r.Value, "tags")...)
			at := str(r.Value, "savedAt")
			if createdAt == "" || at < createdAt {
				createdAt = at
			}
			if opened := str(r.Value, "lastOpenedAt"); opened > lastOpened {
				lastOpened = opened
			}
			if str(r.Value, "state") != "archived" {
				state = "unread"
			}
			legacy = append(legacy, r.URI)
		}
		notes = unique(notes)
		if len(notes) > 1 || conflict {
			add("skippedConflict", len(items))
			continue
		}
		b, m, e := l.find(ctx, s)
		if e != nil {
			return nil, e
		}
		k := tid()
		uri := "at://" + l.repo + "/" + Collection + "/" + k
		if b != nil {
			k = key(b.URI)
			uri = b.URI
		}
		note := ""
		if len(notes) > 0 {
			note = notes[0]
		}
		if m != nil {
			current := strings.TrimSpace(str(m.Value, "note"))
			if current != "" && note != "" && current != note {
				add("skippedConflict", len(items))
				continue
			}
		}
		next := map[string]any{"$type": Collection, "subject": s, "createdAt": createdAt}
		if b != nil {
			next = clone(b.Value)
			if old := str(next, "createdAt"); old != "" && old < createdAt {
				createdAt = old
			}
			next["createdAt"] = createdAt
			tags = append(tags, arr(b.Value, "tags")...)
		}
		next["tags"] = sortedUnique(tags)
		nm := metadata(uri, s, state)
		if m != nil {
			nm = clone(m.Value)
			if nm["state"] == nil {
				nm["state"] = state
			}
		}
		if nm["note"] == nil && note != "" {
			nm["note"] = note
		}
		if old := str(nm, "lastOpenedAt"); old > lastOpened {
			lastOpened = old
		}
		if lastOpened != "" {
			nm["lastOpenedAt"] = lastOpened
		}
		nm["legacyItemUris"] = sortedUnique(append(arr(nm, "legacyItemUris"), legacy...))
		writes := []map[string]any{write(Collection, k, next, b), write(MetadataCollection, k, nm, m)}
		for _, r := range items {
			writes = append(writes, deletion(collection(r), r))
		}
		uris := []string{}
		for uri := range wrappers {
			uris = append(uris, uri)
		}
		sort.Strings(uris)
		for _, uri := range uris {
			r := wrappers[uri]
			writes = append(writes, deletion(collection(r), r))
		}
		if e = l.apply(ctx, writes); e != nil {
			var failure *httpx.Error
			if errors.Is(e, pds.ErrConflict) || (errors.As(e, &failure) && failure.Status == 409) {
				add("skippedConflict", len(items))
				continue
			}
			return nil, e
		}
		if b == nil {
			add("created", 1)
		} else {
			add("reused", 1)
		}
		add("retired", len(items)+len(wrappers))
	}
	if len(subjects) < remaining && len(subjects) > 0 {
		summary["cursor"] = subjects[len(subjects)-1]
	}
	return summary, nil
}
