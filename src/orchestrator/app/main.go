package main

import (
    "log"
    "net/http"
    api "orchestrator/app/api"
)

func main() {
    mux := http.NewServeMux()
    // prefer consolidated handlers in this package
    registerHandlers(mux)
    // also register API package handlers if present (no conflict on duplicate routes)
    api.RegisterHandlers(mux)
    addr := ":8080"
    log.Printf("orchestrator starting on %s", addr)
    if err := http.ListenAndServe(addr, mux); err != nil {
        log.Fatal(err)
    }
}
