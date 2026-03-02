---
id: day-0
title: Day 0 — Design
sidebar_label: Overview
sidebar_position: 1
---

# Day 0 — Design

Day 0 is about making decisions before any hardware is racked or software installed. Mistakes made here cascade through every subsequent phase — take the time to get the design right.

## What Day 0 Covers

| Topic | Document |
|-------|----------|
| Hardware bill of materials, NUC specs, cabling | [Hardware](./hardware) |
| IP address scheme, DNS zones, DHCP scopes, VIPs | [Network Planning](./network-planning) |
| OS images, tooling downloads, offline prep | [Prerequisites](./prerequisites) |

## Key Design Decisions

### Single Management Segment

All nodes share a single flat `/24` management network (`192.168.100.0/24`). There is no VLAN separation in the base design — the enclave is physically isolated, so a flat L2 network is acceptable and simplifies the initial build. VLANs can be added later via Harvester's network configuration.

### Bootstrapped Infrastructure

Infrastructure services (DHCP, DNS, load balancing) run as KVM VMs on `nuc-00`, the admin host. This means:

- `nuc-00` must come up first and be healthy before any Harvester nodes can PXE boot
- Loss of `nuc-00` disrupts DHCP/DNS but does **not** bring down the running Harvester cluster (leases persist)
- `infra-02`'s HAProxy + Keepalived provides VIP redundancy for the Harvester API and Rancher Manager

### Air-Gap Ready

The design assumes internet access is available during Day 1 setup for pulling images and packages, but all components should be configured to operate without outbound internet after provisioning. RGS Carbide's registry mirroring is the mechanism for ongoing air-gapped image distribution.

## Outcomes

By the end of Day 0, you should have:

- [ ] Hardware procured, racked, and powered on for initial access
- [ ] Network switch configured (if managed), cables labeled
- [ ] IP address plan documented and agreed upon
- [ ] DNS/DHCP zones and scopes planned
- [ ] All required ISO images and packages downloaded
- [ ] Workstation tools installed (Ansible, kubectl, Helm, etc.)
