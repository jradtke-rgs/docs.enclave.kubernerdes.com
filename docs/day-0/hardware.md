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
| 4 | Intel NUC 12 Pro (NUC12WSHi7 or similar) | Compute nodes |
| 4 | 64 GB DDR4 SO-DIMM (2× 32 GB) | RAM per node |
| 4 | 1 TB NVMe SSD (primary) | OS/boot per node |
| 3 | 2 TB NVMe SSD (secondary) | Longhorn/Harvester data (nuc-01/02/03) |
| 1 | 8-port gigabit switch (unmanaged or managed) | LAN fabric |
| 5 | Cat6 patch cables | Node-to-switch + uplink |
| 1 | USB keyboard + HDMI display (or KVM) | Initial console access |
| 4 | USB flash drives (≥ 8 GB) | Bootable OS installers |

> **Note on NUC generation:** The design was validated on NUC 12 Pro units. NUC 13 and compatible mini-PCs (ASUS NUC, Beelink EQ series) should also work with minor BIOS adjustments.

## NUC Specifications

### nuc-00 (Admin Host)

| Component | Spec |
|-----------|------|
| CPU | Intel Core i7-1260P (12c/16t) |
| RAM | 64 GB DDR4-3200 |
| Storage | 1 TB NVMe (OS + VMs) |
| Network | Intel I225-V 2.5 GbE onboard |
| Role | KVM host, PXE server, infra VMs |

The admin host runs KVM and hosts two VMs (`infra-01`, `infra-02`) providing DHCP, DNS, HAProxy, and Keepalived. It also serves PXE/HTTP for Harvester installation.

An LVM volume group is created from the NVMe drive to provide flexible VM disk allocation:

```
/dev/nvme0n1p1  → /boot/efi       (512 MB)
/dev/nvme0n1p2  → /boot           (1 GB)
/dev/nvme0n1p3  → / (ext4)        (100 GB)
/dev/nvme0n1p4  → LVM PV          (remainder)
  └── vg-infra
      ├── lv-infra-01 (40 GB)   → infra-01 VM disk
      └── lv-infra-02 (40 GB)   → infra-02 VM disk
```

### nuc-01, nuc-02, nuc-03 (Harvester Cluster)

| Component | Spec |
|-----------|------|
| CPU | Intel Core i7-1260P (12c/16t) |
| RAM | 64 GB DDR4-3200 |
| Storage (primary) | 1 TB NVMe (Harvester OS) |
| Storage (secondary) | 2 TB NVMe (Longhorn data volumes) |
| Network | Intel I225-V 2.5 GbE onboard |
| Role | Harvester HCI nodes |

Harvester uses the primary NVMe for its OS and etcd, and the secondary NVMe is added to the Longhorn storage pool for persistent volume claims.

## Physical Layout

```
┌─────────────────────────────────────────────┐
│  8-port Switch                              │
│  Port 1: uplink (optional, to home router)  │
│  Port 2: nuc-00 (admin)                     │
│  Port 3: nuc-01 (harvester)                 │
│  Port 4: nuc-02 (harvester)                 │
│  Port 5: nuc-03 (harvester)                 │
│  Port 6-8: spare                            │
└─────────────────────────────────────────────┘
```

## BIOS Configuration

Apply the following BIOS settings to each NUC before OS installation:

1. **Boot order:** Network (PXE) first, NVMe second
2. **Secure Boot:** Disabled (required for Harvester PXE boot)
3. **VT-x / VT-d:** Enabled (required for KVM on nuc-00)
4. **Wake-on-LAN:** Enabled (optional, useful for remote power-on)
5. **Auto power-on:** Enabled after power loss (optional, for recovery)

Access the BIOS via **F2** during POST, or **F7** for the one-time boot menu.

## Cabling Notes

- Label each cable at both ends (e.g., `nuc-00 ↔ sw-p2`)
- Use different cable colors if possible: blue for management, yellow for uplink
- Leave slack for future additions — don't cable-tie too tight

## Power Consumption

| State | Per NUC | 4× NUCs |
|-------|---------|---------|
| Idle | ~15 W | ~60 W |
| Moderate load | ~45 W | ~180 W |
| Peak load | ~65 W | ~260 W |

The full cluster draws roughly 2–3 amps at 120V under normal load — a standard outlet circuit handles this comfortably.
