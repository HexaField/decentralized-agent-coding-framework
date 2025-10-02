package main

import (
    "log"
    "os/exec"
)

func OpenPR() {
    log.Printf("opening PR via radicle stub")
    cmd := exec.Command("/app/radicle/cli_wrapper.sh", "open-pr")
    _ = cmd.Run()
}
