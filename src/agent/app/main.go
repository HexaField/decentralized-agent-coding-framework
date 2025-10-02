package main

import (
    "bytes"
    "encoding/json"
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
    for {
        // claim a task
        var claimReq = map[string]string{"org": org, "agentID": agentID}
        b,_ := json.Marshal(claimReq)
        req, _ := http.NewRequest("POST", orchURL+"/tasks/claim", bytes.NewReader(b))
        req.Header.Set("Content-Type","application/json")
        if orchTok != "" { req.Header.Set("X-Auth-Token", orchTok) }
        resp, err := client.Do(req)
        if err != nil { time.Sleep(3*time.Second); continue }
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
        PullContext()
        logUpdate("running", "context pulled")
        RunTask(taskText)
        logUpdate("running", "task execution complete")
        OpenPR()
        logUpdate("completed", "PR opened; task done")
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
