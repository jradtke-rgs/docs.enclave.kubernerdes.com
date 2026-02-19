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
| Network | `192.168.100.0/24` |
| Gateway | `192.168.100.1` (home router or uplink) |
| Broadcast | `192.168.100.255` |
| DHCP range | `192.168.100.100–192.168.100.200` |
| Static range | `192.168.100.10–192.168.100.60` |

## Static IP Assignments

| Host | IP | Purpose |
|------|----|---------|
| nuc-00 | `192.168.100.10` | Admin host (KVM, PXE, infra VMs) |
| nuc-01 | `192.168.100.11` | Harvester node 1 |
| nuc-02 | `192.168.100.12` | Harvester node 2 |
| nuc-03 | `192.168.100.13` | Harvester node 3 |
| infra-01 | `192.168.100.21` | DHCP + DNS VM |
| infra-02 | `192.168.100.22` | HAProxy + Keepalived VM |
| rancher-mgr | `192.168.100.30` | Rancher Manager node IP (inside Harvester) |
| rancher-vip | `192.168.100.50` | Keepalived VIP — Rancher Manager |
| harvester-vip | `192.168.100.60` | Keepalived VIP — Harvester API/UI |

> VIP addresses (`192.168.100.50`, `192.168.100.60`) are not assigned to any interface directly — they float between HAProxy/Keepalived instances.

## DNS Zones

The enclave uses a single authoritative zone: `kubernerdes.com`

### Forward Zone Records

```dns
; kubernerdes.com zone file
$TTL 3600
@  IN SOA  ns1.kubernerdes.com. admin.kubernerdes.com. (
              2024010101 ; serial
              3600       ; refresh
              900        ; retry
              604800     ; expire
              300 )      ; minimum TTL

; Name servers
@           IN NS    ns1.kubernerdes.com.
ns1         IN A     192.168.100.21

; Admin / PXE host
nuc-00      IN A     192.168.100.10
pxe         IN A     192.168.100.10

; Harvester nodes
nuc-01      IN A     192.168.100.11
nuc-02      IN A     192.168.100.12
nuc-03      IN A     192.168.100.13

; Infrastructure VMs
infra-01    IN A     192.168.100.21
infra-02    IN A     192.168.100.22

; Virtual IPs
rancher     IN A     192.168.100.50
harvester   IN A     192.168.100.60

; Wildcard for Rancher/Harvester ingress (if needed)
*.rancher   IN A     192.168.100.50
*.harvester IN A     192.168.100.60
```

### Reverse Zone Records

```dns
; 100.168.192.in-addr.arpa zone file
$TTL 3600
@  IN SOA  ns1.kubernerdes.com. admin.kubernerdes.com. (
              2024010101 3600 900 604800 300 )

@  IN NS   ns1.kubernerdes.com.

10  IN PTR  nuc-00.kubernerdes.com.
11  IN PTR  nuc-01.kubernerdes.com.
12  IN PTR  nuc-02.kubernerdes.com.
13  IN PTR  nuc-03.kubernerdes.com.
21  IN PTR  infra-01.kubernerdes.com.
22  IN PTR  infra-02.kubernerdes.com.
50  IN PTR  rancher.kubernerdes.com.
60  IN PTR  harvester.kubernerdes.com.
```

## DHCP Scopes

DHCP is served by ISC DHCP on `infra-01`. The primary pool serves the dynamic range for any unregistered devices. Harvester nodes receive static leases by MAC address to ensure consistent PXE boot behavior.

```
subnet 192.168.100.0 netmask 255.255.255.0 {
  range 192.168.100.100 192.168.100.200;
  option routers 192.168.100.1;
  option domain-name-servers 192.168.100.21;
  option domain-name "kubernerdes.com";
  default-lease-time 86400;
  max-lease-time 604800;
}

# Static leases for Harvester nodes (PXE)
host nuc-01 {
  hardware ethernet aa:bb:cc:dd:ee:11;
  fixed-address 192.168.100.11;
  next-server 192.168.100.10;
  filename "pxelinux.0";
}
# ... repeat for nuc-02, nuc-03
```

## Virtual IP Planning

Two VIPs are managed by Keepalived, with HAProxy on `infra-02` as the active load balancer:

### `192.168.100.50` — Rancher Manager VIP

| Backend | Port | Protocol |
|---------|------|----------|
| rancher-mgr:443 | 443 | HTTPS passthrough |
| rancher-mgr:80 | 80 | HTTP → redirect |

### `192.168.100.60` — Harvester API/UI VIP

| Backend | Port | Protocol |
|---------|------|----------|
| nuc-01:443 | 443 | HTTPS passthrough |
| nuc-02:443 | 443 | HTTPS passthrough |
| nuc-03:443 | 443 | HTTPS passthrough |

HAProxy health-checks the backends and only routes to healthy nodes.

## Firewall / Ports

No external firewall is assumed in the base design (all nodes are on the same LAN segment). If you add a firewall or router between segments, open these ports:

| Service | Port | Protocol |
|---------|------|----------|
| Harvester API | 6443 | TCP |
| Harvester UI | 443 | TCP |
| Rancher Manager | 443 | TCP |
| DHCP | 67, 68 | UDP |
| DNS | 53 | TCP + UDP |
| TFTP (PXE) | 69 | UDP |
| HTTP (PXE/Kickstart) | 80 | TCP |

## DNS Client Configuration

All nodes should use `infra-01` (`192.168.100.21`) as their primary DNS resolver. During initial setup before `infra-01` is running, use a temporary public resolver (e.g., `1.1.1.1`) for package downloads, then switch to `192.168.100.21` once BIND is operational.
