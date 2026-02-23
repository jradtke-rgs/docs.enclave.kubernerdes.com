---
id: network-planning
title: Network Planning
sidebar_label: Network Planning
sidebar_position: 3
---

# Network Planning

## Subnet Design

The enclave uses a single flat management network:

| Parameter | Value |
|-----------|-------|
| Network | `10.10.12.0/22` |
| Subnet mask | `255.255.252.0` |
| Gateway | `10.10.12.1` (Sophos XGS88 firewall) |
| Static range | `10.10.12.1–10.10.12.254` |
| DHCP pool | `10.10.15.0–10.10.15.254` |

## Static IP Assignments

### Physical Hosts

| Host | IP | Purpose |
|------|----|---------|
| nuc-00 | `10.10.12.10` | Admin host (KVM, PXE, infra VMs) |
| nuc-01 | `10.10.12.101` | Harvester node 1 |
| nuc-02 | `10.10.12.102` | Harvester node 2 |
| nuc-03 | `10.10.12.103` | Harvester node 3 |

### Infrastructure VMs (on nuc-00)

| Host | IP | Purpose |
|------|----|---------|
| nuc-00-01 | `10.10.12.8` | DHCP (ISC), DNS primary (BIND) |
| nuc-00-02 | `10.10.12.9` | DNS secondary (BIND) |
| nuc-00-03 | `10.10.12.93` | HAProxy, Keepalived |

### KVM/Baseboard Management

| Host | IP | Purpose |
|------|----|---------|
| nuc-01-kvm | `10.10.12.111` | nuc-01 KVM/BMC |
| nuc-02-kvm | `10.10.12.112` | nuc-02 KVM/BMC |
| nuc-03-kvm | `10.10.12.113` | nuc-03 KVM/BMC |

### Rancher Cluster VMs (inside Harvester)

| Host | IP | Purpose |
|------|----|---------|
| rancher-01 | `10.10.12.211` | Rancher Manager K3s node 1 |
| rancher-02 | `10.10.12.212` | Rancher Manager K3s node 2 |
| rancher-03 | `10.10.12.213` | Rancher Manager K3s node 3 |

### Virtual IPs

| Name | IP | Purpose |
|------|----|---------|
| harvester-edge | `10.10.12.100` | Harvester API/UI VIP (managed by Harvester) |
| nuc-00-03-vip | `10.10.12.193` | HAProxy/Keepalived management VIP |
| rancher | `10.10.12.210` | Keepalived VIP — Rancher Manager |

> VIP addresses (`10.10.12.193`, `10.10.12.210`) are managed by Keepalived on `nuc-00-03` and float on the network — they are not statically assigned to any interface.

## DNS Zones

The enclave uses a single authoritative zone: `enclave.kubernerdes.com`

DNS is served by BIND on `nuc-00-01` (primary) and `nuc-00-02` (secondary).

### Forward Zone Records

```dns
; enclave.kubernerdes.com zone file
$TTL 3600
@  IN SOA  ns1.enclave.kubernerdes.com. admin.enclave.kubernerdes.com. (
              2024010101 ; serial
              3600       ; refresh
              900        ; retry
              604800     ; expire
              300 )      ; minimum TTL

; Name servers
@           IN NS    ns1.enclave.kubernerdes.com.
@           IN NS    ns2.enclave.kubernerdes.com.
ns1         IN A     10.10.12.8
ns2         IN A     10.10.12.9

; Network infrastructure
sophos-xgs88     IN A     10.10.12.1
cisco-sg300-28   IN A     10.10.12.2

; Admin / PXE host
nuc-00      IN A     10.10.12.10

; Infrastructure VMs
nuc-00-01   IN A     10.10.12.8
nuc-00-02   IN A     10.10.12.9
nuc-00-03   IN A     10.10.12.93

; Harvester nodes
nuc-01      IN A     10.10.12.101
nuc-02      IN A     10.10.12.102
nuc-03      IN A     10.10.12.103

; KVM/BMC interfaces
nuc-01-kvm  IN A     10.10.12.111
nuc-02-kvm  IN A     10.10.12.112
nuc-03-kvm  IN A     10.10.12.113

; Harvester cluster VIP
harvester-edge   IN A     10.10.12.100

; Rancher cluster VMs
rancher-01  IN A     10.10.12.211
rancher-02  IN A     10.10.12.212
rancher-03  IN A     10.10.12.213

; Virtual IPs
nuc-00-03-vip    IN A     10.10.12.193
rancher          IN A     10.10.12.210

; Wildcard for Rancher ingress
*.rancher        IN A     10.10.12.210
```

