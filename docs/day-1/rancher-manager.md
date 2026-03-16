---
id: rancher-manager
title: Rancher Manager
sidebar_label: Rancher Manager
sidebar_position: 5
---

# Rancher Manager

Rancher Manager is deployed as a 3-node RKE2 HA cluster, running as VMs inside the Harvester cluster. It provides the central Kubernetes management UI and multi-cluster fleet management.

## Architecture

```
Harvester cluster
└── rancher-01 VM (10.10.12.211)  ─┐
└── rancher-02 VM (10.10.12.212)  ─┼─ RKE2 HA cluster
└── rancher-03 VM (10.10.12.213)  ─┘
    ├── cert-manager (TLS certificates)
    └── Rancher Manager (Helm chart)
        └── Available via: 10.10.12.210 (Keepalived VIP → HAProxy on nuc-00-03)
```

## Step 1: Create the Rancher Manager VMs

ProTip(s):
* I create a separate namespace for each of my clusters - this allows me to destroy the single namespace and remove ALL the resources - as opposed to trying to sort through resources from many different workloads in a shared namespace.
* You can create multiple VMs with the same "basename". Enter "rancher", for example, and select 3 - you end up with rancher-01/02/03. Slick

In the Harvester UI (`https://10.10.12.100`), create three VMs with the following configuration:

| Setting | Value |
|---------|-------|
| Names | `rancher-01`, `rancher-02`, `rancher-03` |
| CPU | 4 vCPUs each |
| Memory | 8 GB each |
| Image | SL-Micro 6.1 |
| Disk | 60 GB (Longhorn) each |
| Network | `default` (management) |
| IPs | `10.10.12.211`, `10.10.12.212`, `10.10.12.213` (static) |

Click **Virtual Machines** → **Create** → **Multiple Instance**. Update the namespace (e.g. `vms-rancher`), enter `rancher` as the Name Prefix with count `3`. Set CPU = 4, Memory = 8, attach your SSH key. Under **Volumes**, select your SL-Micro image (increase size to 60 GB). Under **Network**, select your VM network. Under **Advanced Options** → **Cloud Configuration** → **User Data**, select the cloud configuration template.

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

## Step 2: Install RKE2

RKE2 is installed on all three nodes. `rancher-01` initializes the cluster; `rancher-02` and `rancher-03` join it.

### Set variables (run on each node before starting)

SSH to each node as root (`sudo su -`) and set the environment:

```bash
cat << 'EOF' > ~/.rancher.vars
export MY_RKE2_VERSION=v1.34.4+rke2r1
export MY_RKE2_INSTALL_CHANNEL=v1.34
export MY_RKE2_TOKEN=WaggonerRancher
export MY_RKE2_ENDPOINT=10.10.12.210
export MY_RKE2_HOSTNAME=rancher.enclave.kubernerdes.com
EOF
source ~/.rancher.vars
```

Add Rancher node entries to `/etc/hosts` on each node:

```bash
cat << 'EOF' >> /etc/hosts

# rancher nodes
10.10.12.211    rancher-01.enclave.kubernerdes.com rancher-01
10.10.12.212    rancher-02.enclave.kubernerdes.com rancher-02
10.10.12.213    rancher-03.enclave.kubernerdes.com rancher-03
EOF
```

### On rancher-01 (init node)

```bash
mkdir -p /etc/rancher/rke2

cat << EOF > /etc/rancher/rke2/config.yaml
token: ${MY_RKE2_TOKEN}
tls-san:
  - ${MY_RKE2_ENDPOINT}
  - ${MY_RKE2_HOSTNAME}
EOF

curl -sfL https://get.rke2.io | INSTALL_RKE2_CHANNEL=${MY_RKE2_INSTALL_CHANNEL} sh -

systemctl enable rke2-server.service --now
```

> **SL-Micro note:** After `systemctl enable rke2-server.service --now`, SL-Micro will reboot to commit the transactional update. Wait for it to come back before proceeding.

Add RKE2 binaries to PATH:

```bash
echo 'export PATH=$PATH:/opt/rke2/bin' >> ~/.bashrc
echo 'export PATH=$PATH:/var/lib/rancher/rke2/bin' >> ~/.bashrc
source ~/.bashrc
```

### On rancher-02 and rancher-03 (join nodes)

```bash
mkdir -p /etc/rancher/rke2

cat << EOF > /etc/rancher/rke2/config.yaml
server: https://${MY_RKE2_ENDPOINT}:9345
token: ${MY_RKE2_TOKEN}
tls-san:
  - ${MY_RKE2_ENDPOINT}
  - ${MY_RKE2_HOSTNAME}
EOF

curl -sfL https://get.rke2.io | INSTALL_RKE2_CHANNEL=${MY_RKE2_INSTALL_CHANNEL} sh -

# Wait 45-90 seconds before enabling to allow rancher-01 to stabilize
sleep 60
systemctl enable rke2-server.service --now
```

