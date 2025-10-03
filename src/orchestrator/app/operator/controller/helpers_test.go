package controller

import (
    "testing"
)

func TestDefaultIfEmpty(t *testing.T) {
    if got := defaultIfEmpty("", "x"); got != "x" { t.Fatalf("want x, got %q", got) }
    if got := defaultIfEmpty("y", "x"); got != "y" { t.Fatalf("want y, got %q", got) }
}
