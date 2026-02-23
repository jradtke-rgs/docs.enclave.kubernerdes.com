---
id: troubleshooting
title: Troubleshooting
sidebar_label: Troubleshooting
sidebar_position: 4
---

# Troubleshooting

## Quick Diagnostics Checklist

When something isn't working, run through these in order:

```bash
# 1. Are all Harvester nodes up?
kubectl get nodes

# 2. Are all pods running?
kubectl get pods -A | grep -Ev "Running|Completed"

# 3. Is the Harvester VIP responding?
curl -k https://10.10.12.100/ping  # Harvester

# 4. Is the Rancher VIP responding?
curl -k https://10.10.12.210/ping  # Rancher

# 5. Is DNS working?
dig @10.10.12.8 rancher.enclave.kubernerdes.com

# 6. Is HAProxy healthy?
curl http://10.10.12.93:9000/stats | grep -E "UP|DOWN"
```

---

## Network Issues

### VIP Not Reachable

**Symptom:** `curl https://10.10.12.210` times out.

```bash
# Check if VIP is assigned on nuc-00-03
ssh mansible@10.10.12.93 "ip addr show | grep 10.10.12.210"

# If not assigned, Keepalived may have stopped
ssh mansible@10.10.12.93 "systemctl status keepalived"
ssh mansible@10.10.12.93 "journalctl -u keepalived --since '10 min ago'"

# Restart Keepalived
ssh mansible@10.10.12.93 "systemctl restart keepalived"
```

If Keepalived is running but VIP is still missing, check for IP conflicts:

```bash
# ARP scan for the VIP address
arping -I eth0 10.10.12.210
```

### HAProxy Backend Down

**Symptom:** HAProxy stats show backend `DOWN`.

```bash
# Check HAProxy logs
ssh mansible@10.10.12.93 "journalctl -u haproxy --since '30 min ago'"

# Manually test backend connectivity from nuc-00-03
ssh mansible@10.10.12.93 "curl -k https://10.10.12.211:443/ping"
```

If a Rancher node backend is down, check if the node is up:

```bash
ping 10.10.12.211
ssh mansible@10.10.12.211 "systemctl status k3s"
```

### DNS Not Resolving

```bash
# Test DNS directly against nuc-00-01
dig @10.10.12.8 nuc-01.enclave.kubernerdes.com

# Check BIND logs
ssh mansible@10.10.12.8 "journalctl -u named --since '10 min ago'"

# Reload zone after editing zone file
ssh mansible@10.10.12.8 "named-checkzone enclave.kubernerdes.com /var/lib/named/master/db.enclave.kubernerdes.com && rndc reload"

# Verify secondary DNS has synced
dig @10.10.12.9 nuc-01.enclave.kubernerdes.com
```

---

## Harvester Cluster Issues

### Node NotReady

```bash
# Describe the node
kubectl describe node nuc-02

# Check k3s on the affected node
ssh rancher@10.10.12.102 "systemctl status k3s"
ssh rancher@10.10.12.102 "journalctl -u k3s --since '15 min ago' | tail -50"

# Common fix: restart k3s
ssh rancher@10.10.12.102 "systemctl restart k3s"
```

### Longhorn Volume Degraded

```bash
# Find degraded volumes
kubectl get volumes -n longhorn-system \
  -o custom-columns='NAME:.metadata.name,ROBUSTNESS:.status.robustness' | \
  grep -v healthy

# Describe a degraded volume
kubectl describe volume <volume-name> -n longhorn-system

# Check replica status
kubectl get replicas -n longhorn-system | grep <volume-name>
```

Common causes:
- A node was recently rebooted → replicas are still rebuilding (wait 10–20 min)
- A node is down → volume is degraded until node returns
- Disk full → free space or expand disk

### etcd Cluster Unhealthy

```bash
# Check etcd members
ssh rancher@10.10.12.101
kubectl get pods -n kube-system | grep etcd

# Check etcd logs
kubectl logs -n kube-system etcd-nuc-01 --tail=50

# etcd cluster health (from inside a node)
ETCDCTL_API=3 etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/var/lib/rancher/k3s/server/tls/etcd/server-ca.crt \
  --cert=/var/lib/rancher/k3s/server/tls/etcd/server-client.crt \
  --key=/var/lib/rancher/k3s/server/tls/etcd/server-client.key \
  member list
```

---

## Rancher Manager Issues

### Rancher Pods CrashLooping

```bash
# Check pod status
kubectl --kubeconfig ~/.kube/rancher-k3s-config \
  get pods -n cattle-system

# Get logs from crashed pod
kubectl --kubeconfig ~/.kube/rancher-k3s-config \
  logs -n cattle-system deploy/rancher --previous

# Describe pod for events
kubectl --kubeconfig ~/.kube/rancher-k3s-config \
  describe pod -n cattle-system -l app=rancher
```

