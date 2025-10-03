package main

import (
    "bytes"
    "encoding/json"
    "net/http/httptest"
    "os"
    "testing"
)

func TestScheduleStatusCancel_ScriptMode(t *testing.T) {
    os.Setenv("ORCHESTRATOR_TOKEN", "secret")
    os.Setenv("SCHEDULER_MODE", "script")
    defer os.Unsetenv("ORCHESTRATOR_TOKEN")
    defer os.Unsetenv("SCHEDULER_MODE")

    srv := newServer()

    // schedule
    body := bytes.NewBufferString(`{"org":"acme","task":"hello"}`)
    req := httptest.NewRequest("POST", "/schedule", body)
    req.Header.Set("X-Auth-Token", "secret")
    rr := httptest.NewRecorder()
    srv.ServeHTTP(rr, req)
    if rr.Code != 200 {
        t.Fatalf("schedule expected 200, got %d", rr.Code)
    }
    var sresp map[string]any
    if err := json.Unmarshal(rr.Body.Bytes(), &sresp); err != nil { t.Fatal(err) }
    id, _ := sresp["id"].(string)
    if id == "" { t.Fatalf("missing task id in response") }

    // status
    rr = httptest.NewRecorder()
    req = httptest.NewRequest("GET", "/tasks/status?id="+id, nil)
    srv.ServeHTTP(rr, req)
    if rr.Code != 200 {
        t.Fatalf("status expected 200, got %d", rr.Code)
    }
    var st map[string]any
    if err := json.Unmarshal(rr.Body.Bytes(), &st); err != nil { t.Fatal(err) }
    if _, ok := st["task"]; !ok { t.Fatalf("expected task in status response") }

    // cancel
    rr = httptest.NewRecorder()
    cbody := bytes.NewBufferString(`{"id":"` + id + `"}`)
    req = httptest.NewRequest("POST", "/tasks/cancel", cbody)
    req.Header.Set("X-Auth-Token", "secret")
    srv.ServeHTTP(rr, req)
    if rr.Code != 200 {
        t.Fatalf("cancel expected 200, got %d", rr.Code)
    }
    var c map[string]any
    if err := json.Unmarshal(rr.Body.Bytes(), &c); err != nil { t.Fatal(err) }
    if c["status"] != "cancelled" { t.Fatalf("expected cancelled status, got %v", c["status"]) }
}

func TestK8sPrepare_ValidationAndAuth(t *testing.T) {
    os.Setenv("ORCHESTRATOR_TOKEN", "secret")
    defer os.Unsetenv("ORCHESTRATOR_TOKEN")
    srv := newServer()

    // Missing token
    rr := httptest.NewRecorder()
    req := httptest.NewRequest("POST", "/k8s/prepare", bytes.NewBufferString(`{"org":"acme"}`))
    srv.ServeHTTP(rr, req)
    if rr.Code != 401 { t.Fatalf("expected 401, got %d", rr.Code) }

    // With token but missing org
    rr = httptest.NewRecorder()
    req = httptest.NewRequest("POST", "/k8s/prepare", bytes.NewBufferString(`{}`))
    req.Header.Set("X-Auth-Token", "secret")
    srv.ServeHTTP(rr, req)
    if rr.Code != 400 { t.Fatalf("expected 400, got %d", rr.Code) }

    // With token and org but no kubeconfig should 500
    rr = httptest.NewRecorder()
    req = httptest.NewRequest("POST", "/k8s/prepare", bytes.NewBufferString(`{"org":"acme"}`))
    req.Header.Set("X-Auth-Token", "secret")
    srv.ServeHTTP(rr, req)
    if rr.Code < 400 { t.Fatalf("expected error status, got %d", rr.Code) }
}
