package main

import (
    "encoding/json"
    "errors"
    "io"
    "log"
    "net/http"
    "os"
    "os/exec"
    "sync"
    "time"
)

type Health struct {
    Status string `json:"status"`
    Host   string `json:"host"`
}

type Task struct {
    ID        string    `json:"id"`
    Org       string    `json:"org"`
    Text      string    `json:"text"`
    Status    string    `json:"status"`
    AgentHint string    `json:"agentHint,omitempty"`
    CreatedAt time.Time `json:"createdAt"`
    AgentID   string    `json:"agentId,omitempty"`
}

type Agent struct {
    Name   string            `json:"name"`
    Org    string            `json:"org"`
    Labels map[string]string `json:"labels,omitempty"`
    Status string            `json:"status"`
    LastSeen time.Time       `json:"lastSeen"`
}

var (
    tasksMu sync.RWMutex
    tasks   = make(map[string]Task)

    agentsMu sync.RWMutex
    agents   = make(map[string]Agent)

    taskLogsMu sync.RWMutex
    taskLogs   = make(map[string][]string)

    agentLogsMu sync.RWMutex
    agentLogs   = make(map[string][]string)

    // SSE subscribers
    taskSubsMu sync.Mutex
    taskSubs   = make(map[string]map[chan string]struct{}) // id -> set of channels
    agentSubsMu sync.Mutex
    agentSubs   = make(map[string]map[chan string]struct{}) // name -> set of channels
)

func bearerOrHeaderToken(r *http.Request) string {
    // Prefer header X-Auth-Token, fallback to Authorization: Bearer <token>
    if t := r.Header.Get("X-Auth-Token"); t != "" { return t }
    if auth := r.Header.Get("Authorization"); auth != "" {
        const p = "Bearer "
        if len(auth) > len(p) && auth[:len(p)] == p { return auth[len(p):] }
    }
    return ""
}

func requireToken(next http.HandlerFunc, envVar string) http.HandlerFunc {
    required := os.Getenv(envVar)
    return func(w http.ResponseWriter, r *http.Request) {
        if required == "" { next(w, r); return }
        if token := bearerOrHeaderToken(r); token == required {
            next(w, r)
            return
        }
        http.Error(w, "unauthorized", http.StatusUnauthorized)
    }
}

