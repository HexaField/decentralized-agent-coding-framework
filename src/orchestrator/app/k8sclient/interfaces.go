package k8sclient

import (
    appsv1 "k8s.io/api/apps/v1"
    corev1 "k8s.io/api/core/v1"
    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// Narrow interfaces to simplify mocking in tests (compatible with client-go fake).
type DeploymentsGetter interface {
    Create(*appsv1.Deployment, metav1.CreateOptions) (*appsv1.Deployment, error)
    Update(*appsv1.Deployment, metav1.UpdateOptions) (*appsv1.Deployment, error)
}

type ServicesGetter interface {
    Create(*corev1.Service, metav1.CreateOptions) (*corev1.Service, error)
    Update(*corev1.Service, metav1.UpdateOptions) (*corev1.Service, error)
}
