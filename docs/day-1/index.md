---
id: day-1
title: Day 1 — Build
sidebar_label: Overview
sidebar_position: 1
---

# Day 1 — Build

Day 1 is the initial deployment phase — turning bare-metal hardware into a running Kubernetes platform. Work through these steps **in order**: each stage depends on the previous one being healthy.

## Build Order

```
1. Admin Host (nuc-00)
   └── OS install, KVM, Apache, TFTP, HTTP/S (ISOS, etc..), LVM, SSH keys

2. Infrastructure VMs (on nuc-00)
   ├── infra-01: ISC DHCP + BIND DNS (pirmary)
   └── infra-02: BIND DNS (replica) + bastion 
   └── infra-03: HAProxy + Keepalived

3. Harvester Cluster (nuc-01/02/03)
   └── PXE boot → automated install → cluster join

4. Rancher Manager (inside Harvester)
   └── K3s VM → cert-manager → Rancher Helm deploy
```

## Build Steps

| Step | Document | Estimated Time |
|------|----------|----------------|
| 1. Admin host setup | [Admin Host](./admin-host.md) | 45–60 min |
| 2. Infrastructure VMs | [Infrastructure VMs](./infrastructure-vms.md) | 30–45 min |
| 3. Harvester cluster | [Harvester Cluster](./harvester-cluster.md) | 60–90 min |
| 4. Rancher Manager | [Rancher Manager](./rancher-manager.md) | 30–45 min |

Total Day 1 build time: approximately **3–4 hours** for a first-time deployment, less than 2 hours for subsequent runs with the automation in place.

## Prerequisites

Before starting Day 1:

- All Day 0 checklist items complete (see [Prerequisites](../day-0/prerequisites.md))
- All 4 NUCs powered on and network cables connected to switch
- ISO images available on your workstation
- SSH key pair ready

## Health Checks Between Stages

Do not proceed to the next stage until the current stage passes its health checks. Each build document ends with a verification section. Use these as gates before continuing.

## Idempotency

The Ansible playbooks in the source repo are designed to be idempotent — you can re-run them safely if a step fails partway through. Shell scripts are generally **not** idempotent; check their status before re-running.
