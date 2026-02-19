---
id: rancher-manager
title: Rancher Manager
sidebar_label: Rancher Manager
sidebar_position: 5
---

# Rancher Manager

Rancher Manager is deployed as a VM inside the Harvester cluster, running on K3s. It provides the central Kubernetes management UI and multi-cluster fleet management.

## Architecture

```
Harvester cluster
└── rancher-mgr VM (192.168.100.30)
    └── K3s single-node cluster
        ├── cert-manager (TLS certificates)
        └── Rancher Manager (Helm chart)
            └── Exposed via: 192.168.100.50 (Keepalived VIP → HAProxy)
```

## Step 1: Create the Rancher Manager VM

In the Harvester UI (https://192.168.100.60):

1. Navigate to **Virtual Machines** → **Create**
2. Configure:

| Setting | Value |
|---------|-------|
| Name | `rancher-mgr` |
| CPU | 4 vCPUs |
| Memory | 8 GB |
| Image | Rocky Linux 9 (upload ISO first) |
| Disk | 60 GB (Longhorn) |
| Network | `default` (management) |
| IP | `192.168.100.30` (static) |

Or use Harvester's VM YAML manifest:

```yaml
apiVersion: kubevirt.io/v1
kind: VirtualMachine
metadata:
  name: rancher-mgr
  namespace: default
spec:
  running: true
  template:
    spec:
      domain:
        cpu:
          cores: 4
        memory:
          guest: 8Gi
        devices:
          disks:
            - name: rootdisk
              disk:
                bus: virtio
          interfaces:
            - name: default
              bridge: {}
      networks:
        - name: default
          pod: {}
      volumes:
        - name: rootdisk
          persistentVolumeClaim:
            claimName: rancher-mgr-pvc
```

## Step 2: Install Rocky Linux on rancher-mgr

Connect via Harvester VNC console to complete OS install. Configure static networking:

```bash
nmcli connection modify eth0 \
  ipv4.method manual \
  ipv4.addresses 192.168.100.30/24 \
  ipv4.gateway 192.168.100.1 \
  ipv4.dns 192.168.100.21
nmcli connection up eth0
```

## Step 3: Install K3s

```bash
# On rancher-mgr VM
curl -sfL https://get.k3s.io | sh -s - \
  --tls-san 192.168.100.50 \
  --tls-san rancher.kubernerdes.com \
  --node-ip 192.168.100.30 \
  --disable traefik

# Wait for K3s to be ready
kubectl get nodes
# Expected: rancher-mgr   Ready   control-plane,master

# Retrieve kubeconfig
cat /etc/rancher/k3s/k3s.yaml
```

Copy the kubeconfig to your workstation:

```bash
scp rke@192.168.100.30:/etc/rancher/k3s/k3s.yaml ~/.kube/rancher-k3s-config
sed -i 's|https://127.0.0.1:6443|https://192.168.100.30:6443|g' ~/.kube/rancher-k3s-config
```

## Step 4: Install cert-manager

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

## Step 5: Install Rancher Manager

```bash
# Add Rancher Prime (RGS) Helm repo
helm repo add rancher-prime https://charts.rancher.com/server-charts/prime
helm repo update

# Install Rancher
helm install rancher rancher-prime/rancher \
  --namespace cattle-system \
  --create-namespace \
  --kubeconfig ~/.kube/rancher-k3s-config \
  --set hostname=rancher.kubernerdes.com \
  --set bootstrapPassword=admin \
  --set ingress.tls.source=letsEncrypt \
  --set letsEncrypt.email=admin@kubernerdes.com \
  --set letsEncrypt.ingress.class=nginx \
  --set replicas=1

# Watch rollout
kubectl --kubeconfig ~/.kube/rancher-k3s-config \
  rollout status deployment rancher -n cattle-system
```

> **Air-gap note:** For offline deployments, use `ingress.tls.source=secret` with a pre-provisioned certificate, and pull Rancher images from your local RGS Carbide registry mirror.

## Step 6: Update HAProxy for Rancher VIP

Ensure `infra-02`'s HAProxy config has the `rancher-mgr` backend pointing to `192.168.100.30:443`. The VIP `192.168.100.50` routes through HAProxy to Rancher.

Test connectivity:

```bash
curl -k https://192.168.100.50/ping
# Expected: {"type":"ping"}
```

## Step 7: Import Harvester Cluster into Rancher

1. Open Rancher UI: https://rancher.kubernerdes.com (or https://192.168.100.50)
2. Complete the initial setup (set admin password)
3. Navigate to **Cluster Management** → **Import Existing**
4. Select **Generic** cluster type
5. Name: `harvester`
6. Copy the `kubectl apply` command shown
7. Run it against the Harvester cluster:

```bash
kubectl --kubeconfig ~/.kube/harvester-config apply -f <registration-url>
```

The Harvester cluster appears as an imported cluster in Rancher after a few minutes.

## Verification

```bash
# Rancher pods healthy
kubectl --kubeconfig ~/.kube/rancher-k3s-config \
  get pods -n cattle-system

# Rancher UI reachable via VIP
curl -k -s -o /dev/null -w "%{http_code}" https://192.168.100.50
# Expected: 200 or 302

# Rancher reachable via DNS
curl -k -s -o /dev/null -w "%{http_code}" https://rancher.kubernerdes.com
# Expected: 200 or 302
```

Login with the bootstrap password you set during `helm install`. **Change it immediately** in the UI.

Day 1 is complete! Proceed to [Day 2 — Operate](../day-2).