Common causes:
- cert-manager certificate not issued → see [Certificate Issues](#certificate-issues)
- K3s node out of memory → check `kubectl top nodes`
- Rancher DB corrupted → restore from etcd snapshot

### K3s Node Not Joining Rancher Cluster

```bash
# Check K3s status on the failing node
ssh mansible@10.10.12.212 "systemctl status k3s"
ssh mansible@10.10.12.212 "journalctl -u k3s --since '15 min ago' | tail -50"

# Verify the VIP is reachable from that node
ssh mansible@10.10.12.212 "ping -c 3 10.10.12.210"
ssh mansible@10.10.12.212 "curl -k https://10.10.12.211:6443"
```

### Rancher Cannot Connect to Harvester

In Rancher UI, the imported Harvester cluster shows "Unavailable":

```bash
# Check cattle-cluster-agent on Harvester side
kubectl get pods -n cattle-system
kubectl logs -n cattle-system -l app=cattle-cluster-agent

# Verify Rancher URL is reachable from Harvester nodes
kubectl exec -n cattle-system deploy/cattle-cluster-agent -- \
  curl -k https://10.10.12.210/ping
```

---

## Certificate Issues {#certificate-issues}

### cert-manager Certificate Not Issued

```bash
# Check certificate status
kubectl --kubeconfig ~/.kube/rancher-k3s-config \
  describe certificate -n cattle-system tls-rancher-ingress

# Check CertificateRequest
kubectl --kubeconfig ~/.kube/rancher-k3s-config \
  get certificaterequests -n cattle-system

# Check cert-manager logs
kubectl --kubeconfig ~/.kube/rancher-k3s-config \
  logs -n cert-manager deploy/cert-manager | tail -30
```

For Let's Encrypt certificates, verify:
1. DNS resolves `rancher.enclave.kubernerdes.com` to a publicly routable IP (not `10.10.12.210`)
2. Port 80 is open for ACME HTTP-01 challenge

For air-gapped deployments with self-signed certs, use `ingress.tls.source=secret`:

```bash
# Create a self-signed cert
openssl req -x509 -newkey rsa:4096 -keyout tls.key -out tls.crt \
  -days 365 -nodes -subj "/CN=rancher.enclave.kubernerdes.com" \
  -addext "subjectAltName=DNS:rancher.enclave.kubernerdes.com,IP:10.10.12.210"

kubectl --kubeconfig ~/.kube/rancher-k3s-config \
  create secret tls tls-rancher-ingress \
  --cert=tls.crt --key=tls.key \
  -n cattle-system
```

### Certificate Expired

```bash
# Check expiry
kubectl --kubeconfig ~/.kube/rancher-k3s-config \
  get certificates -A -o \
  custom-columns='NAME:.metadata.name,EXPIRY:.status.notAfter,READY:.status.conditions[-1].status'

# Force renewal (cert-manager)
kubectl --kubeconfig ~/.kube/rancher-k3s-config \
  annotate certificate tls-rancher-ingress \
  -n cattle-system \
  cert-manager.io/issue-temporary-certificate="true"
```

---

## PXE Boot Issues

### Harvester Node Fails to PXE Boot

```bash
# Check DHCP leases on nuc-00-01
ssh mansible@10.10.12.8 "cat /var/lib/dhcpd/dhcpd.leases | grep -A5 <MAC>"

# Verify TFTP is serving
tftp 10.10.12.10 -c get pxelinux.0

# Check Apache is serving Harvester files
curl http://10.10.12.10/harvester/

# Check firewall on nuc-00
firewall-cmd --list-all | grep -E "tftp|http"
```

Common fixes:
- Verify the NUC's MAC address matches the DHCP static lease in `/etc/dhcp/dhcpd.conf`
- Confirm BIOS boot order: Network first, Secure Boot disabled
- Check `next-server` in dhcpd.conf points to `10.10.12.10`

---

## Useful kubectl Snippets

```bash
# All pods not Running
kubectl get pods -A --field-selector='status.phase!=Running' | grep -v Completed

# Events sorted by time
kubectl get events -A --sort-by='.lastTimestamp' | tail -20

# Exec into a pod
kubectl exec -it <pod-name> -n <namespace> -- /bin/bash

# Port-forward a service for local access
kubectl port-forward svc/longhorn-frontend 8080:80 -n longhorn-system

# Get all resources in a namespace
kubectl get all -n cattle-system

# Force-delete a stuck pod
kubectl delete pod <pod-name> -n <namespace> --grace-period=0 --force

# Watch pods in real time
watch kubectl get pods -n cattle-system

# Drain and uncordon a node
kubectl drain nuc-02 --ignore-daemonsets --delete-emptydir-data --timeout=5m
kubectl uncordon nuc-02
```
