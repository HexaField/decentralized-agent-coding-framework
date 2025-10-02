package main

import (
    "log"
    "os/exec"
)

func RunTask(task string) {
    log.Printf("running task via spec-kit stub: %s", task)
    cmd := exec.Command("/app/spec-kit/cli_wrapper.sh", "new-task", task)
    _ = cmd.Run()
}
