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

HAProxy on `nuc-00-03` is the single load balancer for all enclave services. It listens on four Keepalived-managed VIPs:

| VIP | Purpose |
|-----|---------|
| `10.10.12.193` | OpenWebUI (port 12000) and Ollama API (port 11434) — spark-e |
| `10.10.12.210` | Rancher Manager cluster |
| `10.10.12.220` | SUSE Observability cluster |
| `10.10.12.230` | Enclave Applications cluster |

### HAProxy Configuration

```bash
zypper install -y haproxy keepalived

cat > /etc/haproxy/haproxy.cfg << 'EOF'
global
  log 127.0.0.1:514 local0
  maxconn 32768
  chroot /var/lib/haproxy
  user haproxy
  group haproxy
  daemon
  stats socket /var/lib/haproxy/stats user haproxy group haproxy mode 0640 level operator
  tune.bufsize 32768
  tune.ssl.default-dh-param 2048
  ssl-default-bind-ciphers ALL:!aNULL:!eNULL:!EXPORT:!DES:!3DES:!MD5:!PSK:!RC4:!ADH:!LOW@STRENGTH
  ssl-default-bind-options ssl-min-ver TLSv1.2 no-tls-tickets

defaults
  log     global
  mode    http
  option  log-health-checks
  option  log-separate-errors
  option  dontlog-normal
  option  dontlognull
  option  httplog
  option  socket-stats
  retries 3
  option  redispatch
  maxconn 10000
  timeout connect     5s
  timeout client     50s
  timeout server    450s

# Userlist for Ollama API Basic Authentication
userlist ollama_users
  user admin password $5$<hashed-password>
  user apiuser password $5$<hashed-password>

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
# OpenWebUI — spark-e (10.10.12.193)
#---------------------------------------------------------------------
frontend openwebui_frontend
  bind 10.10.12.193:12000 ssl \
    crt /etc/haproxy/certs/spark-e.enclave.kubernerdes.com.pem \
    alpn h2,http/1.1
  default_backend spark-e_owui_backend

backend spark-e_owui_backend
  balance roundrobin
  server spark-e 10.10.12.251:12000 check

#---------------------------------------------------------------------
# Ollama API — spark-e (10.10.12.193), Basic Auth required
#---------------------------------------------------------------------
frontend ollama_frontend
  bind 10.10.12.193:11434 ssl \
    crt /etc/haproxy/certs/spark-e.enclave.kubernerdes.com.pem \
    alpn h2,http/1.1
  mode http
  acl auth_ok http_auth(ollama_users)
  http-response set-header Strict-Transport-Security "max-age=31536000; includeSubDomains"
  http-request auth realm "Ollama API" if !auth_ok
  default_backend spark-e_ollama_backend

backend spark-e_ollama_backend
  balance roundrobin
  server spark-e 10.10.12.251:11434 check

#---------------------------------------------------------------------
# Rancher Manager (10.10.12.210)
#---------------------------------------------------------------------
frontend rancher-http
  bind 10.10.12.210:80
  mode tcp
  default_backend rancher-http-backend

backend rancher-http-backend
  mode tcp
  balance roundrobin
  option tcp-check
  server rancher-01 10.10.12.211:80 check fall 3 rise 2
  server rancher-02 10.10.12.212:80 check fall 3 rise 2
  server rancher-03 10.10.12.213:80 check fall 3 rise 2

frontend rancher-https
  bind 10.10.12.210:443
  mode tcp
  default_backend rancher-https-backend

backend rancher-https-backend
  mode tcp
  balance roundrobin
  option tcp-check
  server rancher-01 10.10.12.211:443 check fall 3 rise 2
  server rancher-02 10.10.12.212:443 check fall 3 rise 2
  server rancher-03 10.10.12.213:443 check fall 3 rise 2

frontend rancher-k8s-api
  bind 10.10.12.210:6443
  mode tcp
  default_backend rancher-k8s-api-backend

backend rancher-k8s-api-backend
  mode tcp
  balance roundrobin
  option tcp-check
  server rancher-01 10.10.12.211:6443 check fall 3 rise 2
  server rancher-02 10.10.12.212:6443 check fall 3 rise 2
  server rancher-03 10.10.12.213:6443 check fall 3 rise 2

frontend rancher-k8s-certs
  bind 10.10.12.210:9345
  mode tcp
  default_backend rancher-k8s-certs-backend

backend rancher-k8s-certs-backend
  mode tcp
  balance roundrobin
  option tcp-check
  server rancher-01 10.10.12.211:9345 check fall 3 rise 2
  server rancher-02 10.10.12.212:9345 check fall 3 rise 2
  server rancher-03 10.10.12.213:9345 check fall 3 rise 2

#---------------------------------------------------------------------
# SUSE Observability cluster (10.10.12.220)
#---------------------------------------------------------------------
frontend observability-http
  bind 10.10.12.220:80
  mode tcp
  default_backend observability-http-backend

backend observability-http-backend
  mode tcp
  balance roundrobin
  option tcp-check
  server observability-01 10.10.15.37:80 check fall 3 rise 2
  server observability-02 10.10.15.38:80 check fall 3 rise 2
  server observability-03 10.10.15.39:80 check fall 3 rise 2

frontend observability-https
  bind 10.10.12.220:443
  mode tcp
  default_backend observability-https-backend

backend observability-https-backend
  mode tcp
  balance roundrobin
  option tcp-check
  server observability-01 10.10.15.37:443 check fall 3 rise 2
  server observability-02 10.10.15.38:443 check fall 3 rise 2
  server observability-03 10.10.15.39:443 check fall 3 rise 2

frontend observability-k8s-api
  bind 10.10.12.220:6443
  mode tcp
  default_backend observability-k8s-api-backend

backend observability-k8s-api-backend
  mode tcp
  balance roundrobin
  option tcp-check
  server observability-01 10.10.15.37:6443 check fall 3 rise 2
  server observability-02 10.10.15.38:6443 check fall 3 rise 2
  server observability-03 10.10.15.39:6443 check fall 3 rise 2

frontend observability-k8s-certs
  bind 10.10.12.220:9345
  mode tcp
  default_backend observability-k8s-certs-backend

backend observability-k8s-certs-backend
  mode tcp
  balance roundrobin
  option tcp-check
  server observability-01 10.10.15.37:9345 check fall 3 rise 2
  server observability-02 10.10.15.38:9345 check fall 3 rise 2
  server observability-03 10.10.15.39:9345 check fall 3 rise 2

#---------------------------------------------------------------------
# Enclave Applications cluster (10.10.12.230)
#---------------------------------------------------------------------
frontend enclaveapps-http
  bind 10.10.12.230:80
  mode tcp
  default_backend enclaveapps-http-backend

backend enclaveapps-http-backend
  mode tcp
  balance roundrobin
  option tcp-check
  server enclaveapps-01 10.10.15.43:80 check fall 3 rise 2
  server enclaveapps-02 10.10.15.44:80 check fall 3 rise 2
  server enclaveapps-03 10.10.15.45:80 check fall 3 rise 2

frontend enclaveapps-https
  bind 10.10.12.230:443
  mode tcp
  default_backend enclaveapps-https-backend

backend enclaveapps-https-backend
  mode tcp
  balance roundrobin
  option tcp-check
  server enclaveapps-01 10.10.15.43:443 check fall 3 rise 2
  server enclaveapps-02 10.10.15.44:443 check fall 3 rise 2
  server enclaveapps-03 10.10.15.45:443 check fall 3 rise 2

frontend enclaveapps-k8s-api
  bind 10.10.12.230:6443
  mode tcp
  default_backend enclaveapps-k8s-api-backend

backend enclaveapps-k8s-api-backend
  mode tcp
  balance roundrobin
  option tcp-check
  server enclaveapps-01 10.10.15.43:6443 check fall 3 rise 2
  server enclaveapps-02 10.10.15.44:6443 check fall 3 rise 2
  server enclaveapps-03 10.10.15.45:6443 check fall 3 rise 2
EOF

systemctl enable --now haproxy
```

