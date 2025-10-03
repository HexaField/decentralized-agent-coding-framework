package k8s

import (
    "context"
    "time"

    corev1 "k8s.io/api/core/v1"
    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
    "k8s.io/apimachinery/pkg/labels"
    "k8s.io/apimachinery/pkg/selection"
    "k8s.io/client-go/kubernetes"
)

type AgentStatus struct {
    Name      string `json:"name"`
    Namespace string `json:"namespace"`
    Desired   int32  `json:"desired"`
    Ready     int32  `json:"ready"`
    Available int32  `json:"available"`
    PodsTotal int    `json:"podsTotal"`
    PodsReady int    `json:"podsReady"`
    Phase     string `json:"phase"`
}

func GetAgentStatus(ctx context.Context, cs *kubernetes.Clientset, ns, name string) (*AgentStatus, error) {
    dep, err := cs.AppsV1().Deployments(ns).Get(ctx, name, metav1.GetOptions{})
    if err != nil { return nil, err }
    as := &AgentStatus{Name: name, Namespace: ns}
    as.Desired = *dep.Spec.Replicas
    as.Ready = dep.Status.ReadyReplicas
    as.Available = dep.Status.AvailableReplicas

    // List pods by label app=name
    req, _ := labels.NewRequirement("app", selection.Equals, []string{name})
    sel := labels.NewSelector().Add(*req)
    pods, err := cs.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{LabelSelector: sel.String()})
    if err == nil {
        as.PodsTotal = len(pods.Items)
        ready := 0
        for _, p := range pods.Items {
            if isPodReady(&p) { ready++ }
        }
        as.PodsReady = ready
    }
    // Derive a simple phase
    switch {
    case as.Available >= as.Desired && as.Desired > 0:
        as.Phase = "ready"
    case as.Ready > 0:
        as.Phase = "starting"
    default:
        as.Phase = "pending"
    }
    return as, nil
}

// WaitForDeploymentReady polls deployment readiness until desired replicas are available or context times out.
func WaitForDeploymentReady(ctx context.Context, cs *kubernetes.Clientset, ns, name string, interval time.Duration) (*AgentStatus, error) {
    if interval <= 0 { interval = 1 * time.Second }
    ticker := time.NewTicker(interval); defer ticker.Stop()
    for {
        st, err := GetAgentStatus(ctx, cs, ns, name)
        if err == nil && st.Available >= st.Desired && st.Desired > 0 {
            return st, nil
        }
        select {
        case <-ctx.Done():
            if err != nil { return nil, err }
            return st, ctx.Err()
        case <-ticker.C:
        }
    }
}

func isPodReady(p *corev1.Pod) bool {
    for _, c := range p.Status.Conditions {
        if c.Type == corev1.PodReady && c.Status == corev1.ConditionTrue {
            return true
        }
    }
    return false
}
