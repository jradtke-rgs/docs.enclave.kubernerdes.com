---
id: admin-host
title: Admin Host Setup
sidebar_label: Admin Host
sidebar_position: 2
---

# Admin Host Setup (nuc-00)

`nuc-00` is the foundation of the enclave. It runs:
- **KVM/libvirt** — hypervisor for infrastructure VMs
- **Apache httpd** — serves Harvester ISO and kickstart files via HTTP
- **TFTP** — serves PXE boot files (pxelinux, iPXE)
- **LVM** — flexible storage for VM disks

## 1. openSUSE Leap 15.5 Installation

Boot `nuc-00` from the openSUSE Leap 15.5 ISO. Use the YaST installer TUI or an AutoYaST profile for automated installation.

Partition layout:

| Mount | Size | Type |
|-------|------|------|
| `/boot/efi` | 512 MB | EFI System |
| `/boot` | 1 GB | ext4 |
| `/` | 100 GB | ext4 (LVM) |
| `(LVM PV)` | Remaining | LVM Physical Volume |

After installation, set a static IP:

```bash
# /etc/NetworkManager/system-connections/eth0.nmconnection
[ipv4]
method=manual
addresses=10.10.12.10/22
gateway=10.10.12.1
dns=8.8.8.8  # temporary until nuc-00-01 is up
```

Apply and verify:

```bash
nmcli connection reload
nmcli connection up eth0
ip addr show
ping 10.10.12.1
```

## 2. System Preparation

```bash
# Update system
zypper --non-interactive update

# Install required packages
zypper install -y \
  qemu-kvm \
  libvirt \
  virt-install \
  virt-manager \
  bridge-utils \
  apache2 \
  tftp \
  syslinux \
  lvm2 \
  git \
  vim \
  tmux

# Enable services
systemctl enable --now libvirtd apache2 tftp.socket

# Allow HTTP through firewall
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=tftp
firewall-cmd --permanent --add-port=8080/tcp
firewall-cmd --reload
```

## 3. LVM Setup for VM Disks

The remaining NVMe space becomes an LVM volume group hosting three infrastructure VMs:

```bash
# Identify the PV partition (adjust device name as needed)
PV_DEV=/dev/nvme0n1p4

# Create PV and VG
pvcreate ${PV_DEV}
vgcreate vg-infra ${PV_DEV}

# Create logical volumes for VMs
lvcreate -L 40G -n lv-nuc-00-01 vg-infra
lvcreate -L 40G -n lv-nuc-00-02 vg-infra
lvcreate -L 40G -n lv-nuc-00-03 vg-infra

# Verify
vgs
lvs
```

## 4. Apache PXE HTTP Server

Harvester nodes will download their OS over HTTP from `nuc-00`.

```bash
# Create document root for Harvester files
mkdir -p /var/www/html/harvester

# Mount or copy Harvester ISO contents
mount -o loop /path/to/harvester-v1.7.1-amd64.iso /mnt/harvester-iso
cp -r /mnt/harvester-iso/* /var/www/html/harvester/
umount /mnt/harvester-iso

# Test HTTP access
curl http://10.10.12.10/harvester/
```

## 5. TFTP PXE Boot Server

```bash
# Copy pxelinux files to TFTP root
mkdir -p /var/lib/tftpboot/pxelinux.cfg
cp /usr/share/syslinux/{pxelinux.0,ldlinux.c32,libcom32.c32,libutil.c32,vesamenu.c32} \
   /var/lib/tftpboot/

# Create default PXE menu
cat > /var/lib/tftpboot/pxelinux.cfg/default << 'EOF'
DEFAULT menu.c32
PROMPT 0
TIMEOUT 50
MENU TITLE Kubernerdes Enclave PXE Boot

LABEL harvester
  MENU LABEL Install Harvester
  KERNEL harvester/vmlinuz
  APPEND initrd=harvester/initrd ip=dhcp rd.cos.disable rd.noverifyssl \
    console=tty1 root=live:http://10.10.12.10/harvester/rootfs.squashfs \
    harvester.install.automatic=true \
    harvester.install.config_url=http://10.10.12.10/harvester/config-HOSTNAME.yaml

LABEL local
  MENU LABEL Boot from local disk
  LOCALBOOT 0
EOF
```

Per-node Harvester config files are served from `/var/www/html/harvester/`. See [Harvester Cluster](./harvester-cluster) for config file content.

## 6. SSH Key Distribution

Generate and distribute the admin SSH key:

```bash
# On your workstation
ssh-keygen -t ed25519 -C "enclave-admin" -f ~/.ssh/id_enclave

# Copy to nuc-00
ssh-copy-id -i ~/.ssh/id_enclave.pub mansible@10.10.12.10
```

From `nuc-00`, the same key will be pushed to VMs during their creation.

## 7. Verification

```bash
# KVM is running
systemctl is-active libvirtd
virsh list --all

# Apache is serving files
curl -s -o /dev/null -w "%{http_code}" http://10.10.12.10/harvester/
# Expected: 200

# TFTP is running
systemctl is-active tftp.socket

# LVM is ready
lvs vg-infra
# Should show lv-nuc-00-01, lv-nuc-00-02, and lv-nuc-00-03

# Network reachability to switch/uplink
ping -c 4 10.10.12.1
```

All checks passing? Proceed to [Infrastructure VMs](./infrastructure-vms).
