package main

import (
    "log"
    "net/http"
)

func main() {
    mux := http.NewServeMux()
    registerHandlers(mux)
    addr := ":8080"
    log.Printf("orchestrator starting on %s", addr)
    if err := http.ListenAndServe(addr, mux); err != nil {
        log.Fatal(err)
    }
}