### Reverse Zone Records

```dns
; 12.10.10.in-addr.arpa zone file
$TTL 3600
@  IN SOA  ns1.enclave.kubernerdes.com. admin.enclave.kubernerdes.com. (
              2024010101 3600 900 604800 300 )

@   IN NS   ns1.enclave.kubernerdes.com.
@   IN NS   ns2.enclave.kubernerdes.com.

8   IN PTR  nuc-00-01.enclave.kubernerdes.com.
9   IN PTR  nuc-00-02.enclave.kubernerdes.com.
10  IN PTR  nuc-00.enclave.kubernerdes.com.
93  IN PTR  nuc-00-03.enclave.kubernerdes.com.
100 IN PTR  harvester-edge.enclave.kubernerdes.com.
101 IN PTR  nuc-01.enclave.kubernerdes.com.
102 IN PTR  nuc-02.enclave.kubernerdes.com.
103 IN PTR  nuc-03.enclave.kubernerdes.com.
111 IN PTR  nuc-01-kvm.enclave.kubernerdes.com.
112 IN PTR  nuc-02-kvm.enclave.kubernerdes.com.
113 IN PTR  nuc-03-kvm.enclave.kubernerdes.com.
193 IN PTR  nuc-00-03-vip.enclave.kubernerdes.com.
210 IN PTR  rancher.enclave.kubernerdes.com.
211 IN PTR  rancher-01.enclave.kubernerdes.com.
212 IN PTR  rancher-02.enclave.kubernerdes.com.
213 IN PTR  rancher-03.enclave.kubernerdes.com.
```

## DHCP Scopes

DHCP is served by ISC DHCP on `nuc-00-01`. The primary pool serves the dynamic range (`10.10.15.x`) for any unregistered devices. Harvester nodes receive static leases by MAC address to ensure consistent PXE boot behavior.

```
subnet 10.10.12.0 netmask 255.255.252.0 {
  range 10.10.15.0 10.10.15.254;
  option routers 10.10.12.1;
  option domain-name-servers 10.10.12.8, 10.10.12.9;
  option domain-name "enclave.kubernerdes.com";
  next-server 10.10.12.10;
  filename "pxelinux.0";
  default-lease-time 7200;
  max-lease-time 7200;
}

# Static leases for Harvester nodes (PXE)
host nuc-01 {
  hardware ethernet 48:21:0b:65:ce:e5;
  fixed-address 10.10.12.101;
  option host-name "nuc-01";
}
host nuc-02 {
  hardware ethernet 48:21:0b:65:c2:c7;
  fixed-address 10.10.12.102;
  option host-name "nuc-02";
}
host nuc-03 {
  hardware ethernet 48:21:0b:5d:7a:e6;
  fixed-address 10.10.12.103;
  option host-name "nuc-03";
}
```

## Virtual IP Planning

Two VIPs are managed by Keepalived on `nuc-00-03`, with HAProxy as the active load balancer:

### `10.10.12.210` — Rancher Manager VIP

| Backend | Port | Protocol |
|---------|------|----------|
| rancher-01:443 | 443 | HTTPS passthrough |
| rancher-02:443 | 443 | HTTPS passthrough |
| rancher-03:443 | 443 | HTTPS passthrough |
| rancher-01:80 | 80 | HTTP |
| rancher-01:6443 | 6443 | K8s API |

### `10.10.12.100` — Harvester API/UI VIP

This VIP is managed internally by Harvester (not HAProxy/Keepalived). It is configured during Harvester cluster creation on `nuc-01` and floats across the Harvester nodes automatically.

HAProxy health-checks the Rancher backends and only routes to healthy nodes.

## Firewall / Ports

No external firewall is assumed in the base design (all nodes are on the same LAN segment). If you add a firewall or router between segments, open these ports:

| Service | Port | Protocol |
|---------|------|----------|
| Harvester API | 6443 | TCP |
| Harvester UI | 443 | TCP |
| Rancher Manager | 443 | TCP |
| Rancher K8s API | 6443 | TCP |
| DHCP | 67, 68 | UDP |
| DNS | 53 | TCP + UDP |
| TFTP (PXE) | 69 | UDP |
| HTTP (PXE/Kickstart) | 80 | TCP |

## DNS Client Configuration

All nodes should use `nuc-00-01` (`10.10.12.8`) as their primary DNS resolver and `nuc-00-02` (`10.10.12.9`) as secondary. During initial setup before these VMs are running, use a temporary public resolver (e.g., `8.8.8.8`) for package downloads.
