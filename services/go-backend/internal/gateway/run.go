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
	server := &http.Server{Addr: ":" + port, Handler: handler, ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 60 * time.Second, WriteTimeout: 60 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 1 << 20}
	log.Printf("latr-%s listening on :%s", kind, port)
	log.Fatal(server.ListenAndServe())
}
