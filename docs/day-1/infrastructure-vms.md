---
id: infrastructure-vms
title: Infrastructure VMs
sidebar_label: Infrastructure VMs
sidebar_position: 3
---

# Infrastructure VMs

Three VMs run on `nuc-00` providing shared infrastructure services:

| VM | IP | Services |
|----|-----|---------|
| `nuc-00-01` | `10.10.12.8` | ISC DHCP, BIND DNS (primary) |
| `nuc-00-02` | `10.10.12.9` | BIND DNS (secondary) |
| `nuc-00-03` | `10.10.12.93` | HAProxy, Keepalived |

All VMs run openSUSE Leap 15.5.

## Creating the VMs

Use `virt-install` on `nuc-00`:

```bash
# nuc-00-01
virt-install \
  --name nuc-00-01 \
  --vcpus 4 \
  --memory 4096 \
  --disk /dev/vg-infra/lv-nuc-00-01,bus=virtio \
  --network bridge=virbr0,model=virtio \
  --os-variant opensuse15.5 \
  --location /var/www/html/openSUSE-Leap-15.5-DVD-x86_64.iso \
  --initrd-inject /root/autoyast-nuc-00-01.xml \
  --extra-args "autoyast=file:///autoyast-nuc-00-01.xml console=ttyS0" \
  --console pty,target_type=serial \
  --noautoconsole

# nuc-00-02
virt-install \
  --name nuc-00-02 \
  --vcpus 2 \
  --memory 2048 \
  --disk /dev/vg-infra/lv-nuc-00-02,bus=virtio \
  --network bridge=virbr0,model=virtio \
  --os-variant opensuse15.5 \
  --location /var/www/html/openSUSE-Leap-15.5-DVD-x86_64.iso \
  --initrd-inject /root/autoyast-nuc-00-02.xml \
  --extra-args "autoyast=file:///autoyast-nuc-00-02.xml console=ttyS0" \
  --console pty,target_type=serial \
  --noautoconsole

# nuc-00-03
virt-install \
  --name nuc-00-03 \
  --vcpus 2 \
  --memory 2048 \
  --disk /dev/vg-infra/lv-nuc-00-03,bus=virtio \
  --network bridge=virbr0,model=virtio \
  --os-variant opensuse15.5 \
  --location /var/www/html/openSUSE-Leap-15.5-DVD-x86_64.iso \
  --initrd-inject /root/autoyast-nuc-00-03.xml \
  --extra-args "autoyast=file:///autoyast-nuc-00-03.xml console=ttyS0" \
  --console pty,target_type=serial \
  --noautoconsole
```

Enable VMs to auto-start:

```bash
virsh autostart nuc-00-01
virsh autostart nuc-00-02
virsh autostart nuc-00-03
```

## nuc-00-01: ISC DHCP + BIND DNS (Primary)

### ISC DHCP Configuration

```bash
# Install on nuc-00-01
zypper install -y dhcp-server bind bind-utils

# /etc/dhcp/dhcpd.conf
cat > /etc/dhcp/dhcpd.conf << 'EOF'
authoritative;
default-lease-time 7200;
max-lease-time 7200;

subnet 10.10.12.0 netmask 255.255.252.0 {
  range 10.10.15.0 10.10.15.254;
  option routers 10.10.12.1;
  option domain-name-servers 10.10.12.8, 10.10.12.9, 8.8.8.8;
  option domain-name "enclave.kubernerdes.com";
  next-server 10.10.12.10;
  filename "pxelinux.0";
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
EOF

systemctl enable --now dhcpd
```

### BIND DNS Configuration (Primary)

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

zone "enclave.kubernerdes.com" IN {
  type master;
  file "master/db.enclave.kubernerdes.com";
  allow-transfer { 10.10.12.9; };
};

zone "12.10.10.in-addr.arpa" IN {
  type master;
  file "master/db.12.10.10.in-addr.arpa";
  allow-transfer { 10.10.12.9; };
};
EOF

# Copy zone files (see Network Planning for content)
# Place in /var/lib/named/master/db.enclave.kubernerdes.com
# Place in /var/lib/named/master/db.12.10.10.in-addr.arpa

