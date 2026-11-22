// Package bookmarks manages protocol records directly on the viewer's PDS.
package bookmarks

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"errors"
	"github.com/CountableNewt/latr-link/services/go-backend/internal/auth"
	"github.com/CountableNewt/latr-link/services/go-backend/internal/httpx"
	"github.com/CountableNewt/latr-link/services/go-backend/internal/pds"
	"github.com/rivo/uniseg"
	"net/http"
	"net/url"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const Collection = "community.lexicon.bookmarks.bookmark"
const MetadataCollection = "link.latr.bookmarks.metadata"

type Record struct {
	URI   string         `json:"uri"`
	CID   string         `json:"cid"`
	Value map[string]any `json:"value"`
}
type page struct {
	Records []Record `json:"records"`
	Cursor  string   `json:"cursor,omitempty"`
}
type Library struct {
	repo   string
	client *pds.Client
}

func New(a auth.Context, c *http.Client) *Library { return &Library{a.DID, pds.New(a, c)} }
func invalid(code string) error                   { return httpx.NewError(400, code, code) }
func missing() error                              { return httpx.NewError(404, "bookmark_not_found", "Bookmark not found") }
func str(m map[string]any, k string) string       { s, _ := m[k].(string); return s }
func arr(m map[string]any, k string) []string {
	switch a := m[k].(type) {
	case []string:
		return append([]string{}, a...)
	case []any:
		r := []string{}
		for _, v := range a {
			if s, ok := v.(string); ok {
				r = append(r, s)
			}
		}
		return r
	}
	return nil
}
func clone(m map[string]any) map[string]any {
	r := map[string]any{}
	for k, v := range m {
		r[k] = v
	}
	return r
}
func key(uri string) string {
	parts := strings.Split(uri, "/")
	if len(parts) != 5 || parts[0] != "at:" || parts[4] == "" {
		return ""
	}
	return parts[4]
}
func bound(n, max int) int {
	if n < 1 {
		return 1
	}
	if n > max {
		return max
	}
	return n
}
func unique(a []string) []string {
	r := []string{}
	seen := map[string]bool{}
	for _, s := range a {
		if !seen[s] {
			seen[s] = true
			r = append(r, s)
		}
	}
	return r
}
func sortedUnique(a []string) []string { r := unique(a); sort.Strings(r); return r }
func contains(a []string, s string) bool {
	for _, v := range a {
		if v == s {
			return true
		}
	}
	return false
}
func normalize(a []string) ([]string, error) {
	if len(a) > 100 {
		return nil, invalid("too_many_tags")
	}
	r := []string{}
	for _, s := range a {
		s = strings.TrimSpace(s)
		if s == "" || len(s) > 640 || uniseg.GraphemeClusterCount(s) > 64 {
			return nil, invalid("invalid_tag")
		}
		r = append(r, s)
	}
	return unique(r), nil
}
func subject(s string) (string, error) {
	s = strings.TrimSpace(s)
	if len(s) > 8192 {
		return "", invalid("invalid_url")
	}
	if strings.HasPrefix(s, "at://") && len(strings.Split(s, "/")) >= 5 {
		return s, nil
	}
	u, e := url.Parse(s)
	if e != nil || (strings.ToLower(u.Scheme) != "http" && strings.ToLower(u.Scheme) != "https") {
		return "", invalid("invalid_url")
	}
	return s, nil
}
func (l *Library) list(ctx context.Context, col string, limit int, cursor string) (page, error) {
	q := url.Values{"repo": {l.repo}, "collection": {col}, "limit": {strconv.Itoa(limit)}}
	if cursor != "" {
		q.Set("cursor", cursor)
	}
	var p page
	e := l.client.Call(ctx, "com.atproto.repo.listRecords", "GET", q, nil, &p, !l.client.Auth.SignatureVerified)
	return p, e
}
func (l *Library) all(ctx context.Context, col string) ([]Record, error) {
	r := []Record{}
	cursor := ""
	seen := map[string]bool{}
	for {
		p, e := l.list(ctx, col, 100, cursor)
		if e != nil {
			return nil, e
		}
		r = append(r, p.Records...)
		if p.Cursor == "" {
			return r, nil
		}
		if seen[p.Cursor] {
			return nil, invalid("invalid_repository_cursor")
		}
		seen[p.Cursor] = true
		cursor = p.Cursor
	}
}
func (l *Library) record(ctx context.Context, col, k string) (*Record, error) {
	var r Record
	e := l.client.Call(ctx, "com.atproto.repo.getRecord", "GET", url.Values{"repo": {l.repo}, "collection": {col}, "rkey": {k}}, nil, &r, !l.client.Auth.SignatureVerified)
	if errors.Is(e, pds.ErrNotFound) {
		return nil, nil
	}
	return &r, e
}
func write(col, k string, value map[string]any, old *Record) map[string]any {
	action := "create"
	if old != nil {
		action = "update"
	}
	w := map[string]any{"$type": "com.atproto.repo.applyWrites#" + action, "collection": col, "rkey": k, "value": value}
	if old != nil {
		w["swapRecord"] = old.CID
	}
	return w
}
func deletion(col string, r Record) map[string]any {
	return map[string]any{"$type": "com.atproto.repo.applyWrites#delete", "collection": col, "rkey": key(r.URI), "swapRecord": r.CID}
}
func (l *Library) apply(ctx context.Context, w []map[string]any) error {
	if len(w) == 0 {
		return nil
	}
	e := l.client.Call(ctx, "com.atproto.repo.applyWrites", "POST", nil, map[string]any{"repo": l.repo, "writes": w}, nil, true)
	if errors.Is(e, pds.ErrConflict) {
		return httpx.NewError(409, "conflict", "Records changed; retry the operation")
	}
	return e
}
func matches(m, b Record) bool {
	return str(m.Value, "bookmarkUri") == b.URI && str(m.Value, "subject") == str(b.Value, "subject")
}
func view(b Record, m *Record) map[string]any {
	r := map[string]any{"uri": b.URI, "cid": b.CID, "value": b.Value}
	if m != nil && matches(*m, b) {
		r["metadataRecord"] = m
	}
	return r
}
func (l *Library) find(ctx context.Context, s string) (*Record, *Record, error) {
	records, e := l.all(ctx, Collection)
	if e != nil {
		return nil, nil, e
	}
	var selected *Record
	for _, r := range records {
		r := r
		if str(r.Value, "subject") == s && (selected == nil || str(r.Value, "createdAt") < str(selected.Value, "createdAt") || (str(r.Value, "createdAt") == str(selected.Value, "createdAt") && r.URI < selected.URI)) {
			selected = &r
		}
	}
	if selected == nil {
		return nil, nil, nil
	}
	m, e := l.record(ctx, MetadataCollection, key(selected.URI))
	if m != nil && !matches(*m, *selected) {
		m = nil
	}
	return selected, m, e
}
func (l *Library) Get(ctx context.Context, s string) (map[string]any, error) {
	s, e := subject(s)
	if e != nil {
		return nil, e
	}
	b, m, e := l.find(ctx, s)
	if e != nil {
		return nil, e
	}
	var v any
	if b != nil {
		v = view(*b, m)
	}
	return map[string]any{"bookmark": v}, nil
}
func (l *Library) List(ctx context.Context, limit int, cursor, tag string) (map[string]any, error) {
	if tag != "" {
		t, e := normalize([]string{tag})
		if e != nil {
			return nil, e
		}
		tag = t[0]
	}
	p, e := l.list(ctx, Collection, bound(limit, 100), cursor)
	if e != nil {
		return nil, e
	}
	ms, e := l.all(ctx, MetadataCollection)
	if e != nil {
		return nil, e
	}
	by := map[string]*Record{}
	for _, m := range ms {
		m := m
		by[key(m.URI)] = &m
	}
	records := []map[string]any{}
	for _, b := range p.Records {
		if key(b.URI) == "" {
			return nil, invalid("invalid_stored_record")
		}
		if tag == "" || contains(arr(b.Value, "tags"), tag) {
			records = append(records, view(b, by[key(b.URI)]))
		}
	}
	r := map[string]any{"bookmarks": records}
	if p.Cursor != "" {
		r["cursor"] = p.Cursor
	}
	return r, nil
}

