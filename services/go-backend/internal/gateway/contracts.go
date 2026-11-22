package gateway

import (
	"encoding/json"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/CountableNewt/latr-link/services/go-backend/internal/httpx"
	"github.com/rivo/uniseg"
)

type field struct {
	Kind                                 string
	Required                             bool
	Min, Max, Default, Length, Graphemes int
	Enum                                 []string
}
type contract struct {
	Verb   string
	Fields map[string]field
}

func invalid(message string) error { return httpx.NewError(400, "invalid_request", message) }
func input(r *http.Request, c contract) (map[string]any, error) {
	out := map[string]any{}
	if c.Verb == "GET" {
		q, err := url.ParseQuery(r.URL.RawQuery)
		if err != nil {
			return nil, invalid("Invalid query encoding")
		}
		for k, values := range q {
			f, ok := c.Fields[k]
			if !ok || len(values) != 1 {
				return nil, invalid("Unknown or repeated query parameter: " + k)
			}
			if f.Kind == "integer" {
				n, e := strconv.Atoi(values[0])
				if e != nil {
					return nil, invalid("Invalid integer: " + k)
				}
				out[k] = float64(n)
			} else {
				out[k] = strings.TrimSpace(values[0])
			}
		}
	} else {
		if r.URL.RawQuery != "" {
			return nil, invalid("Procedures do not accept query parameters")
		}
		media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || media != "application/json" {
			return nil, invalid("Content-Type must be application/json")
		}
		data, err := io.ReadAll(io.LimitReader(r.Body, (1<<20)+1))
		if err != nil || len(data) > 1<<20 {
			return nil, invalid("Input exceeds 1 MiB")
		}
		if err = json.Unmarshal(data, &out); err != nil || out == nil {
			return nil, invalid("Invalid JSON object")
		}
	}
	for k := range out {
		if _, ok := c.Fields[k]; !ok {
			return nil, invalid("Unknown input property: " + k)
		}
	}
	for k, f := range c.Fields {
		v, ok := out[k]
		if !ok {
			if f.Default != 0 {
				out[k] = float64(f.Default)
			} else if f.Required { // Legacy listItems historically defaults to 100.
				if k == "limit" && c.Verb == "GET" {
					out[k] = float64(100)
				} else {
					return nil, invalid(k + " is required")
				}
			}
			continue
		}
		switch f.Kind {
		case "string":
			s, yes := v.(string)
			if !yes || s == "" && f.Required || f.Length > 0 && len(s) > f.Length || f.Graphemes > 0 && uniseg.GraphemeClusterCount(s) > f.Graphemes {
				return nil, invalid("Invalid " + k)
			}
			if len(f.Enum) > 0 {
				found := false
				for _, value := range f.Enum {
					found = found || s == value
				}
				if !found {
					return nil, invalid("Invalid " + k)
				}
			}
		case "integer":
			n, yes := v.(float64)
			if !yes || n != float64(int(n)) || f.Min != 0 && n < float64(f.Min) || f.Max != 0 && n > float64(f.Max) {
				return nil, invalid("Invalid " + k)
			}
		case "array":
			a, yes := v.([]any)
			if !yes || f.Length > 0 && len(a) > f.Length {
				return nil, invalid("Invalid " + k)
			}
			for _, value := range a {
				s, yes := value.(string)
				if !yes || len(s) > 640 || uniseg.GraphemeClusterCount(s) > 64 {
					return nil, invalid("Invalid " + k)
				}
			}
		}
	}
	return out, nil
}
func str(m map[string]any, key string) string { v, _ := m[key].(string); return v }
func num(m map[string]any, key string, fallback int) int {
	v, ok := m[key].(float64)
	if !ok {
		return fallback
	}
	return int(v)
}
func tags(m map[string]any) []string {
	v, ok := m["tags"].([]any)
	if !ok {
		return nil
	}
	out := make([]string, len(v))
	for i, x := range v {
		out[i], _ = x.(string)
	}
	return out
}
