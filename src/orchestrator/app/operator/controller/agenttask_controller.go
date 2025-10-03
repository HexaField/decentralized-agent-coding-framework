package controller

import (
    "context"
    "fmt"
    "time"

    appv1alpha1 "orchestrator/operator/api/v1alpha1"
    corev1 "k8s.io/api/core/v1"
    appsv1 "k8s.io/api/apps/v1"
    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
    "k8s.io/apimachinery/pkg/runtime"
    ctrl "sigs.k8s.io/controller-runtime"
    "sigs.k8s.io/controller-runtime/pkg/client"
    "sigs.k8s.io/controller-runtime/pkg/controller"
    "sigs.k8s.io/controller-runtime/pkg/log"
    "k8s.io/client-go/tools/record"
)

type AgentTaskReconciler struct {
    client.Client
    Scheme *runtime.Scheme
    Recorder record.EventRecorder
}

func (r *AgentTaskReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    _ = log.FromContext(ctx)
    var at appv1alpha1.AgentTask
    if err := r.Get(ctx, req.NamespacedName, &at); err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }
    // If cancelled previously and TTL elapsed, delete CR
    if at.Status.Phase == "Cancelled" && at.Spec.TTLSecondsAfterFinished != nil && *at.Spec.TTLSecondsAfterFinished > 0 {
        // Find Cancelled condition time
        var t metav1.Time
        for _, c := range at.Status.Conditions { if c.Type == "Cancelled" { t = c.LastTransitionTime; break } }
        if !t.IsZero() {
            ttl := time.Duration(*at.Spec.TTLSecondsAfterFinished) * time.Second
            if time.Since(t.Time) >= ttl {
                _ = r.Delete(ctx, &at)
                return ctrl.Result{}, nil
            }
            return ctrl.Result{RequeueAfter: ttl - time.Since(t.Time)}, nil
        }
    }
    // Ensure finalizer for cleanup if we ever add external resources
    const fin = "agenttasks.hexa.dev/finalizer"
    if at.DeletionTimestamp.IsZero() {
        has := false
        for _, f := range at.Finalizers { if f == fin { has = true; break } }
        if !has {
            at.Finalizers = append(at.Finalizers, fin)
            if err := r.Update(ctx, &at); err != nil { return ctrl.Result{}, err }
        }
    } else {
        // Being deleted: nothing external; remove finalizer to allow deletion
        kept := make([]string,0,len(at.Finalizers))
        for _, f := range at.Finalizers { if f != fin { kept = append(kept, f) } }
        if len(kept) != len(at.Finalizers) { at.Finalizers = kept; _ = r.Update(ctx, &at) }
        return ctrl.Result{}, nil
    }

    // Handle cancellation
    if at.Spec.Cancel {
        // Best-effort delete Deployment/Service named in status.AgentName
        if at.Status.AgentName != "" {
            _ = r.Delete(ctx, &appsv1.Deployment{ObjectMeta: metav1.ObjectMeta{Name: at.Status.AgentName, Namespace: req.Namespace}})
            _ = r.Delete(ctx, &corev1.Service{ObjectMeta: metav1.ObjectMeta{Name: at.Status.AgentName, Namespace: req.Namespace}})
        }
        at.Status.Phase = "Cancelled"
        setCondition(&at, "Cancelled", "True", "UserRequested", "Task cancelled")
        if err := r.Status().Update(ctx, &at); err != nil { return ctrl.Result{}, err }
        if r.Recorder != nil { r.Recorder.Event(&at, corev1.EventTypeNormal, "Cancelled", "AgentTask cancelled; resources removed") }
        // TTL handling moved to top; requeue soon to evaluate
        return ctrl.Result{RequeueAfter: 5 * time.Second}, nil
    }

    // Ensure Deployment and Service exist for this task
    name := at.Status.AgentName
    if name == "" { name = fmt.Sprintf("agent-%s-%d", at.Spec.OrgID, time.Now().Unix()) }
    // Secret for env
    sec := &corev1.Secret{ObjectMeta: metav1.ObjectMeta{Name: name+"-env", Namespace: req.Namespace}}
    _, _ = ctrl.CreateOrUpdate(ctx, r.Client, sec, func() error {
        if sec.StringData == nil { sec.StringData = map[string]string{} }
        for k, v := range at.Spec.Env { sec.StringData[k] = v }
        return ctrl.SetControllerReference(&at, sec, r.Scheme)
    })

    dep := &appsv1.Deployment{ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: req.Namespace}}
    _, err := ctrl.CreateOrUpdate(ctx, r.Client, dep, func() error {
        labels := map[string]string{"app": name}
        replicas := int32(1)
        dep.Spec.Replicas = &replicas
        dep.Spec.Selector = &metav1.LabelSelector{MatchLabels: labels}
        dep.Spec.Template.ObjectMeta.Labels = labels
        dep.Spec.Template.Spec.Containers = []corev1.Container{{
            Name:  "agent",
            Image: defaultIfEmpty(at.Spec.Image, "mvp-agent:latest"),
            Ports: []corev1.ContainerPort{{ContainerPort: 8443}},
            Env:   envFromSecret(name+"-env", at.Spec.Env),
        }}
        return ctrl.SetControllerReference(&at, dep, r.Scheme)
    })
    if err != nil { return ctrl.Result{}, err }

    svc := &corev1.Service{ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: req.Namespace}}
    _, err = ctrl.CreateOrUpdate(ctx, r.Client, svc, func() error {
        svc.Spec.Selector = map[string]string{"app": name}
        svc.Spec.Ports = []corev1.ServicePort{{Port: 8443}}
        return ctrl.SetControllerReference(&at, svc, r.Scheme)
    })
    if err != nil { return ctrl.Result{}, err }

    // Update status
    at.Status.AgentName = name
    at.Status.Phase = "Running"
    setCondition(&at, "Ready", "True", "ResourcesCreated", "Agent resources created")
    if err := r.Status().Update(ctx, &at); err != nil { return ctrl.Result{}, err }
    if r.Recorder != nil { r.Recorder.Event(&at, corev1.EventTypeNormal, "Running", fmt.Sprintf("Agent %s running", name)) }

    return ctrl.Result{RequeueAfter: 10 * time.Second}, nil
}

