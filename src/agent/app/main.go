package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "os"
    "time"
)

func main() {
    org := os.Getenv("ORG_NAME")
    agentID := getHostname()
    orchURL := os.Getenv("ORCHESTRATOR_URL")
    orchTok := os.Getenv("ORCHESTRATOR_TOKEN")
    if orchURL == "" { orchURL = "http://host.k3d.internal:18080" }
    log.Printf("agent starting for org=%s", org)
    client := &http.Client{ Timeout: 10 * time.Second }
    // connectivity check
    if err := getHealth(client, orchURL); err != nil {
        log.Printf("orchestrator health check failed: %v", err)
    } else {
        log.Printf("connected to orchestrator at %s", orchURL)
    }
    // register once
    postJSON(client, orchURL+"/agents/register", orchTok, map[string]any{"name": agentID, "org": org})
    for {
        // heartbeat idle
        postJSON(client, orchURL+"/agents/heartbeat", orchTok, map[string]any{"name": agentID, "org": org, "status": "idle"})
        // claim a task
        var claimReq = map[string]string{"org": org, "agentID": agentID}
        b,_ := json.Marshal(claimReq)
        req, _ := http.NewRequest("POST", orchURL+"/tasks/claim", bytes.NewReader(b))
        req.Header.Set("Content-Type","application/json")
        if orchTok != "" { req.Header.Set("X-Auth-Token", orchTok) }
        resp, err := client.Do(req)
        if err != nil { log.Printf("claim error: %v", err); time.Sleep(3*time.Second); continue }
    var claimed map[string]any
        json.NewDecoder(resp.Body).Decode(&claimed); resp.Body.Close()
    // detect presence of a claimed task by id field
    taskID := getString(claimed["id"])
    if taskID == "" {
            time.Sleep(5*time.Second)
            continue
        }
    taskText := getString(claimed["text"])
        logUpdate := func(status, line string){
            // status
            sr := map[string]string{"id": taskID, "status": status}
            sb,_ := json.Marshal(sr)
            rq,_ := http.NewRequest("POST", orchURL+"/tasks/update", bytes.NewReader(sb))
            rq.Header.Set("Content-Type","application/json"); if orchTok != "" { rq.Header.Set("X-Auth-Token", orchTok) }
            client.Do(rq)
            if line != "" {
                lr := map[string]string{"id": taskID, "line": line}
                lb,_ := json.Marshal(lr)
                rq2,_ := http.NewRequest("POST", orchURL+"/tasks/log", bytes.NewReader(lb))
                rq2.Header.Set("Content-Type","application/json"); if orchTok != "" { rq2.Header.Set("X-Auth-Token", orchTok) }
                client.Do(rq2)
            }
        }
    logUpdate("running", "claimed task")
    postJSON(client, orchURL+"/agents/heartbeat", orchTok, map[string]any{"name": agentID, "org": org, "status": "running"})
    PullContext(); postJSON(client, orchURL+"/agents/log", orchTok, map[string]any{"name": agentID, "line": "context pulled"})
        logUpdate("running", "context pulled")
    RunTask(taskText); postJSON(client, orchURL+"/agents/log", orchTok, map[string]any{"name": agentID, "line": "task executed"})
        logUpdate("running", "task execution complete")
    OpenPR(); postJSON(client, orchURL+"/agents/log", orchTok, map[string]any{"name": agentID, "line": "PR opened"})
        logUpdate("completed", "PR opened; task done")
    postJSON(client, orchURL+"/agents/heartbeat", orchTok, map[string]any{"name": agentID, "org": org, "status": "idle"})
    }
}

func getHostname() string {
    h, _ := os.Hostname()
    return h
}

func getString(v any) string {
    if s, ok := v.(string); ok { return s }
    return ""
}

func postJSON(client *http.Client, url, token string, body any) {
    b,_ := json.Marshal(body)
    req,_ := http.NewRequest("POST", url, bytes.NewReader(b))
    req.Header.Set("Content-Type","application/json")
    if token != "" { req.Header.Set("X-Auth-Token", token) }
    resp, err := client.Do(req)
    if err != nil {
        log.Printf("POST %s error: %v", url, err)
        return
    }
    defer resp.Body.Close()
    if resp.StatusCode >= 300 {
        log.Printf("POST %s status: %s", url, resp.Status)
    }
}

func getHealth(client *http.Client, orchURL string) error {
    req, _ := http.NewRequest("GET", orchURL+"/health", nil)
    resp, err := client.Do(req)
    if err != nil { return err }
    defer resp.Body.Close()
    if resp.StatusCode >= 300 { return fmt.Errorf("status %s", resp.Status) }
    return nil
}