func decodeJSON[T any](r *http.Request, v *T) error {
    b, err := io.ReadAll(r.Body)
    if err != nil { return err }
    if len(b) == 0 { return errors.New("empty body") }
    return json.Unmarshal(b, v)
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

    mux.HandleFunc("/schedule", requireToken(func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost { http.Error(w, "method", 405); return }
        var req struct { Org string `json:"org"`; Task string `json:"task"`; AgentHint string `json:"agentHint,omitempty"` }
        if err := decodeJSON(r, &req); err != nil { http.Error(w, err.Error(), 400); return }
        if req.Org == "" || req.Task == "" { http.Error(w, "missing org/task", 400); return }
        id := time.Now().Format("20060102-150405.000")
        t := Task{ID: id, Org: req.Org, Text: req.Task, Status: "scheduled", AgentHint: req.AgentHint, CreatedAt: time.Now()}
        tasksMu.Lock(); tasks[id] = t; tasksMu.Unlock()
        log.Printf("scheduled task id=%s org=%s text=%q", id, req.Org, req.Task)
        writeJSON(w, t)
    }, "ORCHESTRATOR_TOKEN"))

    mux.HandleFunc("/tasks", func(w http.ResponseWriter, r *http.Request) {
        tasksMu.RLock(); defer tasksMu.RUnlock()
        out := make([]Task, 0, len(tasks))
        for _, t := range tasks { out = append(out, t) }
        writeJSON(w, out)
    })
    mux.HandleFunc("/tasks/claim", func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost { http.Error(w, "method", 405); return }
        var req struct{ Org, AgentID string }
        if err := decodeJSON(r, &req); err != nil { http.Error(w, err.Error(), 400); return }
        if req.Org == "" || req.AgentID == "" { http.Error(w, "missing org/agentId", 400); return }
        // prefer tasks that hint this agent, otherwise first scheduled task for org
        tasksMu.Lock(); defer tasksMu.Unlock()
        // pass 1: agent-hinted
        for id, t := range tasks {
            if t.Org == req.Org && t.Status == "scheduled" && t.AgentHint == req.AgentID {
                t.Status = "running"; t.AgentID = req.AgentID; tasks[id] = t
                writeJSON(w, t); return
            }
        }
        // pass 2: any scheduled
        for id, t := range tasks {
            if t.Org == req.Org && t.Status == "scheduled" {
                t.Status = "running"; t.AgentID = req.AgentID; tasks[id] = t
                writeJSON(w, t); return
            }
        }
        writeJSON(w, map[string]any{"task": nil})
    })
    mux.HandleFunc("/tasks/update", func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost { http.Error(w, "method", 405); return }
        var req struct{ ID, Status, Log string }
        if err := decodeJSON(r, &req); err != nil { http.Error(w, err.Error(), 400); return }
        if req.ID == "" || req.Status == "" { http.Error(w, "missing id/status", 400); return }
        tasksMu.Lock(); defer tasksMu.Unlock()
        t, ok := tasks[req.ID]; if !ok { http.Error(w, "not found", 404); return }
        t.Status = req.Status; tasks[req.ID] = t
        writeJSON(w, t)
    })
    mux.HandleFunc("/tasks/log", func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost { http.Error(w, "method", 405); return }
        var req struct{ ID, Line string }
        if err := decodeJSON(r, &req); err != nil { http.Error(w, err.Error(), 400); return }
        if req.ID == "" { http.Error(w, "missing id", 400); return }
    if req.Line != "" { appendTaskLog(req.ID, req.Line); broadcastTask(req.ID, req.Line) }
        log.Printf("task[%s]: %s", req.ID, req.Line)
        w.WriteHeader(204)
    })
    mux.HandleFunc("/tasks/logs", func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodGet { http.Error(w, "method", 405); return }
        id := r.URL.Query().Get("id")
        if id == "" { http.Error(w, "missing id", 400); return }
        taskLogsMu.RLock(); lines := append([]string(nil), taskLogs[id]...); taskLogsMu.RUnlock()
        writeJSON(w, map[string]any{"id": id, "lines": lines})
    })
    // SSE: task logs
    mux.HandleFunc("/events/tasks", func(w http.ResponseWriter, r *http.Request) {
        id := r.URL.Query().Get("id")
        if id == "" { http.Error(w, "missing id", 400); return }
        w.Header().Set("Content-Type", "text/event-stream")
        w.Header().Set("Cache-Control", "no-cache")
        w.Header().Set("Connection", "keep-alive")
        flusher, ok := w.(http.Flusher); if !ok { http.Error(w, "no flusher", 500); return }
        ch := make(chan string, 16)
        addTaskSub(id, ch); defer removeTaskSub(id, ch)
        // send backlog
        taskLogsMu.RLock(); for _, ln := range taskLogs[id] { io.WriteString(w, "data: "+ln+"\n\n") }; taskLogsMu.RUnlock(); flusher.Flush()
        notify := w.(http.CloseNotifier).CloseNotify()
        for {
            select {
            case ln := <-ch:
                io.WriteString(w, "data: "+ln+"\n\n"); flusher.Flush()
            case <-notify:
                return
            }
        }
    })
    mux.HandleFunc("/agents", func(w http.ResponseWriter, r *http.Request) {
        agentsMu.RLock(); defer agentsMu.RUnlock()
        out := make([]Agent, 0, len(agents))
        for _, a := range agents { out = append(out, a) }
        writeJSON(w, out)
    })
    mux.HandleFunc("/agents/register", func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost { http.Error(w, "method", 405); return }
        var req struct{ Name, Org string; Labels map[string]string }
        if err := decodeJSON(r, &req); err != nil { http.Error(w, err.Error(), 400); return }
        if req.Name == "" || req.Org == "" { http.Error(w, "missing name/org", 400); return }
        a := Agent{Name: req.Name, Org: req.Org, Labels: req.Labels, Status: "idle", LastSeen: time.Now()}
        agentsMu.Lock(); agents[req.Name] = a; agentsMu.Unlock()
        writeJSON(w, a)
    })
    mux.HandleFunc("/agents/heartbeat", func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost { http.Error(w, "method", 405); return }
        var req struct{ Name, Org, Status string }
        if err := decodeJSON(r, &req); err != nil { http.Error(w, err.Error(), 400); return }
        if req.Name == "" { http.Error(w, "missing name", 400); return }
        agentsMu.Lock(); a := agents[req.Name]; a.Name = req.Name; if req.Org != "" { a.Org = req.Org }; if req.Status != "" { a.Status = req.Status }; a.LastSeen = time.Now(); agents[req.Name] = a; agentsMu.Unlock()
        writeJSON(w, map[string]string{"ok":"1"})
    })
    mux.HandleFunc("/agents/log", func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost { http.Error(w, "method", 405); return }
        var req struct{ Name, Line string }
        if err := decodeJSON(r, &req); err != nil { http.Error(w, err.Error(), 400); return }
        if req.Name == "" { http.Error(w, "missing name", 400); return }
    if req.Line != "" { appendAgentLog(req.Name, req.Line); broadcastAgent(req.Name, req.Line) }
        log.Printf("agent[%s]: %s", req.Name, req.Line)
        w.WriteHeader(204)
    })
    mux.HandleFunc("/agents/logs", func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodGet { http.Error(w, "method", 405); return }
        name := r.URL.Query().Get("name")
        if name == "" { http.Error(w, "missing name", 400); return }
        agentLogsMu.RLock(); lines := append([]string(nil), agentLogs[name]...); agentLogsMu.RUnlock()
        writeJSON(w, map[string]any{"name": name, "lines": lines})
    })
    // Dev: ensure an agent exists by shelling out to deploy script
    mux.HandleFunc("/agents/ensure", requireToken(func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost { http.Error(w, "method", 405); return }
        var req struct{ Org, Prompt string }
        if err := decodeJSON(r, &req); err != nil { http.Error(w, err.Error(), 400); return }
        if req.Org == "" { http.Error(w, "missing org", 400); return }
        // run script
        cmd := exec.Command("bash", "/scripts/deploy_agent.sh", req.Org, req.Prompt)
        out, err := cmd.CombinedOutput()
        if err != nil { http.Error(w, string(out), 500); return }
        writeJSON(w, map[string]string{"ok":"1", "output": string(out)})
    }, "ORCHESTRATOR_TOKEN"))
    // SSE: agent logs
    mux.HandleFunc("/events/agents", func(w http.ResponseWriter, r *http.Request) {
        name := r.URL.Query().Get("name")
        if name == "" { http.Error(w, "missing name", 400); return }
        w.Header().Set("Content-Type", "text/event-stream")
        w.Header().Set("Cache-Control", "no-cache")
        w.Header().Set("Connection", "keep-alive")
        flusher, ok := w.(http.Flusher); if !ok { http.Error(w, "no flusher", 500); return }
        ch := make(chan string, 16)
        addAgentSub(name, ch); defer removeAgentSub(name, ch)
        // send backlog
        agentLogsMu.RLock(); for _, ln := range agentLogs[name] { io.WriteString(w, "data: "+ln+"\n\n") }; agentLogsMu.RUnlock(); flusher.Flush()
        notify := w.(http.CloseNotifier).CloseNotify()
        for {
            select {
            case ln := <-ch:
                io.WriteString(w, "data: "+ln+"\n\n"); flusher.Flush()
            case <-notify:
                return
            }
        }
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

func appendTaskLog(id, line string) {
    taskLogsMu.Lock(); defer taskLogsMu.Unlock()
    b := append(taskLogs[id], time.Now().Format(time.RFC3339)+" "+line)
    if len(b) > 200 { b = b[len(b)-200:] }
    taskLogs[id] = b
}

func appendAgentLog(name, line string) {
    agentLogsMu.Lock(); defer agentLogsMu.Unlock()
    b := append(agentLogs[name], time.Now().Format(time.RFC3339)+" "+line)
    if len(b) > 200 { b = b[len(b)-200:] }
    agentLogs[name] = b
}

func addTaskSub(id string, ch chan string) {
    taskSubsMu.Lock(); defer taskSubsMu.Unlock()
    m := taskSubs[id]; if m == nil { m = make(map[chan string]struct{}); taskSubs[id] = m }
    m[ch] = struct{}{}
}
func removeTaskSub(id string, ch chan string) {
    taskSubsMu.Lock(); defer taskSubsMu.Unlock()
    if m := taskSubs[id]; m != nil { delete(m, ch) }
}
func broadcastTask(id, ln string) {
    taskSubsMu.Lock(); m := taskSubs[id]; taskSubsMu.Unlock()
    for ch := range m { select { case ch <- ln: default: } }
}

func addAgentSub(name string, ch chan string) {
    agentSubsMu.Lock(); defer agentSubsMu.Unlock()
    m := agentSubs[name]; if m == nil { m = make(map[chan string]struct{}); agentSubs[name] = m }
    m[ch] = struct{}{}
}
func removeAgentSub(name string, ch chan string) {
    agentSubsMu.Lock(); defer agentSubsMu.Unlock()
    if m := agentSubs[name]; m != nil { delete(m, ch) }
}
func broadcastAgent(name, ln string) {
    agentSubsMu.Lock(); m := agentSubs[name]; agentSubsMu.Unlock()
    for ch := range m { select { case ch <- ln: default: } }
}
