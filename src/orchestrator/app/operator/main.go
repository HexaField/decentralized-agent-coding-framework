package main

import (
    "flag"
    "os"

    apiv1alpha1 "orchestrator/operator/api/v1alpha1"
    "orchestrator/operator/controller"

    clientgoscheme "k8s.io/client-go/kubernetes/scheme"
    utilruntime "k8s.io/apimachinery/pkg/util/runtime"
    "k8s.io/apimachinery/pkg/runtime"

    ctrl "sigs.k8s.io/controller-runtime"
    metricsserver "sigs.k8s.io/controller-runtime/pkg/metrics/server"
    "sigs.k8s.io/controller-runtime/pkg/healthz"
    "sigs.k8s.io/controller-runtime/pkg/log/zap"
    "sigs.k8s.io/controller-runtime/pkg/client/config"
)

func main() {
    var metricsAddr string
    var probeAddr string
    var enableLeaderElection bool
    flag.StringVar(&metricsAddr, "metrics-bind-address", ":8081", "The address the metric endpoint binds to.")
    flag.StringVar(&probeAddr, "health-probe-bind-address", ":8082", "The address the probe endpoint binds to.")
    flag.BoolVar(&enableLeaderElection, "leader-elect", false, "Enable leader election for controller manager.")
    opts := zap.Options{Development: true}
    opts.BindFlags(flag.CommandLine)
    flag.Parse()
    ctrl.SetLogger(zap.New(zap.UseFlagOptions(&opts)))

    cfg, err := config.GetConfig()
    if err != nil { panic(err) }
    scheme := runtime.NewScheme()
    utilruntime.Must(clientgoscheme.AddToScheme(scheme))
    utilruntime.Must(apiv1alpha1.AddToScheme(scheme))

    mgr, err := ctrl.NewManager(cfg, ctrl.Options{
        Scheme: scheme,
        Metrics: metricsserver.Options{BindAddress: metricsAddr},
        HealthProbeBindAddress: probeAddr,
        LeaderElection: enableLeaderElection,
        LeaderElectionID: "agenttasks.hexa.dev",
    })
    if err != nil { panic(err) }

    if err := (&controller.AgentTaskReconciler{Client: mgr.GetClient(), Scheme: mgr.GetScheme(), Recorder: mgr.GetEventRecorderFor("agent-operator")}).SetupWithManager(mgr); err != nil {
        panic(err)
    }

    _ = mgr.AddHealthzCheck("healthz", healthz.Ping)
    _ = mgr.AddReadyzCheck("readyz", healthz.Ping)

    if err := mgr.Start(ctrl.SetupSignalHandler()); err != nil {
        os.Exit(1)
    }
}
