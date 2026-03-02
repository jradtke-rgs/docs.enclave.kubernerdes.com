---
id: getting-started
title: Getting Started
sidebar_label: Getting Started
sidebar_position: 1
---

# Getting Started

Welcome to the **Kubernerdes Enclave** documentation — a self-sustaining, air-gap-ready Kubernetes cluster running [Rancher Government Solutions (RGS) Carbide](https://ranchergovernment.com/carbide) on a fleet of Intel NUCs.

## What You'll Build

A fully operational, on-premises Kubernetes platform consisting of:

- **4× Intel NUC** nodes — one admin/bootstrap host plus a 3-node Harvester hypervisor cluster
- **Harvester HCI** — open-source hyperconverged infrastructure for VMs and Kubernetes workloads
- **Rancher Manager** — multi-cluster management UI deployed on a 3-node K3s cluster inside Harvester
- **Infrastructure services** — ISC DHCP, BIND DNS, HAProxy load balancer, Keepalived VIP failover
- **RGS Carbide** — hardened, FIPS-capable distribution layer for supply-chain-secure container images

The enclave is designed to boot from bare metal with PXE, operate without internet access after initial provisioning, and recover from single-node failures.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│              CIDR: 10.10.12.0/22                            │
│                                                             │
│  nuc-00 (admin)          nuc-01/02/03 (Harvester cluster)   │
│  ┌──────────────────┐     ┌──────────────────────────────┐  │
│  │ KVM hypervisor   │     │  Harvester HCI               │  │
│  │                  │     │  VIP: 10.10.12.100           │  │
│  │ ┌──────────────┐ │     │  ┌──────────────────────┐    │  │
│  │ │ nuc-00-01    │ │     │  │  rancher-01/02/03    │    │  │
│  │ │ DHCP + DNS   │ │     │  │  K3s HA cluster      │    │  │
│  │ └──────────────┘ │     │  │  VIP: 10.10.12.210   │    │  │
│  │ ┌──────────────┐ │     │  └──────────────────────┘    │  │
│  │ │ nuc-00-02    │ │     │                              │  │
│  │ │ DNS secondary│ │     │  10.10.12.101-103            │  │
│  │ └──────────────┘ │     └──────────────────────────────┘  │
│  │ ┌──────────────┐ │                                       │
│  │ │ nuc-00-03    │ │                                       │
│  │ │ HAProxy +    │ │                                       │
│  │ │ Keepalived   │ │                                       │
│  │ └──────────────┘ │                                       │
│  │                  │                                       │
│  │ Apache + TFTP    │                                       │
│  │ (PXE server)     │                                       │
│  └──────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

## Node Roles

| Host | IP | Role |
|------|----|------|
| nuc-00 | `10.10.12.10` | Admin host: KVM, PXE (Apache/TFTP), infra VMs |
| nuc-00-01 | `10.10.12.8` | DHCP (ISC), DNS primary (BIND) |
| nuc-00-02 | `10.10.12.9` | DNS secondary (BIND) |
| nuc-00-03 | `10.10.12.93` | HAProxy, Keepalived |
| harvester-edge (VIP) | `10.10.12.100` | Harvester API/UI virtual IP |
| nuc-01 | `10.10.12.101` | Harvester node 1 |
| nuc-02 | `10.10.12.102` | Harvester node 2 |
| nuc-03 | `10.10.12.103` | Harvester node 3 |
| rancher (VIP) | `10.10.12.210` | Keepalived VIP for Rancher Manager |
| rancher-01 | `10.10.12.211` | Rancher Manager K3s node 1 (Harvester VM) |
| rancher-02 | `10.10.12.212` | Rancher Manager K3s node 2 (Harvester VM) |
| rancher-03 | `10.10.12.213` | Rancher Manager K3s node 3 (Harvester VM) |

## Day 0/1/2 Framework

This documentation is organized around the standard operational lifecycle:

| Phase | Focus | Where to Start |
|-------|-------|----------------|
| **Day 0** | Design & planning | [Day 0 Overview](./day-0/index.md) |
| **Day 1** | Initial deployment | [Day 1 Overview](./day-1/index.md) |
| **Day 2** | Ongoing operations | [Day 2 Overview](./day-2/index.md) |

## Prerequisites

Before diving in, you should be comfortable with:

- Linux command line (SSH, `systemctl`, `journalctl`)
- Basic networking concepts (subnets, VLANs, DNS, DHCP)
- YAML — for Kubernetes manifests and Harvester config
- Kubernetes basics (pods, deployments, services)
- KVM/libvirt virtualization concepts

## Source Repository

The automation and configuration source lives at:
👉 [enclave.kubernerdes.com](https://github.com/jradtke-rgs/enclave.kubernerdes.com)

The repo contains Ansible playbooks, shell scripts, network configs, and Helm values files that implement everything described in this documentation.
