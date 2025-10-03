package k8s

import (
    "context"
    "time"
    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
    "k8s.io/apimachinery/pkg/runtime/schema"
    "k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
    "k8s.io/client-go/dynamic"
    "k8s.io/client-go/rest"
    apierrors "k8s.io/apimachinery/pkg/api/errors"
)

var AgentTaskGVR = schema.GroupVersionResource{Group: "agents.hexa.dev", Version: "v1alpha1", Resource: "agenttasks"}

// CreateAgentTask creates an AgentTask CR with the provided spec.
func CreateAgentTask(ctx context.Context, cfg *rest.Config, namespace, name string, spec map[string]any) (*unstructured.Unstructured, error) {
    dc, err := dynamic.NewForConfig(cfg)
    if err != nil { return nil, err }
    res := dc.Resource(AgentTaskGVR).Namespace(namespace)
    obj := &unstructured.Unstructured{Object: map[string]any{
        "apiVersion": "agents.hexa.dev/v1alpha1",
        "kind": "AgentTask",
        "metadata": map[string]any{"name": name, "namespace": namespace},
        "spec": spec,
    }}
    // Try create; if AlreadyExists, return existing
    created, err := res.Create(ctx, obj, metav1.CreateOptions{})
    if err != nil {
        if apierrors.IsAlreadyExists(err) {
            existing, ge := res.Get(ctx, name, metav1.GetOptions{})
            if ge == nil { return existing, nil }
        }
        return nil, err
    }
    return created, nil
}

// GetAgentTask retrieves an AgentTask by name.
func GetAgentTask(ctx context.Context, cfg *rest.Config, namespace, name string) (*unstructured.Unstructured, error) {
    dc, err := dynamic.NewForConfig(cfg)
    if err != nil { return nil, err }
    return dc.Resource(AgentTaskGVR).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
}

// SetAgentTaskCancel sets spec.cancel on an existing AgentTask.
func SetAgentTaskCancel(ctx context.Context, cfg *rest.Config, namespace, name string, cancel bool) (*unstructured.Unstructured, error) {
    dc, err := dynamic.NewForConfig(cfg)
    if err != nil { return nil, err }
    res := dc.Resource(AgentTaskGVR).Namespace(namespace)
    // Retry small loop on conflict
    var last error
    for i := 0; i < 4; i++ {
        obj, gerr := res.Get(ctx, name, metav1.GetOptions{})
        if gerr != nil { return nil, gerr }
        if obj.Object == nil { obj.Object = map[string]any{} }
        spec, _, _ := unstructured.NestedMap(obj.Object, "spec")
        if spec == nil { spec = map[string]any{} }
        spec["cancel"] = cancel
        _ = unstructured.SetNestedMap(obj.Object, spec, "spec")
        updated, uerr := res.Update(ctx, obj, metav1.UpdateOptions{})
        if uerr == nil { return updated, nil }
        if apierrors.IsConflict(uerr) {
            last = uerr
            time.Sleep(150 * time.Millisecond)
            continue
        }
        return nil, uerr
    }
    return nil, last
}
