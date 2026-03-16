---
id: security
title: Security (NeuVector)
sidebar_label: Security (NeuVector)
sidebar_position: 4
---

# Security (NeuVector)

NeuVector (SUSE Security) provides container security scanning, runtime protection, and network policy enforcement. It is deployed into the applications cluster.

## Prerequisites

- The applications cluster kubeconfig is available at `~/.kube/enclave-applications.kubeconfig`
- Helm repos are up to date (`helm repo update`)

## Step 1: Add the NeuVector Helm Repo

```bash
helm repo add neuvector https://neuvector.github.io/neuvector-helm/
helm repo update
```

## Step 2: Create the Namespace

```bash
export KUBECONFIG=~/.kube/enclave-applications.kubeconfig

kubectl create namespace cattle-neuvector-system
```

## Step 3: Install NeuVector

```bash
helm upgrade --install neuvector neuvector/core \
  --namespace cattle-neuvector-system \
  --set manager.svc.type=ClusterIP \
  --set controller.replicas=3 \
  --set cve.scanner.replicas=2 \
  --set controller.pvc.enabled=false \
  --set k3s.enabled=false \
  --set manager.ingress.enabled=false \
  --set global.cattle.url=https://rancher.enclave.kubernerdes.com
```

Wait for all pods to reach `Running`:

```bash
kubectl get pods -n cattle-neuvector-system -w
```

## Step 4: Create an Ingress

NeuVector's web UI requires HTTPS passthrough. Create an Ingress using nginx:

```bash
cat << 'EOF' > neuvector-ingress.yaml
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: neuvector-manager
  namespace: cattle-neuvector-system
  annotations:
    nginx.ingress.kubernetes.io/backend-protocol: "HTTPS"
spec:
  ingressClassName: nginx
  rules:
    - host: neuvector.applications.enclave.kubernerdes.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: neuvector-service-webui
                port:
                  number: 8443
  tls:
    - hosts:
        - neuvector.applications.enclave.kubernerdes.com
EOF

kubectl apply -f neuvector-ingress.yaml
```

## Step 5: Retrieve Bootstrap Credentials

```bash
echo "NeuVector UI: https://neuvector.applications.enclave.kubernerdes.com"
echo "Bootstrap password: $(kubectl get secret \
  --namespace cattle-neuvector-system neuvector-bootstrap-secret \
  -o go-template='{{ .data.bootstrapPassword|base64decode}}{{ "\n" }}')"
```

Log in and change the bootstrap password immediately.

## Verification

```bash
# All pods running
kubectl get pods -n cattle-neuvector-system

# Ingress created
kubectl get ingress -n cattle-neuvector-system

# UI accessible
curl -k -o /dev/null -w "%{http_code}" \
  https://neuvector.applications.enclave.kubernerdes.com
# Expected: 200 or 302
```

## Integration with Rancher

NeuVector can be managed from the Rancher UI after importing the applications cluster:

1. In Rancher, navigate to the applications cluster
2. Click **Apps** → **Charts**
3. Search for **NeuVector** — Rancher provides a managed view of NeuVector's security posture, CVE reports, and network policy rules
