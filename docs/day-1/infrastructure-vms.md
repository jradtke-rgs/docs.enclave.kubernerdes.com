---
id: infrastructure-vms
title: Infrastructure VMs
sidebar_label: Infrastructure VMs
sidebar_position: 3
---

# Infrastructure VMs

Two VMs run on `nuc-00` providing shared infrastructure services:

| VM | IP | Services |
|----|-----|---------|
| `infra-01` | `192.168.100.21` | ISC DHCP, BIND DNS |
| `infra-02` | `192.168.100.22` | HAProxy, Keepalived |

Both VMs run Rocky Linux 9 minimal.

## Creating the VMs

Use `virt-install` on `nuc-00`:

```bash
# infra-01
virt-install \
  --name infra-01 \
  --vcpus 2 \
  --memory 4096 \
  --disk /dev/vg-infra/lv-infra-01,bus=virtio \
  --network bridge=virbr0,model=virtio \
  --os-variant rocky9 \
  --location /var/www/html/rocky9-minimal.iso \
  --initrd-inject /root/ks-infra-01.cfg \
  --extra-args "inst.ks=file:/ks-infra-01.cfg console=ttyS0" \
  --console pty,target_type=serial \
  --noautoconsole

# infra-02
virt-install \
  --name infra-02 \
  --vcpus 2 \
  --memory 4096 \
  --disk /dev/vg-infra/lv-infra-02,bus=virtio \
  --network bridge=virbr0,model=virtio \
  --os-variant rocky9 \
  --location /var/www/html/rocky9-minimal.iso \
  --initrd-inject /root/ks-infra-02.cfg \
  --extra-args "inst.ks=file:/ks-infra-02.cfg console=ttyS0" \
  --console pty,target_type=serial \
  --noautoconsole
```

Enable VMs to auto-start:

```bash
virsh autostart infra-01
virsh autostart infra-02
```

## infra-01: ISC DHCP + BIND DNS

### ISC DHCP Configuration

```bash
# Install on infra-01
dnf install -y dhcp-server bind bind-utils

# /etc/dhcp/dhcpd.conf
cat > /etc/dhcp/dhcpd.conf << 'EOF'
authoritative;
default-lease-time 86400;
max-lease-time 604800;

subnet 192.168.100.0 netmask 255.255.255.0 {
  range 192.168.100.100 192.168.100.200;
  option routers 192.168.100.1;
  option domain-name-servers 192.168.100.21;
  option domain-name "kubernerdes.com";
  next-server 192.168.100.10;
  filename "pxelinux.0";
}

# Static leases for Harvester nodes
host nuc-01 {
  hardware ethernet AA:BB:CC:DD:EE:11;  # Replace with actual MAC
  fixed-address 192.168.100.11;
  option host-name "nuc-01";
}
host nuc-02 {
  hardware ethernet AA:BB:CC:DD:EE:22;  # Replace with actual MAC
  fixed-address 192.168.100.12;
  option host-name "nuc-02";
}
host nuc-03 {
  hardware ethernet AA:BB:CC:DD:EE:33;  # Replace with actual MAC
  fixed-address 192.168.100.13;
  option host-name "nuc-03";
}
EOF

systemctl enable --now dhcpd
```

**Find MAC addresses** for the static leases:

```bash
# On nuc-00, check ARP table after each NUC boots to BIOS
arp -n | grep 192.168.100
```

Or check the switch's connected device table if it's managed.

### BIND DNS Configuration

```bash
# /etc/named.conf
cat > /etc/named.conf << 'EOF'
options {
  listen-on port 53 { any; };
  directory "/var/named";
  allow-query { any; };
  recursion yes;
  forwarders { 1.1.1.1; 8.8.8.8; };
};

zone "kubernerdes.com" IN {
  type master;
  file "kubernerdes.com.zone";
};

zone "100.168.192.in-addr.arpa" IN {
  type master;
  file "100.168.192.in-addr.arpa.zone";
};
EOF

# Copy zone files (see Network Planning for content)
# Place in /var/named/kubernerdes.com.zone
# Place in /var/named/100.168.192.in-addr.arpa.zone

named-checkconf
named-checkzone kubernerdes.com /var/named/kubernerdes.com.zone
systemctl enable --now named
```

## infra-02: HAProxy + Keepalived

### HAProxy Configuration

```bash
dnf install -y haproxy keepalived

# /etc/haproxy/haproxy.cfg
cat > /etc/haproxy/haproxy.cfg << 'EOF'
global
  log stdout format raw local0
  maxconn 4096

defaults
  log     global
  mode    tcp
  option  tcplog
  timeout connect 5s
  timeout client  30s
  timeout server  30s

#---------------------------------------------------------------------
# Stats page
#---------------------------------------------------------------------
listen stats
  bind *:9000
  mode http
  stats enable
  stats uri /stats
  stats refresh 10s

#---------------------------------------------------------------------
# Harvester API VIP (192.168.100.60)
#---------------------------------------------------------------------
frontend harvester-api
  bind 192.168.100.60:443
  default_backend harvester-nodes-443

backend harvester-nodes-443
  option tcp-check
  server nuc-01 192.168.100.11:443 check
  server nuc-02 192.168.100.12:443 check
  server nuc-03 192.168.100.13:443 check

#---------------------------------------------------------------------
# Rancher Manager VIP (192.168.100.50)
#---------------------------------------------------------------------
frontend rancher-https
  bind 192.168.100.50:443
  default_backend rancher-nodes-443

backend rancher-nodes-443
  server rancher-mgr 192.168.100.30:443 check

frontend rancher-http
  bind 192.168.100.50:80
  default_backend rancher-nodes-80

backend rancher-nodes-80
  server rancher-mgr 192.168.100.30:80 check
EOF

systemctl enable --now haproxy
```

### Keepalived Configuration

Keepalived manages the VIPs. `infra-02` is the MASTER; if you add a second HAProxy node later, it becomes BACKUP.

```bash
# /etc/keepalived/keepalived.conf
cat > /etc/keepalived/keepalived.conf << 'EOF'
global_defs {
  router_id infra-02
}

vrrp_instance RANCHER_VIP {
  state MASTER
  interface eth0
  virtual_router_id 50
  priority 100
  advert_int 1
  authentication {
    auth_type PASS
    auth_pass enclave2024
  }
  virtual_ipaddress {
    192.168.100.50/24
  }
}

vrrp_instance HARVESTER_VIP {
  state MASTER
  interface eth0
  virtual_router_id 60
  priority 100
  advert_int 1
  authentication {
    auth_type PASS
    auth_pass enclave2024
  }
  virtual_ipaddress {
    192.168.100.60/24
  }
}
EOF

systemctl enable --now keepalived
```

## Verification

### infra-01 checks

```bash
# DHCP is running
systemctl is-active dhcpd

# DNS resolves local names
dig @192.168.100.21 nuc-00.kubernerdes.com
dig @192.168.100.21 rancher.kubernerdes.com
# Expected: ANSWER SECTION with correct IPs

# Reverse DNS
dig @192.168.100.21 -x 192.168.100.10
```

### infra-02 checks

```bash
# HAProxy running
systemctl is-active haproxy
curl http://192.168.100.22:9000/stats

# VIPs are assigned
ip addr show | grep 192.168.100.50
ip addr show | grep 192.168.100.60

# Keepalived running
systemctl is-active keepalived
```

All checks passing? Update `nuc-00`'s DNS to point to `192.168.100.21`:

```bash
nmcli connection modify eth0 ipv4.dns "192.168.100.21"
nmcli connection up eth0
```

Proceed to [Harvester Cluster](./harvester-cluster).
