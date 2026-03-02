---
id: rancher-manager
title: Rancher Manager
sidebar_label: Rancher Manager
sidebar_position: 5
---

# Rancher Manager

Rancher Manager is deployed as a 3-node K3s HA cluster, running as VMs inside the Harvester cluster. It provides the central Kubernetes management UI and multi-cluster fleet management.

## Architecture

```
Harvester cluster
└── rancher-01 VM (10.10.12.211)  ─┐
└── rancher-02 VM (10.10.12.212)  ─┼─ K3s HA cluster
└── rancher-03 VM (10.10.12.213)  ─┘
    ├── cert-manager (TLS certificates)
    └── Rancher Manager (Helm chart)
        └── Exposed via: 10.10.12.210 (Keepalived VIP → HAProxy on nuc-00-03)
```

## Step 1: Create the Rancher Manager VMs

In the Harvester UI (`https://10.10.12.100`), create three VMs with the following configuration:

| Setting | Value |
|---------|-------|
| Names | `rancher-01`, `rancher-02`, `rancher-03` |
| CPU | 4 vCPUs each |
| Memory | 8 GB each |
| Image | openSUSE Leap 15.5 (upload ISO first) |
| Disk | 60 GB (Longhorn) each |
| Network | `default` (management) |
| IPs | `10.10.12.211`, `10.10.12.212`, `10.10.12.213` (static) |

Use cloud-init user data to set static IPs at VM creation time. Example for `rancher-01`:

```yaml
#cloud-config
hostname: rancher-01
manage_etc_hosts: true

network:
  version: 2
  ethernets:
    eth0:
      addresses:
        - 10.10.12.211/22
      gateway4: 10.10.12.1
      nameservers:
        addresses:
          - 10.10.12.8
          - 10.10.12.9
          - 8.8.8.8
        search:
          - enclave.kubernerdes.com
```

Repeat with IPs `10.10.12.212` and `10.10.12.213` for `rancher-02` and `rancher-03`.

## Step 2: Install K3s

Install K3s on all three nodes. `rancher-01` initializes the cluster; `rancher-02` and `rancher-03` join it.

### On rancher-01 (init node)

```bash
export K3S_VERSION="v1.34.4+k3s1"
export K3S_TOKEN="Waggoner"
export K3S_VIP="10.10.12.210"

curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=${K3S_VERSION} sh -s - \
  --cluster-init \
  --token ${K3S_TOKEN} \
  --tls-san ${K3S_VIP} \
  --tls-san rancher.enclave.kubernerdes.com \
  --node-ip 10.10.12.211 \
  --disable traefik

# Wait for K3s to be ready
kubectl get nodes
# Expected: rancher-01   Ready   control-plane,master
```

### On rancher-02 and rancher-03 (join nodes)

```bash
export K3S_VERSION="v1.34.4+k3s1"
export K3S_TOKEN="Waggoner"

# On rancher-02
curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=${K3S_VERSION} sh -s - \
  --server https://10.10.12.211:6443 \
  --token ${K3S_TOKEN} \
  --node-ip 10.10.12.212 \
  --disable traefik

# On rancher-03
curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=${K3S_VERSION} sh -s - \
  --server https://10.10.12.211:6443 \
  --token ${K3S_TOKEN} \
  --node-ip 10.10.12.213 \
  --disable traefik
```

### Verify all nodes joined

```bash
kubectl get nodes
# Expected:
# NAME         STATUS   ROLES                       AGE
# rancher-01   Ready    control-plane,etcd,master   ...
# rancher-02   Ready    control-plane,etcd,master   ...
# rancher-03   Ready    control-plane,etcd,master   ...
```

### Retrieve kubeconfig

```bash
# Copy Rancher K3s kubeconfig to your workstation
scp mansible@10.10.12.211:/etc/rancher/k3s/k3s.yaml ~/.kube/rancher-k3s-config

# Update server address to use the VIP
sed -i 's|https://127.0.0.1:6443|https://10.10.12.210:6443|g' ~/.kube/rancher-k3s-config

# Verify via VIP
kubectl --kubeconfig ~/.kube/rancher-k3s-config get nodes
```

## Step 3: Install cert-manager

```bash
# Add Jetstack Helm repo
helm repo add jetstack https://charts.jetstack.io
helm repo update

# Install cert-manager
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --version v1.14.0 \
  --set crds.enabled=true \
  --kubeconfig ~/.kube/rancher-k3s-config

# Verify
kubectl --kubeconfig ~/.kube/rancher-k3s-config \
  get pods -n cert-manager
# All pods should be Running
```

## Step 4: Install Rancher Manager

```bash
# Add Rancher Prime (RGS) Helm repo
helm repo add rancher-prime https://charts.rancher.com/server-charts/prime
helm repo update

# Install Rancher
helm install rancher rancher-prime/rancher \
  --namespace cattle-system \
  --create-namespace \
  --kubeconfig ~/.kube/rancher-k3s-config \
  --set hostname=rancher.enclave.kubernerdes.com \
  --set bootstrapPassword=Passw0rd01 \
  --set ingress.tls.source=letsEncrypt \
  --set letsEncrypt.email=admin@kubernerdes.com \
  --set letsEncrypt.ingress.class=nginx \
  --set replicas=3

# Watch rollout
kubectl --kubeconfig ~/.kube/rancher-k3s-config \
  rollout status deployment rancher -n cattle-system
```

> **Air-gap note:** For offline deployments, use `ingress.tls.source=secret` with a pre-provisioned certificate, and pull Rancher images from your local RGS Carbide registry mirror.

## Step 5: Confirm HAProxy Routing

`nuc-00-03`'s HAProxy already has the Rancher backends configured (see [Infrastructure VMs](./infrastructure-vms.md)). The VIP `10.10.12.210` routes through HAProxy to all three Rancher nodes.

Test connectivity:

```bash
curl -k https://10.10.12.210/ping
# Expected: {"type":"ping"}
```

## Step 6: Import Harvester Cluster into Rancher

1. Open Rancher UI: `https://rancher.enclave.kubernerdes.com` (or `https://10.10.12.210`)
2. Complete the initial setup (set admin password)
3. Navigate to **Cluster Management** → **Import Existing**
4. Select **Generic** cluster type
5. Name: `harvester-edge`
6. Copy the `kubectl apply` command shown
7. Run it against the Harvester cluster:

```bash
kubectl --kubeconfig ~/.kube/harvester-config apply -f <registration-url>
```

The Harvester cluster appears as an imported cluster in Rancher after a few minutes.

## Verification

```bash
# Rancher pods healthy (3 replicas)
kubectl --kubeconfig ~/.kube/rancher-k3s-config \
  get pods -n cattle-system

# Rancher UI reachable via VIP
curl -k -s -o /dev/null -w "%{http_code}" https://10.10.12.210
# Expected: 200 or 302

# Rancher reachable via DNS
curl -k -s -o /dev/null -w "%{http_code}" https://rancher.enclave.kubernerdes.com
# Expected: 200 or 302
```

Login with the bootstrap password you set during `helm install`. **Change it immediately** in the UI.

Day 1 is complete! Proceed to [Day 2 — Operate](../day-2/index.md).