var tidMu sync.Mutex
var lastTID uint64

func tid() string {
	tidMu.Lock()
	defer tidMu.Unlock()
	v := uint64(time.Now().UnixMicro()) << 10
	var entropy [2]byte
	_, _ = rand.Read(entropy[:])
	v |= uint64(binary.BigEndian.Uint16(entropy[:]) & 1023)
	if v <= lastTID {
		v = lastTID + 1
	}
	lastTID = v
	alphabet := "234567abcdefghijklmnopqrstuvwxyz"
	b := make([]byte, 13)
	for i := 12; i >= 0; i-- {
		b[i] = alphabet[v&31]
		v >>= 5
	}
	return string(b)
}
func metadata(uri, s, state string) map[string]any {
	return map[string]any{"$type": MetadataCollection, "bookmarkUri": uri, "subject": s, "state": state}
}
func putTags(v map[string]any, t []string) {
	if len(t) == 0 {
		delete(v, "tags")
	} else {
		v["tags"] = t
	}
}
func (l *Library) Save(ctx context.Context, s string, tags []string) (map[string]any, error) {
	s, e := subject(s)
	if e != nil {
		return nil, e
	}
	var stable []string
	if tags != nil {
		stable, e = normalize(tags)
		if e != nil {
			return nil, e
		}
	}
	b, m, e := l.find(ctx, s)
	if e != nil {
		return nil, e
	}
	w := []map[string]any{}
	if b != nil {
		k := key(b.URI)
		if tags != nil {
			merged, e := normalize(unique(append(arr(b.Value, "tags"), stable...)))
			if e != nil {
				return nil, e
			}
			next := clone(b.Value)
			putTags(next, merged)
			if !reflect.DeepEqual(arr(next, "tags"), arr(b.Value, "tags")) {
				w = append(w, write(Collection, k, next, b))
			}
		}
		if m == nil {
			w = append(w, write(MetadataCollection, k, metadata(b.URI, s, "unread"), nil))
		}
	} else {
		k := tid()
		uri := "at://" + l.repo + "/" + Collection + "/" + k
		v := map[string]any{"$type": Collection, "subject": s, "createdAt": time.Now().UTC().Format(time.RFC3339Nano)}
		putTags(v, stable)
		w = append(w, write(Collection, k, v, nil), write(MetadataCollection, k, metadata(uri, s, "unread"), nil))
	}
	if e = l.apply(ctx, w); e != nil {
		return nil, e
	}
	b, m, e = l.find(ctx, s)
	if e != nil {
		return nil, e
	}
	if b == nil {
		return nil, invalid("invalid_stored_record")
	}
	return view(*b, m), nil
}
func (l *Library) owned(ctx context.Context, uri string) (*Record, error) {
	k := key(uri)
	if k == "" {
		return nil, missing()
	}
	b, e := l.record(ctx, Collection, k)
	if e != nil {
		return nil, e
	}
	if b == nil || b.URI != uri {
		return nil, missing()
	}
	return b, nil
}
func (l *Library) SetTags(ctx context.Context, uri string, tags []string) (map[string]any, error) {
	tags, e := normalize(tags)
	if e != nil {
		return nil, e
	}
	b, e := l.owned(ctx, uri)
	if e != nil {
		return nil, e
	}
	next := clone(b.Value)
	putTags(next, tags)
	if !reflect.DeepEqual(arr(next, "tags"), arr(b.Value, "tags")) {
		if e = l.apply(ctx, []map[string]any{write(Collection, key(uri), next, b)}); e != nil {
			return nil, e
		}
	}
	b, e = l.owned(ctx, uri)
	if e != nil {
		return nil, e
	}
	m, e := l.record(ctx, MetadataCollection, key(uri))
	return view(*b, m), e
}
func (l *Library) SetState(ctx context.Context, uri, state string) error {
	if state != "unread" && state != "archived" {
		return invalid("invalid_state")
	}
	b, e := l.owned(ctx, uri)
	if e != nil {
		return e
	}
	m, e := l.record(ctx, MetadataCollection, key(uri))
	if e != nil {
		return e
	}
	next := metadata(uri, str(b.Value, "subject"), state)
	if m != nil {
		if !matches(*m, *b) {
			return invalid("invalid_stored_record")
		}
		next = clone(m.Value)
		next["state"] = state
	}
	return l.apply(ctx, []map[string]any{write(MetadataCollection, key(uri), next, m)})
}
func (l *Library) Delete(ctx context.Context, uri string) error {
	b, e := l.owned(ctx, uri)
	if e != nil {
		return e
	}
	m, e := l.record(ctx, MetadataCollection, key(uri))
	if e != nil {
		return e
	}
	w := []map[string]any{deletion(Collection, *b)}
	if m != nil && matches(*m, *b) {
		w = append(w, deletion(MetadataCollection, *m))
	}
	return l.apply(ctx, w)
}
func (l *Library) Tags(ctx context.Context, limit int, cursor string) (map[string]any, error) {
	p, e := l.list(ctx, Collection, bound(limit, 100), cursor)
	if e != nil {
		return nil, e
	}
	counts := map[string]int{}
	for _, r := range p.Records {
		for _, t := range unique(arr(r.Value, "tags")) {
			counts[t]++
		}
	}
	tags := []string{}
	for t := range counts {
		tags = append(tags, t)
	}
	sort.Strings(tags)
	out := []map[string]any{}
	for _, t := range tags {
		out = append(out, map[string]any{"tag": t, "count": counts[t]})
	}
	r := map[string]any{"tagCounts": out, "scanned": len(p.Records)}
	if p.Cursor != "" {
		r["cursor"] = p.Cursor
	}
	return r, nil
}
func (l *Library) RenameTag(ctx context.Context, source, target string, limit int, cursor string) (map[string]any, error) {
	t, e := normalize([]string{source, target})
	if e != nil {
		return nil, e
	}
	if len(t) != 2 {
		return nil, invalid("identical_rename")
	}
	return l.mutate(ctx, t[0], t[1], limit, cursor)
}
func (l *Library) DeleteTag(ctx context.Context, tag string, limit int, cursor string) (map[string]any, error) {
	t, e := normalize([]string{tag})
	if e != nil {
		return nil, e
	}
	return l.mutate(ctx, t[0], "", limit, cursor)
}
func (l *Library) mutate(ctx context.Context, source, target string, limit int, cursor string) (map[string]any, error) {
	phase := "m:"
	repoCursor := ""
	if cursor != "" {
		if !strings.HasPrefix(cursor, "m:") && !strings.HasPrefix(cursor, "v:") {
			return nil, invalid("invalid_tag_mutation_cursor")
		}
		phase = cursor[:2]
		repoCursor = cursor[2:]
	}
	p, e := l.list(ctx, Collection, bound(limit, 25), repoCursor)
	if e != nil {
		return nil, e
	}
	w := []map[string]any{}
	for _, b := range p.Records {
		tags := arr(b.Value, "tags")
		if !contains(tags, source) {
			continue
		}
		nextTags := []string{}
		for _, t := range tags {
			if t == source {
				if target != "" {
					nextTags = append(nextTags, target)
				}
			} else {
				nextTags = append(nextTags, t)
			}
		}
		next := clone(b.Value)
		putTags(next, unique(nextTags))
		w = append(w, write(Collection, key(b.URI), next, &b))
	}
	if e = l.apply(ctx, w); e != nil {
		return nil, e
	}
	r := map[string]any{"ok": true, "scanned": len(p.Records), "matched": len(w), "updated": len(w)}
	if phase == "m:" {
		if p.Cursor != "" {
			r["cursor"] = "m:" + p.Cursor
		} else {
			r["cursor"] = "v:"
		}
	} else if len(w) > 0 {
		r["cursor"] = "v:"
	} else if p.Cursor != "" {
		r["cursor"] = "v:" + p.Cursor
	}
	return r, nil
}
func (l *Library) SyncMetadata(ctx context.Context, limit int, cursor string) (map[string]any, error) {
	p, e := l.list(ctx, Collection, bound(limit, 100), cursor)
	if e != nil {
		return nil, e
	}
	ms, e := l.all(ctx, MetadataCollection)
	if e != nil {
		return nil, e
	}
	by := map[string]Record{}
	for _, m := range ms {
		by[key(m.URI)] = m
	}
	r := map[string]any{"ok": true, "scanned": len(p.Records), "created": 0, "reused": 0, "skippedConflict": 0}
	w := []map[string]any{}
	for _, b := range p.Records {
		k := key(b.URI)
		if k == "" {
			return nil, invalid("invalid_stored_record")
		}
		if m, ok := by[k]; ok {
			field := "skippedConflict"
			if matches(m, b) {
				field = "reused"
			}
			r[field] = r[field].(int) + 1
		} else {
			w = append(w, write(MetadataCollection, k, metadata(b.URI, str(b.Value, "subject"), "unread"), nil))
		}
	}
	if e = l.apply(ctx, w); e != nil {
		return nil, e
	}
	r["created"] = len(w)
	if p.Cursor != "" {
		r["cursor"] = p.Cursor
	}
	return r, nil
}