named-checkconf
named-checkzone enclave.kubernerdes.com /var/lib/named/master/db.enclave.kubernerdes.com
systemctl enable --now named
```

## nuc-00-02: BIND DNS (Secondary)

```bash
zypper install -y bind bind-utils

# /etc/named.conf — secondary (slave) configuration
cat > /etc/named.conf << 'EOF'
options {
  listen-on port 53 { any; };
  directory "/var/named";
  allow-query { any; };
  recursion yes;
  forwarders { 1.1.1.1; 8.8.8.8; };
};

zone "enclave.kubernerdes.com" IN {
  type slave;
  masters { 10.10.12.8; };
  file "slaves/db.enclave.kubernerdes.com";
};

zone "12.10.10.in-addr.arpa" IN {
  type slave;
  masters { 10.10.12.8; };
  file "slaves/db.12.10.10.in-addr.arpa";
};
EOF

systemctl enable --now named
```

## nuc-00-03: HAProxy + Keepalived

### HAProxy Configuration

```bash
zypper install -y haproxy keepalived

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
  stats auth admin:rancher

#---------------------------------------------------------------------
# Rancher Manager VIP (10.10.12.210)
#---------------------------------------------------------------------
frontend rancher-http
  bind 10.10.12.210:80
  default_backend rancher-nodes-80

backend rancher-nodes-80
  option tcp-check
  server rancher-01 10.10.12.211:80 check
  server rancher-02 10.10.12.212:80 check
  server rancher-03 10.10.12.213:80 check

frontend rancher-https
  bind 10.10.12.210:443
  default_backend rancher-nodes-443

backend rancher-nodes-443
  option tcp-check
  server rancher-01 10.10.12.211:443 check
  server rancher-02 10.10.12.212:443 check
  server rancher-03 10.10.12.213:443 check

frontend rancher-api
  bind 10.10.12.210:6443
  default_backend rancher-nodes-6443

backend rancher-nodes-6443
  option tcp-check
  server rancher-01 10.10.12.211:6443 check
  server rancher-02 10.10.12.212:6443 check
  server rancher-03 10.10.12.213:6443 check
EOF

systemctl enable --now haproxy
```

### Keepalived Configuration

Keepalived manages two VIPs on `nuc-00-03`. It is the MASTER for both.

```bash
# /etc/keepalived/keepalived.conf
cat > /etc/keepalived/keepalived.conf << 'EOF'
global_defs {
  router_id nuc-00-03
}

vrrp_instance VI_HADRIAN {
  state MASTER
  interface eth0
  virtual_router_id 193
  priority 100
  advert_int 1
  authentication {
    auth_type PASS
    auth_pass rancher
  }
  virtual_ipaddress {
    10.10.12.193/22
  }
}

vrrp_instance VI_RANCHER {
  state MASTER
  interface eth0
  virtual_router_id 210
  priority 100
  advert_int 1
  authentication {
    auth_type PASS
    auth_pass rancher
  }
  virtual_ipaddress {
    10.10.12.210/22
  }
}
EOF

systemctl enable --now keepalived
```

## Verification

### nuc-00-01 checks

```bash
# DHCP is running
systemctl is-active dhcpd

# DNS resolves local names
dig @10.10.12.8 nuc-00.enclave.kubernerdes.com
dig @10.10.12.8 rancher.enclave.kubernerdes.com
# Expected: ANSWER SECTION with correct IPs

# Reverse DNS
dig @10.10.12.8 -x 10.10.12.10
```

### nuc-00-02 checks

```bash
# Named is running and zone transferred from primary
systemctl is-active named
dig @10.10.12.9 nuc-00.enclave.kubernerdes.com
```

### nuc-00-03 checks

```bash
# HAProxy running
systemctl is-active haproxy
curl http://10.10.12.93:9000/stats

# VIPs are assigned
ip addr show | grep 10.10.12.193
ip addr show | grep 10.10.12.210

# Keepalived running
systemctl is-active keepalived
```

All checks passing? Update `nuc-00`'s DNS to point to `10.10.12.8`:

```bash
nmcli connection modify eth0 ipv4.dns "10.10.12.8 10.10.12.9"
nmcli connection up eth0
```

Proceed to [Harvester Cluster](./harvester-cluster.md).
