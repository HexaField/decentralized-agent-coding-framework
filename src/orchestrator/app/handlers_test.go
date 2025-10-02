package main

import (
    "bytes"
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "os"
    "testing"
)

func newServer() *http.ServeMux {
    mux := http.NewServeMux()
    registerHandlers(mux)
    return mux
}

func TestHealth(t *testing.T) {
    srv := newServer()
    rr := httptest.NewRecorder()
    req := httptest.NewRequest("GET", "/health", nil)
    srv.ServeHTTP(rr, req)
    if rr.Code != 200 {
        t.Fatalf("unexpected status: %d", rr.Code)
    }
}

func TestScheduleAuthAndValidation(t *testing.T) {
    os.Setenv("ORCHESTRATOR_TOKEN", "secret")
    defer os.Unsetenv("ORCHESTRATOR_TOKEN")
    srv := newServer()

    // Missing token
    rr := httptest.NewRecorder()
    body := bytes.NewBufferString(`{"org":"acme","task":"hello"}`)
    req := httptest.NewRequest("POST", "/schedule", body)
    srv.ServeHTTP(rr, req)
    if rr.Code != 401 { t.Fatalf("expected 401, got %d", rr.Code) }

    // With token
    rr = httptest.NewRecorder()
    body = bytes.NewBufferString(`{"org":"acme","task":"hello"}`)
    req = httptest.NewRequest("POST", "/schedule", body)
    req.Header.Set("X-Auth-Token", "secret")
    srv.ServeHTTP(rr, req)
    if rr.Code != 200 { t.Fatalf("expected 200, got %d", rr.Code) }
    var resp map[string]any
    if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
        t.Fatalf("invalid json: %v", err)
    }
    if resp["status"] != "scheduled" { t.Fatalf("unexpected status: %v", resp["status"]) }
}
