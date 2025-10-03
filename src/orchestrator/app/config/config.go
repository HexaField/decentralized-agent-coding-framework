package config

import (
    "os"
    "strings"
)

// Scheduler mode (single): CRD/operator only
const (
    ModeCRDOperator = "crd-operator"
)

// GetSchedulerMode returns the scheduler mode (CRD/operator only).
func GetSchedulerMode() string {
    _ = strings.TrimSpace(os.Getenv("SCHEDULER_MODE")) // ignored
    return ModeCRDOperator
}
