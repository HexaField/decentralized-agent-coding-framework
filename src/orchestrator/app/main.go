package main

import (
    "log"
    "net/http"
    cfg "orchestrator/config"
)

func main() {
    mux := http.NewServeMux()
    // prefer consolidated handlers in this package
    registerHandlers(mux)
    addr := ":8080"
    log.Printf("orchestrator starting on %s (mode=%s)", addr, cfg.GetSchedulerMode())
    if err := http.ListenAndServe(addr, mux); err != nil {
        log.Fatal(err)
    }
}
