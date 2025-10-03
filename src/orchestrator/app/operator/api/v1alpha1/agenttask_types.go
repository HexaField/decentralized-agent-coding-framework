package v1alpha1

import (
    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
    runtime "k8s.io/apimachinery/pkg/runtime"
    schema "k8s.io/apimachinery/pkg/runtime/schema"
)

// GroupVersion for AgentTask
var GroupVersion = schema.GroupVersion{Group: "agents.hexa.dev", Version: "v1alpha1"}

// SchemeBuilder is used to add go types to the GroupVersionKind scheme
var SchemeBuilder = runtime.NewSchemeBuilder(addKnownTypes)
var AddToScheme = SchemeBuilder.AddToScheme

// AgentTaskSpec defines the desired state
type AgentTaskSpec struct {
    OrgID   string            `json:"orgId"`
    Task    string            `json:"task"`
    Image   string            `json:"image,omitempty"`
    Env     map[string]string `json:"env,omitempty"`
    Cancel  bool              `json:"cancel,omitempty"`
    TTLSecondsAfterFinished *int32 `json:"ttlSecondsAfterFinished,omitempty"`
}

// Condition describes state transitions
type Condition struct {
    Type    string      `json:"type"`
    Status  string      `json:"status"`
    Reason  string      `json:"reason,omitempty"`
    Message string      `json:"message,omitempty"`
    LastTransitionTime metav1.Time `json:"lastTransitionTime,omitempty"`
}

// AgentTaskStatus defines the observed state
type AgentTaskStatus struct {
    Phase      string      `json:"phase,omitempty"`
    Conditions []Condition `json:"conditions,omitempty"`
    AgentName  string      `json:"agentName,omitempty"`
    ArtifactPath string    `json:"artifactPath,omitempty"`
    ObservedGeneration int64 `json:"observedGeneration,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
type AgentTask struct {
    metav1.TypeMeta   `json:",inline"`
    metav1.ObjectMeta `json:"metadata,omitempty"`

    Spec   AgentTaskSpec   `json:"spec,omitempty"`
    Status AgentTaskStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true
type AgentTaskList struct {
    metav1.TypeMeta `json:",inline"`
    metav1.ListMeta `json:"metadata,omitempty"`
    Items           []AgentTask `json:"items"`
}

func addKnownTypes(scheme *runtime.Scheme) error {
    scheme.AddKnownTypes(GroupVersion, &AgentTask{}, &AgentTaskList{})
    metav1.AddToGroupVersion(scheme, GroupVersion)
    return nil
}

// Implement runtime.Object DeepCopyObject to satisfy the interface without codegen
func (in *AgentTask) DeepCopyObject() runtime.Object {
    if in == nil { return nil }
    out := new(AgentTask)
    *out = *in
    out.ObjectMeta = *in.ObjectMeta.DeepCopy()
    return out
}

func (in *AgentTaskList) DeepCopyObject() runtime.Object {
    if in == nil { return nil }
    out := new(AgentTaskList)
    *out = *in
    out.ListMeta = in.ListMeta
    if in.Items != nil {
        out.Items = make([]AgentTask, len(in.Items))
        copy(out.Items, in.Items)
    }
    return out
}
