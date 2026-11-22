package gateway

import (
	"log"
	"net/http"
	"os"
	"time"
)

func Run(kind string) {
	handler, err := FromEnvironment(kind)
	if err != nil {
		log.Fatal(err)
	}
	port := os.Getenv("PORT")
	if port == "" {
		if kind == "metadata" {
			port = "8081"
		} else {
			port = "8080"
		}
	}
	server := newHTTPServer(":"+port, handler, os.Getenv("VERCEL") == "1")
	log.Printf("latr-%s listening on :%s serverless=%t", kind, port, os.Getenv("VERCEL") == "1")
	log.Fatal(server.ListenAndServe())
}

func newHTTPServer(address string, handler http.Handler, serverless bool) *http.Server {
	server := &http.Server{Addr: address, Handler: handler, MaxHeaderBytes: 1 << 20}
	if !serverless {
		server.ReadHeaderTimeout = 10 * time.Second
		server.ReadTimeout = 60 * time.Second
		server.WriteTimeout = 60 * time.Second
		server.IdleTimeout = 60 * time.Second
	}
	// Vercel owns public ingress and reuses a loopback connection across frozen
	// invocations. Socket deadlines survive a freeze and can close that connection
	// on thaw before the next request reaches our handler. Leave every transport
	// deadline unset there; ServeHTTP still bounds application work to 55 seconds.
	// In particular IdleTimeout=0 alone is insufficient if ReadTimeout is nonzero:
	// net/http uses ReadTimeout as its idle timeout fallback.
	return server
}
