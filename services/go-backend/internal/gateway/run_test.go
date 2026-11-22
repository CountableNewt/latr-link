package gateway

import (
	"net/http"
	"testing"
	"time"
)

func TestHTTPServerDeadlinesMatchIngressOwnership(t *testing.T) {
	handler := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})
	for _, tc := range []struct {
		name                      string
		serverless                bool
		header, body, write, idle time.Duration
	}{
		{"standalone", false, 10 * time.Second, 60 * time.Second, 60 * time.Second, 60 * time.Second},
		{"vercel freezes", true, 0, 0, 0, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := newHTTPServer(":8080", handler, tc.serverless)
			if server.ReadHeaderTimeout != tc.header || server.ReadTimeout != tc.body || server.WriteTimeout != tc.write || server.IdleTimeout != tc.idle {
				t.Fatalf("unexpected socket deadlines: header=%v read=%v write=%v idle=%v", server.ReadHeaderTimeout, server.ReadTimeout, server.WriteTimeout, server.IdleTimeout)
			}
			if server.Addr != ":8080" || server.Handler == nil || server.MaxHeaderBytes != 1<<20 {
				t.Fatal("server transport limits or handler lost")
			}
		})
	}
}
