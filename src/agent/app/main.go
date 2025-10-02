package main

import (
    "log"
    "os"
    "time"
)

func main() {
    task := os.Getenv("TASK_TEXT")
    org := os.Getenv("ORG_NAME")
    log.Printf("agent starting for org=%s task=%q", org, task)
    // Simulate: pull context, run spec-kit, codex stub, radicle stub
    PullContext()
    RunTask(task)
    OpenPR()
    log.Printf("agent completed task: %q", task)
    // keep running for code-server access
    for { time.Sleep(60 * time.Second) }
}
