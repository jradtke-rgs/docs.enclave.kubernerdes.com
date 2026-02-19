---
id: harvester-cluster
title: Harvester Cluster
sidebar_label: Harvester Cluster
sidebar_position: 4
---

# Harvester Cluster

Three NUCs (`nuc-01`, `nuc-02`, `nuc-03`) form the Harvester HCI cluster. They are installed via PXE boot using automated `cloud-init`-style Harvester config files.

## How Harvester PXE Boot Works

1. NUC powers on → DHCP assigns IP + `next-server` + `filename`
2. NUC downloads `pxelinux.0` from TFTP on `nuc-00`
3. PXE menu boots Harvester kernel + initrd from HTTP on `nuc-00`
4. Harvester installer fetches its per-node config file from `nuc-00`
5. Automated install proceeds; node reboots into Harvester

## Per-Node Config Files

Create one config file per node in `/var/www/html/harvester/`:

### `config-nuc-01.yaml` (First Node — Creates Cluster)

```yaml
scheme_version: 1

server_url: ""  # empty = this is the first/create node

token: "enclave-harvester-token"

os:
  hostname: nuc-01
  password: "$6$rounds=4096$SALTSALT$HASHEDPASSWORD"  # openssl passwd -6
  ntp_servers:
    - 0.pool.ntp.org
    - 1.pool.ntp.org
  dns_nameservers:
    - 192.168.100.21
  ssh_authorized_keys:
    - "ssh-ed25519 AAAAC3... enclave-admin"

install:
  mode: create
  management_interface:
    interfaces:
      - name: eth0
    method: static
    ip: 192.168.100.11
    subnet_mask: 255.255.255.0
    gateway: 192.168.100.1
    mtu: 1500
  device: /dev/nvme0n1
  vip: 192.168.100.60
  vip_mode: static

system_settings:
  auto-disk-provision-paths: "/dev/nvme1n1"  # secondary NVMe for Longhorn
```

### `config-nuc-02.yaml` (Join Node)

```yaml
scheme_version: 1

server_url: "https://192.168.100.60"  # VIP of first node

token: "enclave-harvester-token"

os:
  hostname: nuc-02
  password: "$6$rounds=4096$SALTSALT$HASHEDPASSWORD"
  ntp_servers:
    - 0.pool.ntp.org
  dns_nameservers:
    - 192.168.100.21
  ssh_authorized_keys:
    - "ssh-ed25519 AAAAC3... enclave-admin"

install:
  mode: join
  management_interface:
    interfaces:
      - name: eth0
    method: static
    ip: 192.168.100.12
    subnet_mask: 255.255.255.0
    gateway: 192.168.100.1
    mtu: 1500
  device: /dev/nvme0n1

system_settings:
  auto-disk-provision-paths: "/dev/nvme1n1"
```

`config-nuc-03.yaml` follows the same pattern as `nuc-02` with IP `192.168.100.13`.

### Generate Hashed Password

```bash
openssl passwd -6 'YourSecurePassword'
```

## Installation Sequence

**Critical:** Install nodes in order. `nuc-01` must complete and the Harvester VIP (`192.168.100.60`) must be reachable before starting `nuc-02` and `nuc-03`.

### Step 1: Boot nuc-01

Power on `nuc-01`. In the BIOS one-time boot menu (F7), select Network/PXE boot.

Monitor installation progress from `nuc-00`:

```bash
# Watch Apache access log
tail -f /var/log/httpd/access_log | grep nuc-01

# Or watch directly via console
virsh console nuc-01  # not applicable here (bare metal), use physical display
```

Installation takes 10–15 minutes. The node reboots twice.

### Step 2: Verify nuc-01 is up

```bash
# Harvester API should respond at VIP
curl -k https://192.168.100.60/ping
# Expected: "pong"

# SSH to node
ssh rancher@192.168.100.11

# Check Harvester cluster health
kubectl get nodes --kubeconfig /etc/rancher/k3s/k3s.yaml
# Expected: nuc-01 Ready
```

### Step 3: Boot nuc-02 and nuc-03

Once `nuc-01` is healthy, PXE boot `nuc-02` and `nuc-03` (can be done simultaneously).

Monitor join progress:

```bash
# From nuc-01
watch kubectl get nodes --kubeconfig /etc/rancher/k3s/k3s.yaml
```

Allow 15–20 minutes for both nodes to join.

### Step 4: Retrieve kubeconfig

```bash
# Copy Harvester kubeconfig to your workstation
scp rancher@192.168.100.60:/etc/rancher/k3s/k3s.yaml ~/.kube/harvester-config

# Update server address in kubeconfig (replace 127.0.0.1 with VIP)
sed -i 's|https://127.0.0.1:6443|https://192.168.100.60:6443|g' ~/.kube/harvester-config

# Verify
kubectl --kubeconfig ~/.kube/harvester-config get nodes
```

## Cluster Verification

```bash
# All nodes Ready
kubectl get nodes -o wide
# Expected:
# NAME    STATUS   ROLES                  AGE   VERSION
# nuc-01  Ready    control-plane,master   ...   v1.27.x
# nuc-02  Ready    control-plane,master   ...   v1.27.x
# nuc-03  Ready    control-plane,master   ...   v1.27.x

# Longhorn storage (may take a few minutes to appear)
kubectl get sc
# Expected: harvester-longhorn (default)

# Check Longhorn pods
kubectl get pods -n longhorn-system

# Harvester UI accessible
open https://192.168.100.60
```

Login to the Harvester UI with the password set in the config files.

## Post-Install: Add Longhorn Disks

If secondary NVMe was not automatically provisioned:

1. Navigate to Harvester UI → **Host** → select a node
2. Click **Edit** → **Storage**
3. Add `/dev/nvme1n1` as a data disk
4. Repeat for all nodes

Longhorn will format and add these disks to its storage pool.

Proceed to [Rancher Manager](./rancher-manager).