### Verify all nodes joined

```bash
export KUBECONFIG=/etc/rancher/rke2/rke2.yaml
kubectl get nodes
# Expected:
# NAME         STATUS   ROLES                       AGE
# rancher-01   Ready    control-plane,etcd,master   ...
# rancher-02   Ready    control-plane,etcd,master   ...
# rancher-03   Ready    control-plane,etcd,master   ...
```

### Retrieve kubeconfig

```bash
# Copy RKE2 kubeconfig to your workstation
scp sles@rancher-01:.kube/config ~/.kube/enclave-rancher.kubeconfig

# Update server address to use the VIP
sed -i 's|https://127.0.0.1:6443|https://10.10.12.210:6443|g' \
  ~/.kube/enclave-rancher.kubeconfig

# Verify via VIP
kubectl --kubeconfig ~/.kube/enclave-rancher.kubeconfig get nodes
```

## Step 3: Install cert-manager

```bash
export KUBECONFIG=~/.kube/enclave-rancher.kubeconfig

CERTMGR_VERSION=v1.18.0
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/${CERTMGR_VERSION}/cert-manager.crds.yaml

helm repo add jetstack https://charts.jetstack.io
helm repo update

helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --version ${CERTMGR_VERSION}

# Verify
kubectl get pods -n cert-manager
# All pods should be Running
```

## Step 4: Install Rancher Manager

```bash
export KUBECONFIG=~/.kube/enclave-rancher.kubeconfig

helm repo add rancher-latest https://releases.rancher.com/server-charts/latest
helm repo update

kubectl create namespace cattle-system

helm install rancher rancher-latest/rancher \
  --namespace cattle-system \
  --set hostname=rancher.enclave.kubernerdes.com \
  --set bootstrapPassword=Passw0rd01 \
  --set replicas=3

# Watch rollout
kubectl rollout status deployment rancher -n cattle-system

# Print the bootstrap URL
echo https://rancher.enclave.kubernerdes.com/dashboard/?setup=$(kubectl get secret \
  --namespace cattle-system bootstrap-secret \
  -o go-template='{{.data.bootstrapPassword|base64decode}}')
```

> **Air-gap note:** For offline deployments, use `ingress.tls.source=secret` with a pre-provisioned certificate and pull Rancher images from your local Hauler store (see [Hauler & Carbide Setup](./hauler.md)).

## Step 5: Confirm HAProxy Routing

`nuc-00-03`'s HAProxy already has the Rancher backends configured (see [Infrastructure VMs](./infrastructure-vms.md)). The VIP `10.10.12.210` routes through HAProxy to all three Rancher nodes on ports 80, 443, 6443, and 9345.

Test connectivity:

```bash
curl -k https://10.10.12.210/ping
# Expected: {"type":"ping"}
```

### Enable Extensions

Click the puzzle piece (bottom left in UI) → kebab menu (upper right) → **Manage Repositories**.

### Disable TLS verification (if needed)

In Rancher UI: **☁ (globe icon)** → **Settings** → **agent-tls-mode** → kebab → **Edit Settings** → set to **System Store** → **Save**.

## Step 6: Import Harvester Cluster into Rancher

1. Open Rancher UI: `https://rancher.enclave.kubernerdes.com` (or `https://10.10.12.210`)
2. Complete the initial setup (set admin password — change the bootstrap password immediately)
3. Click the Harvester icon in the left pane → **Install**
4. Navigate to **Cluster Management** → **Import Existing**
5. Select **Generic** cluster type
6. Name: `harvester-edge`
7. Copy the `kubectl apply` command shown
8. Run it against the Harvester cluster:

```bash
kubectl --kubeconfig ~/.kube/enclave-harvester.kubeconfig apply -f <registration-url>
```

The Harvester cluster appears as an imported cluster in Rancher after a few minutes.

## Verification

```bash
export KUBECONFIG=~/.kube/enclave-rancher.kubeconfig

# Rancher pods healthy (3 replicas)
kubectl get pods -n cattle-system

# Rancher UI reachable via VIP
curl -k -s -o /dev/null -w "%{http_code}" https://10.10.12.210
# Expected: 200 or 302

# Rancher reachable via DNS
curl -k -s -o /dev/null -w "%{http_code}" https://rancher.enclave.kubernerdes.com
# Expected: 200 or 302
```

---

## Reference: K3s Alternative

K3s is a lightweight Kubernetes distribution that can also back a Rancher Manager deployment. It is included here as a reference only — the enclave uses RKE2 for actual deployments.

### Install K3s on rancher-01 (init node)

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
```

### Join rancher-02 and rancher-03

```bash
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

Day 1 is complete! Proceed to [Day 2 — Operate](../day-2/index.md).
