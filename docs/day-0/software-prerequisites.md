---
id: software-prerequisites
title: Software Prerequisites
sidebar_label: Software Prerequisites
sidebar_position: 4
---

# Software Prerequisites

Before beginning Day 1, download all required images and install workstation tooling. If you're building an air-gapped enclave, this is the last opportunity to pull anything from the internet.

## OS Images

| Image | Version | Use |
|-------|---------|-----|
| Rocky Linux 9 minimal ISO | 9.x | nuc-00 admin host OS |
| Harvester ISO | v1.3.x | Harvester nodes (nuc-01/02/03) |

Download locations:
- Rocky Linux: https://rockylinux.org/download
- Harvester: https://github.com/harvester/harvester/releases

> **Verify checksums** after downloading. Both projects publish SHA256 sums alongside their ISOs.

```bash
sha256sum -c CHECKSUM
```

## Workstation Tools

Install these on your laptop/workstation (not on any NUC):

### Required

| Tool | Version | Install |
|------|---------|---------|
| `kubectl` | ≥ 1.28 | [Install guide](https://kubernetes.io/docs/tasks/tools/) |
| `helm` | ≥ 3.12 | `brew install helm` |
| `ansible` | ≥ 2.15 | `pip3 install ansible` |
| `ssh` | any | Pre-installed on macOS/Linux |

### Recommended

| Tool | Use |
|------|-----|
| `k9s` | Terminal-based Kubernetes UI |
| `jq` | JSON parsing for API responses |
| `yq` | YAML processing |
| `virtctl` | Harvester VM management (from KubeVirt) |

```bash
# macOS via Homebrew
brew install kubectl helm ansible k9s jq yq

# virtctl — download binary matching your Harvester version
VERSION=v1.3.0
curl -Lo virtctl https://github.com/kubevirt/kubevirt/releases/download/${VERSION}/virtctl-${VERSION}-darwin-amd64
chmod +x virtctl
sudo mv virtctl /usr/local/bin/
```

## Ansible Inventory Pre-Work

The enclave repo uses Ansible for configuration management. Prepare your inventory before Day 1:

```ini
# inventory/hosts.ini
[admin]
nuc-00 ansible_host=192.168.100.10

[infra_vms]
infra-01 ansible_host=192.168.100.21
infra-02 ansible_host=192.168.100.22

[harvester]
nuc-01 ansible_host=192.168.100.11
nuc-02 ansible_host=192.168.100.12
nuc-03 ansible_host=192.168.100.13

[all:vars]
ansible_user=rke
ansible_ssh_private_key_file=~/.ssh/id_ed25519
```

Generate an SSH key pair if you don't have one:

```bash
ssh-keygen -t ed25519 -C "enclave-admin" -f ~/.ssh/id_ed25519
```

## PXE Boot Assets

`nuc-00` will serve PXE boot for the Harvester nodes. Collect these during Day 0:

1. **Harvester ISO** — will be mounted or extracted on nuc-00's Apache root
2. **IPXE or PXELINUX** — provided by the `syslinux` package on Rocky Linux
3. **Harvester iPXE config** — from the Harvester documentation (modify IP addresses for your subnet)

Sample iPXE boot script (customize IPs):

```ipxe
#!ipxe
kernel http://192.168.100.10/harvester/vmlinuz \
  ip=dhcp \
  net.ifnames=1 \
  rd.cos.disable \
  rd.noverifyssl \
  console=tty1 \
  root=live:http://192.168.100.10/harvester/rootfs.squashfs \
  harvester.install.automatic=true \
  harvester.install.config_url=http://192.168.100.10/harvester/config-nuc-01.yaml
initrd http://192.168.100.10/harvester/initrd
boot
```

## Helm Chart Sources

The following Helm repos are needed. Pull them in advance if working air-gapped:

```bash
# cert-manager
helm repo add jetstack https://charts.jetstack.io

# Rancher (RGS channel)
helm repo add rancher-prime https://charts.rancher.com/server-charts/prime

helm repo update
```

To pre-pull charts for offline use:

```bash
helm pull jetstack/cert-manager --version v1.14.0 --destination ./helm-cache/
helm pull rancher-prime/rancher --version v2.8.x --destination ./helm-cache/
```

## Container Image Pre-Pull (Air Gap)

For fully air-gapped deployments, use Hauler or `cosign` to mirror RGS Carbide images to a local registry. The `hauler` tool is the recommended approach:

```bash
# Install hauler
curl -sfL https://get.hauler.dev | bash

# Mirror Rancher images
hauler store sync --files rancher-images.txt
hauler store serve
```

Contact RGS for the Carbide image list and credentials.

## Day 0 Checklist

- [ ] Rocky Linux 9 ISO downloaded and checksum verified
- [ ] Harvester ISO downloaded and checksum verified
- [ ] Workstation tools installed: kubectl, helm, ansible, k9s
- [ ] SSH key pair generated
- [ ] Ansible inventory stub created
- [ ] Helm chart repos added (or charts pre-pulled)
- [ ] PXE boot scripts drafted with correct IPs
- [ ] IP address plan finalized (see [Network Planning](./network-planning))
- [ ] Hardware assembled and powered on (see [Hardware](./hardware))
