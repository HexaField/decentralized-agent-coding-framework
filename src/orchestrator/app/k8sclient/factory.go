package k8sclient

import (
    "context"
    "fmt"
    "os"
    "path/filepath"
    "time"

    "k8s.io/client-go/kubernetes"
    "k8s.io/client-go/rest"
    "k8s.io/client-go/tools/clientcmd"
)

// KubeconfigPathForOrg resolves kubeconfig for a given org.
// Preference: env KUBECONFIG -> /state/kube/<org>.config -> ~/.kube/<org>.config
func KubeconfigPathForOrg(org string) string {
    if kc := os.Getenv("KUBECONFIG"); kc != "" {
        if _, err := os.Stat(kc); err == nil { return kc }
    }
    state := filepath.Join("/state/kube", org+".config")
    if _, err := os.Stat(state); err == nil { return state }
    home, _ := os.UserHomeDir()
    if home == "" { home = "/root" }
    homeCfg := filepath.Join(home, ".kube", org+".config")
    return homeCfg
}

// LoadForOrg returns a clientset and rest config for the org's cluster.
func LoadForOrg(org string) (*kubernetes.Clientset, *rest.Config, error) {
    path := KubeconfigPathForOrg(org)
    cfg, err := clientcmd.BuildConfigFromFlags("", path)
    if err != nil { return nil, nil, fmt.Errorf("build kubeconfig for %s: %w", org, err) }
    // Reasonable defaults
    cfg.Timeout = 15 * time.Second
    cs, err := kubernetes.NewForConfig(cfg)
    if err != nil { return nil, nil, fmt.Errorf("new clientset: %w", err) }
    return cs, cfg, nil
}

// Ping queries the server version as a lightweight reachability check.
func Ping(ctx context.Context, cs *kubernetes.Clientset) (string, error) {
    sv, err := cs.Discovery().ServerVersion()
    if err != nil { return "", err }
    return sv.GitVersion, nil
}
