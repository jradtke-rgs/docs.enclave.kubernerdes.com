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
- **Rancher Manager** — multi-cluster management UI deployed on a K3s VM inside Harvester
- **Infrastructure services** — ISC DHCP, BIND DNS, HAProxy load balancer, Keepalived VIP failover
- **RGS Carbide** — hardened, FIPS-capable distribution layer for supply-chain-secure container images

The enclave is designed to boot from bare metal with PXE, operate without internet access after initial provisioning, and recover from single-node failures.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    192.168.100.0/24                         │
│                                                             │
│  nuc-00 (admin)          nuc-01/02/03 (Harvester cluster)  │
│  ┌─────────────────┐     ┌──────────────────────────────┐  │
│  │ KVM hypervisor  │     │  Harvester HCI               │  │
│  │                 │     │  ┌──────────────────────┐    │  │
│  │ ┌─────────────┐ │     │  │  K3s VM (Rancher Mgr)│    │  │
│  │ │ infra-01    │ │     │  │  192.168.100.50 VIP  │    │  │
│  │ │ DHCP + DNS  │ │     │  └──────────────────────┘    │  │
│  │ └─────────────┘ │     │                              │  │
│  │ ┌─────────────┐ │     │  192.168.100.11-13           │  │
│  │ │ infra-02    │ │     └──────────────────────────────┘  │
│  │ │ HAProxy +   │ │                                        │
│  │ │ Keepalived  │ │                                        │
│  │ └─────────────┘ │                                        │
│  │                 │                                        │
│  │ Apache + TFTP   │                                        │
│  │ (PXE server)    │                                        │
│  └─────────────────┘                                        │
└─────────────────────────────────────────────────────────────┘
```

## Node Roles

| Host | IP | Role |
|------|----|------|
| nuc-00 | 192.168.100.10 | Admin host: KVM, PXE (Apache/TFTP), infra VMs |
| nuc-01 | 192.168.100.11 | Harvester node 1 |
| nuc-02 | 192.168.100.12 | Harvester node 2 |
| nuc-03 | 192.168.100.13 | Harvester node 3 |
| infra-01 | 192.168.100.21 | DHCP (ISC), DNS (BIND) |
| infra-02 | 192.168.100.22 | HAProxy, Keepalived |
| rancher-vip | 192.168.100.50 | Keepalived VIP for Rancher Manager |
| harvester-vip | 192.168.100.60 | Keepalived VIP for Harvester API |

## Day 0/1/2 Framework

This documentation is organized around the standard operational lifecycle:

| Phase | Focus | Where to Start |
|-------|-------|----------------|
| **Day 0** | Design & planning | [Day 0 Overview](/docs/day-0) |
| **Day 1** | Initial deployment | [Day 1 Overview](/docs/day-1) |
| **Day 2** | Ongoing operations | [Day 2 Overview](/docs/day-2) |

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
