package bookmarks

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"github.com/CountableNewt/latr-link/services/go-backend/internal/auth"
	"io"
	"net/http"
	"strings"
	"testing"
)

type transport func(*http.Request) (*http.Response, error)

func (f transport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

type fakeRepo struct {
	records  map[string]Record
	writes   [][]map[string]any
	conflict bool
}

func (f *fakeRepo) library() *Library {
	return New(auth.Context{DID: "did:plc:test", PDSEndpoint: "https://pds.example", SignatureVerified: true, UpstreamProofs: auth.NewProofPool(strings.Repeat("a."+base64.RawURLEncoding.EncodeToString([]byte(`{"htu":"https://pds.example/xrpc/com.atproto.repo.applyWrites","htm":"POST"}`))+".sig,", 100))}, &http.Client{Transport: transport(func(r *http.Request) (*http.Response, error) {
		var body any
		status := 200
		switch strings.TrimPrefix(r.URL.Path, "/xrpc/") {
		case "com.atproto.repo.listRecords":
			rs := []Record{}
			for _, v := range f.records {
				if collection(v) == r.URL.Query().Get("collection") {
					rs = append(rs, v)
				}
			}
			body = map[string]any{"records": rs}
		case "com.atproto.repo.getRecord":
			uri := "at://did:plc:test/" + r.URL.Query().Get("collection") + "/" + r.URL.Query().Get("rkey")
			v, ok := f.records[uri]
			if ok {
				body = v
			} else {
				status = 404
				body = map[string]any{"error": "RecordNotFound"}
			}
		case "com.atproto.repo.applyWrites":
			var input struct{ Writes []map[string]any }
			_ = json.NewDecoder(r.Body).Decode(&input)
			f.writes = append(f.writes, input.Writes)
			if f.conflict {
				status = 409
				body = map[string]any{"error": "InvalidSwap"}
				break
			}
			for _, w := range input.Writes {
				uri := "at://did:plc:test/" + str(w, "collection") + "/" + str(w, "rkey")
				if strings.HasSuffix(str(w, "$type"), "#delete") {
					delete(f.records, uri)
				} else {
					f.records[uri] = Record{URI: uri, CID: "new", Value: w["value"].(map[string]any)}
				}
			}
			body = map[string]any{}
		default:
			tpanic := r.URL.String()
			panic(tpanic)
		}
		b, _ := json.Marshal(body)
		return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(string(b))), Header: make(http.Header)}, nil
	})})
}
func rec(col, k string, v map[string]any) Record {
	return Record{URI: "at://did:plc:test/" + col + "/" + k, CID: "cid-" + k, Value: v}
}
func fixture(rs ...Record) *fakeRepo {
	f := &fakeRepo{records: map[string]Record{}}
	for _, r := range rs {
		f.records[r.URI] = r
	}
	return f
}
func TestMigrationPreservesExistingUnknownFieldsAndKnownMetadata(t *testing.T) {
	b := rec(Collection, "b", map[string]any{"$type": Collection, "subject": "https://example.com", "createdAt": "2025", "tags": []string{"existing"}, "future": map[string]any{"kept": true}})
	m := rec(MetadataCollection, "b", map[string]any{"$type": MetadataCollection, "bookmarkUri": b.URI, "subject": "https://example.com", "state": "archived", "note": "note", "futureMetadata": true})
	legacy := rec("link.latr.saved.item", "old", map[string]any{"$type": "link.latr.saved.item", "subjectUri": "https://example.com", "savedAt": "2024", "state": "unread", "tags": []string{"new"}, "note": "note", "lastOpenedAt": "2026", "previewTitle": "known preview field"})
	f := fixture(b, m, legacy)
	out, e := f.library().Migrate(context.Background(), 25, "")
	if e != nil {
		t.Fatal(e)
	}
	if out["retired"] != 1 || out["reused"] != 1 {
		t.Fatalf("summary %#v", out)
	}
	bv := f.records[b.URI].Value
	mv := f.records[m.URI].Value
	if bv["future"] == nil || bv["createdAt"] != "2024" || mv["futureMetadata"] != true || mv["state"] != "archived" || mv["lastOpenedAt"] != "2026" {
		t.Fatalf("lost data: %#v %#v", bv, mv)
	}
	for _, w := range f.writes[0] {
		if str(w, "$type") != "com.atproto.repo.applyWrites#create" && w["swapRecord"] == nil {
			t.Fatalf("missing CAS %#v", w)
		}
	}
}
func TestMigrationSkipsUnknownLegacyFieldsAndConflictingNotes(t *testing.T) {
	for _, v := range []map[string]any{{"future": "must not discard"}, {"note": "different"}} {
		b := rec(Collection, "b", map[string]any{"subject": "https://example.com", "createdAt": "2024"})
		m := rec(MetadataCollection, "b", metadata(b.URI, "https://example.com", "unread"))
		m.Value["note"] = "original"
		lv := map[string]any{"subjectUri": "https://example.com", "savedAt": "2025"}
		for k, x := range v {
			lv[k] = x
		}
		old := rec("link.latr.saved.item", "old", lv)
		f := fixture(b, m, old)
		summary, e := f.library().Migrate(context.Background(), 25, "")
		if e != nil || summary["skippedConflict"] != 1 || len(f.writes) != 0 {
			t.Fatalf("unsafe migration %#v %v", summary, e)
		}
		if _, ok := f.records[old.URI]; !ok {
			t.Fatal("legacy lost")
		}
	}
}
func TestMigrationCASConflictRetainsLegacy(t *testing.T) {
	old := rec("link.latr.saved.item", "old", map[string]any{"subjectUri": "https://example.com", "savedAt": "2025"})
	f := fixture(old)
	f.conflict = true
	summary, e := f.library().Migrate(context.Background(), 25, "")
	if e != nil || summary["created"] != 0 || summary["retired"] != 0 || summary["skippedConflict"] != 1 {
		t.Fatalf("%#v %v", summary, e)
	}
	if _, ok := f.records[old.URI]; !ok {
		t.Fatal("lost source")
	}
}
func TestSaveUsesTIDAndMergesWithoutDroppingUnknown(t *testing.T) {
	f := fixture()
	l := f.library()
	v, e := l.Save(context.Background(), "https://example.com", []string{" a ", "a"})
	if e != nil {
		t.Fatal(e)
	}
	uri := v["uri"].(string)
	if len(key(uri)) != 13 {
		t.Fatal(uri)
	}
	b := f.records[uri]
	b.Value["future"] = true
	f.records[uri] = b
	_, e = l.Save(context.Background(), "https://example.com", []string{"b"})
	if e != nil {
		t.Fatal(e)
	}
	if f.records[uri].Value["future"] != true || len(arr(f.records[uri].Value, "tags")) != 2 {
		t.Fatal(f.records[uri])
	}
}
func TestDeleteDoesNotRemoveMismatchedMetadata(t *testing.T) {
	b := rec(Collection, "b", map[string]any{"subject": "https://example.com"})
	m := rec(MetadataCollection, "b", metadata(b.URI, "https://other.example", "unread"))
	f := fixture(b, m)
	if e := f.library().Delete(context.Background(), b.URI); e != nil {
		t.Fatal(e)
	}
	if _, ok := f.records[m.URI]; !ok {
		t.Fatal("deleted unrelated metadata")
	}
}
func TestTagMutationVerificationAndUnknownFields(t *testing.T) {
	b := rec(Collection, "b", map[string]any{"subject": "https://example.com", "tags": []string{"old", "new"}, "future": true})
	f := fixture(b)
	l := f.library()
	s, e := l.RenameTag(context.Background(), "old", "new", 25, "")
	if e != nil || s["cursor"] != "v:" {
		t.Fatalf("%#v %v", s, e)
	}
	s, e = l.RenameTag(context.Background(), "old", "new", 25, "v:")
	if e != nil || s["cursor"] != nil {
		t.Fatalf("%#v %v", s, e)
	}
	if f.records[b.URI].Value["future"] != true || len(arr(f.records[b.URI].Value, "tags")) != 1 {
		t.Fatal(f.records[b.URI])
	}
	if _, e = l.DeleteTag(context.Background(), "x", 25, "bad"); e == nil {
		t.Fatal("accepted invalid cursor")
	}
}

