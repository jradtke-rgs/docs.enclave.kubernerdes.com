---
id: hardware
title: Hardware
sidebar_label: Hardware
sidebar_position: 2
---

# Hardware

## Bill of Materials

| Qty | Item | Role |
|-----|------|------|
| 1 | Intel NUC 13 Pro (NUC13ANHi3) | Admin host (nuc-00) |
| 3 | Intel NUC 13 Pro (NUC13ANHi7) | Harvester compute nodes (nuc-01/02/03) |
| 4 | 64 GB DDR4 SO-DIMM (2× 32 GB) | RAM per node |
| 4 | 1 TB NVMe SSD (primary) | OS/boot per node |
| 3 | 2 TB NVMe SSD (secondary) | Longhorn/Harvester data (nuc-01/02/03) |
| 1 | 16-port gigabit switch (managed) | LAN fabric |
| Several | Cat6 patch cables | Node-to-switch + uplink |
| 1 | USB keyboard + HDMI display (or KVM) | Initial console access |
| 4 | USB flash drives (≥ 8 GB) | Bootable OS installers |

## NUC Specifications

### nuc-00 (Admin Host) — NUC13ANHi3

| Component | Spec |
|-----------|------|
| Model | Intel NUC 13 Pro (NUC13ANHi3) |
| RAM | 64 GB DDR4 |
| Storage | 1 TB NVMe (OS + VMs) |
| Network | Onboard GbE |
| Role | KVM host, PXE server, infra VMs |

The admin host runs KVM and hosts three VMs (`nuc-00-01`, `nuc-00-02`, `nuc-00-03`) providing DHCP, DNS (primary and secondary), HAProxy, and Keepalived. It also serves PXE/HTTP for Harvester installation.

An LVM volume group is created from the NVMe drive to provide flexible VM disk allocation:

```
/dev/nvme0n1p1  → /boot/efi       (512 MB)
/dev/nvme0n1p2  → /boot           (1 GB)
/dev/nvme0n1p3  → / (ext4)        (100 GB)
/dev/nvme0n1p4  → LVM PV          (remainder)
  └── vg-infra
      ├── lv-nuc-00-01 (40 GB)  → nuc-00-01 VM disk
      ├── lv-nuc-00-02 (40 GB)  → nuc-00-02 VM disk
      └── lv-nuc-00-03 (40 GB)  → nuc-00-03 VM disk
```

### nuc-01, nuc-02, nuc-03 (Harvester Cluster) — NUC13ANHi7

| Component | Spec |
|-----------|------|
| Model | Intel NUC 13 Pro (NUC13ANHi7) |
| RAM | 64 GB DDR4 |
| Storage (primary) | 1 TB SSD (`/dev/sda` — Harvester OS) |
| Storage (secondary) | 2 TB NVMe (`/dev/nvme0n1` — Longhorn data volumes) |
| Network | Onboard GbE (`enp86s0`) |
| Role | Harvester HCI nodes |

Harvester uses the primary SSD for its OS and etcd, and the secondary NVMe is added to the Longhorn storage pool for persistent volume claims.

## Physical Layout

The enclave uses a 16-port managed switch. Port assignments:

```
┌─────────────────────────────────────────┐
│  16-port Switch                         │
│  Port  1: nuc-00       Port  9: nuc-02-kvm  │
│  Port  2: nuc-01       Port 10: nuc-03-kvm  │
│  Port  3: nuc-02       Port 11: (unused)    │
│  Port  4: nuc-03       Port 12: (unused)    │
│  Port  5: nuc-01-vms   Port 13: (unused)    │
│  Port  6: nuc-02-vms   Port 14: (unused)    │
│  Port  7: nuc-03-vms   Port 15: spark-e     │
│  Port  8: nuc-01-kvm   Port 16: uplink      │
└─────────────────────────────────────────┘
```

## BIOS Configuration

Apply the following BIOS settings to each NUC before OS installation:

1. **Boot order:** Network (PXE) first, SSD/NVMe second
2. **Secure Boot:** Disabled (required for Harvester PXE boot)
3. **VT-x / VT-d:** Enabled (required for KVM on nuc-00)
4. **Wake-on-LAN:** Enabled (optional, useful for remote power-on)
5. **Auto power-on:** Enabled after power loss (optional, for recovery)

Access the BIOS via **F2** during POST, or **F7** for the one-time boot menu.

## Cabling Notes

- Label each cable at both ends (e.g., `nuc-00 ↔ sw-p1`)
- Use different cable colors if possible: blue for management, yellow for uplink
- Leave slack for future additions — don't cable-tie too tight

## Power Consumption

| State | Per NUC | 4× NUCs |
|-------|---------|---------|
| Idle | ~15 W | ~60 W |
| Moderate load | ~45 W | ~180 W |
| Peak load | ~65 W | ~260 W |

The full cluster draws roughly 2–3 amps at 120V under normal load — a standard outlet circuit handles this comfortably.
