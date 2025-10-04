package main

import (
    "bytes"
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "os"
    "path/filepath"
    "testing"
)

func TestMain(m *testing.M) {
    // Isolate HOME to a temp dir for tests
    tmp, err := os.MkdirTemp("", "guildnet-home-")
    if err != nil { panic(err) }
    oldHome := os.Getenv("HOME")
    oldUserProfile := os.Getenv("USERPROFILE")
    os.Setenv("HOME", tmp)
    os.Setenv("USERPROFILE", tmp)
    // Ensure ~/.guildnet/state exists for any code needing it
    _ = os.MkdirAll(filepath.Join(tmp, ".guildnet", "state"), 0o755)
    code := m.Run()
    // Restore and cleanup
    if oldHome == "" { os.Unsetenv("HOME") } else { _ = os.Setenv("HOME", oldHome) }
    if oldUserProfile == "" { os.Unsetenv("USERPROFILE") } else { _ = os.Setenv("USERPROFILE", oldUserProfile) }
    _ = os.RemoveAll(tmp)
    os.Exit(code)
}

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
