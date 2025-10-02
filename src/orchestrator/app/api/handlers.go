package main

import (
    "encoding/json"
    "fmt"
    "io"
    "log"
    "net/http"
    "os"
)

type Health struct {
    Status string `json:"status"`
    Host   string `json:"host"`
}

func registerHandlers(mux *http.ServeMux) {
    mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
        h := Health{Status: "ok", Host: hostname()}
        writeJSON(w, h)
    })

    mux.HandleFunc("/peers", func(w http.ResponseWriter, r *http.Request) {
        peers := []string{}
        writeJSON(w, map[string]any{"peers": peers})
    })

    mux.HandleFunc("/clusters", func(w http.ResponseWriter, r *http.Request) {
        clusters := []map[string]string{}
        writeJSON(w, map[string]any{"clusters": clusters})
    })

    mux.HandleFunc("/schedule", func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost { http.Error(w, "method", 405); return }
        body, _ := io.ReadAll(r.Body)
        log.Printf("schedule request: %s", string(body))
        writeJSON(w, map[string]any{"status":"scheduled","agent":"agent-demo"})
    })

    mux.HandleFunc("/tasks", func(w http.ResponseWriter, r *http.Request) {
        writeJSON(w, []any{})
    })
    mux.HandleFunc("/agents", func(w http.ResponseWriter, r *http.Request) {
        writeJSON(w, []any{})
    })
}

func writeJSON(w http.ResponseWriter, v any) {
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(v)
}

func hostname() string {
    h, _ := os.Hostname()
    return h
}
