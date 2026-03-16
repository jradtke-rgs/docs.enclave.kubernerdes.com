---
id: observability
title: Observability (SUSE Observability)
sidebar_label: Observability
sidebar_position: 3
---

# Observability (SUSE Observability)

SUSE Observability (powered by StackState) provides full-stack topology-based observability across the enclave clusters. It is deployed as a standalone service and clusters register themselves as agents.

## Architecture

```
Observability cluster (3 VMs: 10.10.15.37-39)
└── suse-observability namespace
    └── Accessible via: 10.10.12.220 (Keepalived VIP → HAProxy on nuc-00-03)
        └── https://observability.enclave.kubernerdes.com

Clusters register agents that report to:
  https://observability.enclave.kubernerdes.com/receiver/stsAgent
```

## Prerequisites

- Observability cluster kubeconfig saved as `~/.kube/enclave-observability.kubeconfig`
- `O11Y_LICENSE` environment variable set to your SUSE Observability license key
- Helm repos up to date

## Step 1: Install cert-manager

```bash
export KUBECONFIG=~/.kube/enclave-observability.kubeconfig

CERTMGR_VERSION=v1.19.4
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/${CERTMGR_VERSION}/cert-manager.crds.yaml

helm repo add jetstack https://charts.jetstack.io
helm repo update

helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --version ${CERTMGR_VERSION}
```

## Step 2: Add the SUSE Observability Helm Repo

```bash
helm repo add suse-observability \
  https://charts.rancher.com/server-charts/prime/suse-observability
helm repo update
```

## Step 3: Generate Configuration Values

```bash
mkdir -p ~/observability && cd ~/observability
export VALUES_DIR=.

helm template \
  --set license="${O11Y_LICENSE}" \
  --set rancherUrl='https://rancher.enclave.kubernerdes.com' \
  --set baseUrl='https://observability.enclave.kubernerdes.com' \
  --set sizing.profile='10-nonha' \
  suse-observability-values \
  suse-observability/suse-observability-values \
  --output-dir ${VALUES_DIR}
```

> The generated `baseConfig_values.yaml` contains the admin password — store it somewhere safe.

Retrieve the generated admin password:

```bash
grep 'admin password' $(find ${VALUES_DIR} -name baseConfig_values.yaml)
```

## Step 4: Install SUSE Observability

```bash
helm upgrade --install \
  --namespace suse-observability \
  --create-namespace \
  --values ${VALUES_DIR}/suse-observability-values/templates/baseConfig_values.yaml \
  --values ${VALUES_DIR}/suse-observability-values/templates/sizing_values.yaml \
  --values ${VALUES_DIR}/suse-observability-values/templates/affinity_values.yaml \
  suse-observability \
  suse-observability/suse-observability
```

Startup takes 15–20 minutes. Many warnings are expected while pods initialize — watch until things stabilize:

```bash
kubectl get pods -n suse-observability -w
```

## Step 5: Create the Ingress

```bash
cat << 'EOF' > suse-observability-ingress.yaml
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: suse-observability-ui
  namespace: suse-observability
spec:
  ingressClassName: nginx
  rules:
  - host: observability.enclave.kubernerdes.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: suse-observability-router
            port:
              number: 8080
EOF

kubectl apply -f suse-observability-ingress.yaml
```

## Step 6: Register Clusters as Agents

For each cluster you want to monitor, run the agent Helm install. This is an intentionally manual process — values must be retrieved from the Observability UI.

### Per-cluster steps

1. Log into the Observability UI at `https://observability.enclave.kubernerdes.com`
2. Navigate to **StackPacks** → **Kubernetes** → add a new instance, naming it after the cluster
3. Copy the **Service Token** shown in the setup wizard

Then install the agent against that cluster:

```bash
CLUSTER_NAME=harvester   # or: rancher, applications, observability
SERVICE_TOKEN=<paste-token-from-ui>

export KUBECONFIG=~/.kube/enclave-${CLUSTER_NAME}.kubeconfig
kubectl get nodes   # confirm you're pointing at the right cluster

helm upgrade --install \
  --namespace suse-observability \
  --create-namespace \
  --set-string 'stackstate.apiKey'=${SERVICE_TOKEN} \
  --set-string 'stackstate.cluster.name'=${CLUSTER_NAME} \
  --set-string 'stackstate.url'='https://observability.enclave.kubernerdes.com/receiver/stsAgent' \
  --set 'nodeAgent.skipKubeletTLSVerify'=true \
  --set-string 'global.skipSslValidation'=true \
  suse-observability-agent suse-observability/suse-observability-agent
```

Repeat for each cluster: `harvester`, `rancher`, `applications`.

## Verification

```bash
# Observability pods healthy
kubectl --kubeconfig ~/.kube/enclave-observability.kubeconfig \
  get pods -n suse-observability

# UI accessible
curl -k -o /dev/null -w "%{http_code}" \
  https://observability.enclave.kubernerdes.com
# Expected: 200 or 302

# Agent reporting in (check per cluster)
kubectl --kubeconfig ~/.kube/enclave-harvester.kubeconfig \
  get pods -n suse-observability
```

After agents are running, clusters appear in the Observability UI topology view within a few minutes.
