---
id: prerequisites
title: Prerequisites
sidebar_label: Prerequisites
sidebar_position: 4
---

# Prerequisites

Before beginning Day 1, download all required images and install workstation tooling. If you're building an air-gapped enclave, this is the last opportunity to pull anything from the internet.

## Request Carbide License
Contact your Rancher Government Solutions team to discuss your goals and to request your Carbide Key.  Typically this discussion will include timelines, KPIs and success criteria, etc.. 

## OS Images

| Image | Version | Use |
|-------|---------|-----|
| openSUSE Leap 15.5 ISO | 15.5 | nuc-00 admin host OS |
| Harvester ISO | v1.7.1 | Harvester nodes (nuc-01/02/03) |

Download locations:
- openSUSE Leap: https://get.opensuse.org/leap/15.5/
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
VERSION=v1.7.1
curl -Lo virtctl https://github.com/kubevirt/kubevirt/releases/download/${VERSION}/virtctl-${VERSION}-darwin-amd64
chmod +x virtctl
sudo mv virtctl /usr/local/bin/
```

## Ansible Inventory Pre-Work

The enclave repo uses Ansible for configuration management. Prepare your inventory before Day 1:

```ini
# Ansible/hosts
[InfraNodesPhysical]
nuc-00 ansible_host=10.10.12.10

[InfraNodesVirtualMachines]
nuc-00-01 ansible_host=10.10.12.8
nuc-00-02 ansible_host=10.10.12.9
nuc-00-03 ansible_host=10.10.12.93

[HarvesterEdge]
nuc-01 ansible_host=10.10.12.101
nuc-02 ansible_host=10.10.12.102
nuc-03 ansible_host=10.10.12.103

[all:vars]
ansible_user=mansible
ansible_become=true
ansible_python_interpreter=/usr/bin/python3
ansible_ssh_private_key_file=~/.ssh/id_ed25519
```

Generate an SSH key pair if you don't have one:

```bash
ssh-keygen -t ed25519 -C "enclave-admin" -f ~/.ssh/id_ed25519
```

## PXE Boot Assets

`nuc-00` will serve PXE boot for the Harvester nodes. Collect these during Day 0:

1. **Harvester ISO** — will be mounted or extracted on nuc-00's Apache root
2. **IPXE or PXELINUX** — provided by the `syslinux` package on openSUSE Leap
3. **Harvester iPXE config** — from the Harvester documentation (modify IP addresses for your subnet)

Sample iPXE boot script (customize IPs):

```ipxe
#!ipxe
kernel http://10.10.12.10/harvester/vmlinuz \
  ip=dhcp \
  net.ifnames=1 \
  rd.cos.disable \
  rd.noverifyssl \
  console=tty1 \
  root=live:http://10.10.12.10/harvester/rootfs.squashfs \
  harvester.install.automatic=true \
  harvester.install.config_url=http://10.10.12.10/harvester/config-nuc-01.yaml
initrd http://10.10.12.10/harvester/initrd
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
helm pull rancher-prime/rancher --destination ./helm-cache/
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

- [ ] openSUSE Leap 15.5 ISO downloaded and checksum verified
- [ ] Harvester v1.7.1 ISO downloaded and checksum verified
- [ ] Workstation tools installed: kubectl, helm, ansible, k9s
- [ ] SSH key pair generated
- [ ] Ansible inventory stub created
- [ ] Helm chart repos added (or charts pre-pulled)
- [ ] PXE boot scripts drafted with correct IPs
- [ ] IP address plan finalized (see [Network Planning](./network-planning))
- [ ] Hardware assembled and powered on (see [Hardware](./hardware))