func TestCanonicalBookmarkAndMismatchedMetadata(t *testing.T) {
	first := rec(Collection, "z", map[string]any{"subject": "https://example.com", "createdAt": "2024"})
	later := rec(Collection, "a", map[string]any{"subject": "https://example.com", "createdAt": "2025"})
	bad := rec(MetadataCollection, "z", metadata(first.URI, "https://unrelated.example", "archived"))
	f := fixture(first, later, bad)
	out, e := f.library().Get(context.Background(), " https://example.com ")
	if e != nil {
		t.Fatal(e)
	}
	v := out["bookmark"].(map[string]any)
	if v["uri"] != first.URI || v["metadataRecord"] != nil {
		t.Fatalf("%#v", v)
	}
	if e = f.library().SetState(context.Background(), first.URI, "archived"); e == nil {
		t.Fatal("updated mismatched metadata")
	}
	if len(f.writes) != 0 {
		t.Fatal("unexpected writes")
	}
}
func TestStateAndTagsPreserveExtensions(t *testing.T) {
	b := rec(Collection, "b", map[string]any{"subject": "https://example.com", "tags": []string{"old"}, "future": true})
	m := rec(MetadataCollection, "b", metadata(b.URI, "https://example.com", "unread"))
	m.Value["custom"] = map[string]any{"preserve": true}
	f := fixture(b, m)
	l := f.library()
	if e := l.SetState(context.Background(), b.URI, "archived"); e != nil {
		t.Fatal(e)
	}
	if f.records[m.URI].Value["custom"] == nil {
		t.Fatal("lost extension")
	}
	if _, e := l.SetTags(context.Background(), b.URI, []string{}); e != nil {
		t.Fatal(e)
	}
	if f.records[b.URI].Value["tags"] != nil || f.records[b.URI].Value["future"] != true {
		t.Fatal("tag update lost data")
	}
	if _, e := l.SetTags(context.Background(), "at://did:plc:other/"+Collection+"/b", []string{"x"}); e == nil {
		t.Fatal("accepted foreign URI")
	}
}
func TestSyncMetadataLeavesConflictsAndCreatesMissing(t *testing.T) {
	a := rec(Collection, "a", map[string]any{"subject": "https://a.example"})
	b := rec(Collection, "b", map[string]any{"subject": "https://b.example"})
	m := rec(MetadataCollection, "a", metadata(a.URI, "https://conflict.example", "archived"))
	f := fixture(a, b, m)
	s, e := f.library().SyncMetadata(context.Background(), 100, "")
	if e != nil || s["created"] != 1 || s["skippedConflict"] != 1 {
		t.Fatalf("%#v %v", s, e)
	}
	if str(f.records[m.URI].Value, "subject") != "https://conflict.example" {
		t.Fatal("overwrote conflict")
	}
}
func TestMigrationGroupsDuplicatesUsesOriginalURLAndPreservesNotes(t *testing.T) {
	w := rec("com.latr.saved.external", "w", map[string]any{"url": "https://example.com/?tracking=1", "normalizedUrl": "https://example.com/", "title": "title"})
	a := rec("link.latr.saved.item", "a", map[string]any{"subjectUri": w.URI, "savedAt": "2023", "state": "archived", "note": " kept ", "tags": []string{"a"}})
	b := rec("com.latr.saved.item", "b", map[string]any{"subjectUri": w.URI, "savedAt": "2024", "state": "unread", "note": "kept", "tags": []string{"b"}})
	f := fixture(w, a, b)
	l := f.library()
	s, e := l.Migrate(context.Background(), 25, "")
	if e != nil || s["duplicates"] != 1 || s["retired"] != 3 || s["created"] != 1 {
		t.Fatalf("%#v %v", s, e)
	}
	v, e := l.Get(context.Background(), "https://example.com/?tracking=1")
	if e != nil {
		t.Fatal(e)
	}
	view := v["bookmark"].(map[string]any)
	meta := view["metadataRecord"].(*Record)
	if str(meta.Value, "note") != "kept" || str(meta.Value, "state") != "unread" || len(arr(meta.Value, "legacyItemUris")) != 2 {
		t.Fatal(meta)
	}
}
func TestMigrationSubjectCursor(t *testing.T) {
	a := rec("link.latr.saved.item", "a", map[string]any{"subjectUri": "https://a.example", "savedAt": "2023"})
	b := rec("link.latr.saved.item", "b", map[string]any{"subjectUri": "https://b.example", "savedAt": "2024"})
	f := fixture(a, b)
	l := f.library()
	s, e := l.Migrate(context.Background(), 1, "")
	if e != nil || s["cursor"] != "https://a.example" {
		t.Fatalf("%#v %v", s, e)
	}
	s, e = l.Migrate(context.Background(), 1, s["cursor"].(string))
	if e != nil || s["cursor"] != nil || s["created"] != 1 {
		t.Fatalf("%#v %v", s, e)
	}
}
func TestTagLimitsCountGraphemeClusters(t *testing.T) {
	tag := strings.Repeat("👨‍👩‍👧‍👦", 20)
	if _, e := normalize([]string{tag}); e != nil {
		t.Fatal("family emoji should count as one grapheme", e)
	}
	if _, e := normalize([]string{strings.Repeat("a", 65)}); e == nil {
		t.Fatal("accepted over 64 graphemes")
	}
	if _, e := normalize([]string{strings.Repeat("👨‍👩‍👧‍👦", 26)}); e == nil {
		t.Fatal("accepted over 640 bytes")
	}
}

func TestUnverifiedViewerCannotReadWithoutPDSProof(t *testing.T) {
	f := fixture()
	l := f.library()
	l.client.Auth.SignatureVerified = false
	if _, e := l.List(context.Background(), 25, "", ""); e == nil {
		t.Fatal("unverified token read without upstream proof")
	}
	if _, e := l.Get(context.Background(), "https://example.com"); e == nil {
		t.Fatal("unverified token read without upstream proof")
	}
	if _, e := l.owned(context.Background(), "at://did:plc:test/"+Collection+"/key"); e == nil {
		t.Fatal("unverified token read record without upstream proof")
	}
}
