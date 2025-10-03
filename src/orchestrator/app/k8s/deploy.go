package k8s

import (
    "context"
    "fmt"
    "time"

    appsv1 "k8s.io/api/apps/v1"
    corev1 "k8s.io/api/core/v1"
    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
    "k8s.io/apimachinery/pkg/util/intstr"
    "k8s.io/client-go/kubernetes"
)

type DeployParams struct {
    Org    string
    Image  string
    NS     string
    Name   string
    Env    map[string]string
}

func ensureNamespace(ctx context.Context, cs *kubernetes.Clientset, ns string) error {
    _, err := cs.CoreV1().Namespaces().Get(ctx, ns, metav1.GetOptions{})
    if err == nil { return nil }
    _, err = cs.CoreV1().Namespaces().Create(ctx, &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: ns}}, metav1.CreateOptions{})
    return err
}

func DeployAgentImperative(ctx context.Context, cs *kubernetes.Clientset, p DeployParams) (string, error) {
    if p.NS == "" { p.NS = "mvp-agents" }
    if p.Image == "" { p.Image = "mvp-agent:latest" }
    if p.Name == "" { p.Name = fmt.Sprintf("agent-%s-%d", p.Org, time.Now().Unix()) }

    if err := ensureNamespace(ctx, cs, p.NS); err != nil { return "", err }

    labels := map[string]string{"app": p.Name}
    // Create/update a Secret to hold env values
    secName := p.Name + "-env"
    sec := &corev1.Secret{
        ObjectMeta: metav1.ObjectMeta{Name: secName, Namespace: p.NS},
        StringData: p.Env,
        Type:       corev1.SecretTypeOpaque,
    }
    var err error
    for i := 0; i < 3; i++ {
        _, err = cs.CoreV1().Secrets(p.NS).Create(ctx, sec, metav1.CreateOptions{})
        if err == nil { break }
        _, uerr := cs.CoreV1().Secrets(p.NS).Update(ctx, sec, metav1.UpdateOptions{})
        if uerr == nil { err = nil; break }
        time.Sleep(time.Duration(200*(i+1)) * time.Millisecond)
    }
    if err != nil { return "", err }
    dep := &appsv1.Deployment{
        ObjectMeta: metav1.ObjectMeta{Name: p.Name, Namespace: p.NS},
        Spec: appsv1.DeploymentSpec{
            Replicas: int32Ptr(1),
            Selector: &metav1.LabelSelector{MatchLabels: labels},
            Template: corev1.PodTemplateSpec{
                ObjectMeta: metav1.ObjectMeta{Labels: labels},
                Spec: corev1.PodSpec{
                    Containers: []corev1.Container{{
                        Name:  "agent",
                        Image: p.Image,
                        Ports: []corev1.ContainerPort{{ContainerPort: 8443}},
                        ReadinessProbe: &corev1.Probe{ProbeHandler: corev1.ProbeHandler{TCPSocket: &corev1.TCPSocketAction{Port: intstr.FromInt(8443)}}, InitialDelaySeconds: 2, PeriodSeconds: 5},
                        LivenessProbe:  &corev1.Probe{ProbeHandler: corev1.ProbeHandler{TCPSocket: &corev1.TCPSocketAction{Port: intstr.FromInt(8443)}}, InitialDelaySeconds: 5, PeriodSeconds: 10},
                        Env:   toEnvFromSecret(secName, p.Env),
                    }},
                },
            },
        },
    }
    
    // simple retry on conflicts/transients
    for i := 0; i < 3; i++ {
        _, err = cs.AppsV1().Deployments(p.NS).Create(ctx, dep, metav1.CreateOptions{})
        if err == nil { break }
        // try update path
        _, uerr := cs.AppsV1().Deployments(p.NS).Update(ctx, dep, metav1.UpdateOptions{})
        if uerr == nil { err = nil; break }
        time.Sleep(time.Duration(200*(i+1)) * time.Millisecond)
    }
    if err != nil { return "", err }

    svc := &corev1.Service{
        ObjectMeta: metav1.ObjectMeta{Name: p.Name, Namespace: p.NS},
        Spec: corev1.ServiceSpec{
            Selector: labels,
            Ports: []corev1.ServicePort{{Port: 8443, TargetPort: intstr.FromInt(8443)}},
            Type: corev1.ServiceTypeClusterIP,
        },
    }
    for i := 0; i < 3; i++ {
        _, err = cs.CoreV1().Services(p.NS).Create(ctx, svc, metav1.CreateOptions{})
        if err == nil { break }
        _, uerr := cs.CoreV1().Services(p.NS).Update(ctx, svc, metav1.UpdateOptions{})
        if uerr == nil { err = nil; break }
        time.Sleep(time.Duration(200*(i+1)) * time.Millisecond)
    }
    if err != nil { return "", err }
    return p.Name, nil
}

func int32Ptr(i int32) *int32 { return &i }

func toEnv(m map[string]string) []corev1.EnvVar {
    if len(m) == 0 { return nil }
    out := make([]corev1.EnvVar, 0, len(m))
    for k, v := range m { out = append(out, corev1.EnvVar{Name: k, Value: v}) }
    return out
}

func toEnvFromSecret(secretName string, m map[string]string) []corev1.EnvVar {
    if len(m) == 0 { return nil }
    out := make([]corev1.EnvVar, 0, len(m))
    for k := range m {
        out = append(out, corev1.EnvVar{
            Name: k,
            ValueFrom: &corev1.EnvVarSource{SecretKeyRef: &corev1.SecretKeySelector{LocalObjectReference: corev1.LocalObjectReference{Name: secretName}, Key: k}},
        })
    }
    return out
}