func (r *AgentTaskReconciler) SetupWithManager(mgr ctrl.Manager) error {
    return ctrl.NewControllerManagedBy(mgr).
        For(&appv1alpha1.AgentTask{}).
        Owns(&appsv1.Deployment{}).
        Owns(&corev1.Service{}).
        WithOptions(controller.Options{MaxConcurrentReconciles: 1}).
        Complete(r)
}

func envFromSecret(name string, m map[string]string) []corev1.EnvVar {
    out := make([]corev1.EnvVar, 0, len(m))
    for k := range m {
        out = append(out, corev1.EnvVar{Name: k, ValueFrom: &corev1.EnvVarSource{SecretKeyRef: &corev1.SecretKeySelector{LocalObjectReference: corev1.LocalObjectReference{Name: name}, Key: k}}})
    }
    return out
}

func defaultIfEmpty(s, def string) string { if s == "" { return def }; return s }

func setCondition(at *appv1alpha1.AgentTask, t, status, reason, msg string) {
    c := appv1alpha1.Condition{Type: t, Status: status, Reason: reason, Message: msg, LastTransitionTime: metav1.Now()}
    // replace if exists
    out := make([]appv1alpha1.Condition, 0, len(at.Status.Conditions)+1)
    replaced := false
    for _, existing := range at.Status.Conditions {
        if existing.Type == t { out = append(out, c); replaced = true } else { out = append(out, existing) }
    }
    if !replaced { out = append(out, c) }
    at.Status.Conditions = out
}