### Keepalived Configuration

Keepalived manages four VIPs on `nuc-00-03`.

```bash
cat > /etc/keepalived/keepalived.conf << 'EOF'
global_defs {
  router_id nuc-00-03
}

# spark-e (OpenWebUI + Ollama)
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

# Rancher Manager
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

# SUSE Observability
vrrp_instance VI_OBSERVABILITY {
  state MASTER
  interface eth0
  virtual_router_id 220
  priority 100
  advert_int 1
  authentication {
    auth_type PASS
    auth_pass rancher
  }
  virtual_ipaddress {
    10.10.12.220/22
  }
}

# Enclave Applications
vrrp_instance VI_APPS {
  state MASTER
  interface eth0
  virtual_router_id 230
  priority 100
  advert_int 1
  authentication {
    auth_type PASS
    auth_pass rancher
  }
  virtual_ipaddress {
    10.10.12.230/22
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

# All four VIPs assigned
ip addr show | grep -E "10.10.12.(193|210|220|230)"

# Keepalived running
systemctl is-active keepalived
```

All checks passing? Update `nuc-00`'s DNS to point to `10.10.12.8`:

```bash
nmcli connection modify eth0 ipv4.dns "10.10.12.8 10.10.12.9"
nmcli connection up eth0
```

Proceed to [Hauler & Carbide Setup](./hauler.md).
