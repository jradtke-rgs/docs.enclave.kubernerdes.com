---
id: day-2
title: Day 2 — Operate
sidebar_label: Overview
sidebar_position: 1
---

# Day 2 — Operate

Day 2 is everything that happens after the initial deployment — keeping the enclave healthy, backed up, and diagnosable.

## Operations Areas

| Topic | Document |
|-------|----------|
| Dashboards, metrics, health monitoring | [Monitoring](./monitoring) |
| Backups, config management, Ansible | [Backup & Maintenance](./backup-maintenance) |
| Common issues, kubectl snippets, cert debugging | [Troubleshooting](./troubleshooting) |

## Operational Principles

### Know Your Blast Radius

The enclave is a 3-node Harvester cluster using etcd for distributed state. Understand the failure modes:

| Failure | Impact | Recovery |
|---------|--------|----------|
| 1 Harvester node down | Cluster continues (2/3 quorum) | Bring node back up; auto-recovers |
| 2+ Harvester nodes down | Cluster halted (no quorum) | Manual etcd recovery required |
| infra-01 (DHCP/DNS) down | New DHCP leases fail; DNS fails | Restart VM; existing connections survive |
| infra-02 (HAProxy/Keepalived) down | VIPs go offline | Restart VM or promote backup |
| nuc-00 down | infra VMs offline; PXE unavailable | Bring nuc-00 back up |

### Change Management

Treat the enclave like production:

- Test changes on a single node before rolling to all three
- Keep the Ansible playbooks in version control; commit before **and** after changes
- Document any manual changes immediately — the next person (future you) needs to know

### Patching Cadence

| Component | Cadence | Method |
|-----------|---------|--------|
| openSUSE Leap 15.5 (nuc-00, VMs) | Monthly | `zypper update -y` via Ansible |
| Harvester | Per release | Harvester UI upgrade wizard |
| Rancher Manager | Per release | `helm upgrade` |
| K3s (on rancher-mgr) | With Rancher | Auto or manual |
| cert-manager | Quarterly | `helm upgrade` |

## Day 2 Runbooks

Quick reference for common tasks:

```bash
# Check overall cluster health
kubectl get nodes
kubectl get pods -A | grep -v Running | grep -v Completed

# Check Rancher pods
kubectl --kubeconfig ~/.kube/rancher-k3s-config get pods -n cattle-system

# Restart a stuck VM in Harvester
virtctl restart <vm-name> -n <namespace>

# Force-drain a Harvester node for maintenance
kubectl drain nuc-02 --ignore-daemonsets --delete-emptydir-data
# After maintenance:
kubectl uncordon nuc-02
```
