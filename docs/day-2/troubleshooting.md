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
# 1. Are all nodes up?
kubectl get nodes

# 2. Are all pods running?
kubectl get pods -A | grep -Ev "Running|Completed"

# 3. Is the VIP responding?
curl -k https://192.168.100.60/ping  # Harvester
curl -k https://192.168.100.50/ping  # Rancher

# 4. Is DNS working?
dig @192.168.100.21 rancher.kubernerdes.com

# 5. Is HAProxy healthy?
curl http://192.168.100.22:9000/stats | grep -E "UP|DOWN"
```

---

## Network Issues

### VIP Not Reachable

**Symptom:** `curl https://192.168.100.50` times out.

```bash
# Check if VIP is assigned on infra-02
ssh rke@192.168.100.22 "ip addr show | grep 192.168.100.50"

# If not assigned, Keepalived may have stopped
ssh rke@192.168.100.22 "systemctl status keepalived"
ssh rke@192.168.100.22 "journalctl -u keepalived --since '10 min ago'"

# Restart Keepalived
ssh rke@192.168.100.22 "systemctl restart keepalived"
```

If Keepalived is running but VIP is still missing, check for IP conflicts:

```bash
# ARP scan for the VIP address
arping -I eth0 192.168.100.50
```

### HAProxy Backend Down

**Symptom:** HAProxy stats show backend `DOWN`.

```bash
# Check HAProxy logs
ssh rke@192.168.100.22 "journalctl -u haproxy --since '30 min ago'"

# Manually test backend connectivity from infra-02
ssh rke@192.168.100.22 "curl -k https://192.168.100.11:443/ping"
```

If a Harvester node backend is down, check if the node is up:

```bash
ping 192.168.100.11
ssh rancher@192.168.100.11 "systemctl status k3s"
```

### DNS Not Resolving

```bash
# Test DNS directly against infra-01
dig @192.168.100.21 nuc-01.kubernerdes.com

# Check BIND logs
ssh rke@192.168.100.21 "journalctl -u named --since '10 min ago'"

# Reload zone after editing zone file
ssh rke@192.168.100.21 "named-checkzone kubernerdes.com /var/named/kubernerdes.com.zone && rndc reload"
```

---

## Harvester Cluster Issues

### Node NotReady

```bash
# Describe the node
kubectl describe node nuc-02

# Check k3s on the affected node
ssh rancher@192.168.100.12 "systemctl status k3s"
ssh rancher@192.168.100.12 "journalctl -u k3s --since '15 min ago' | tail -50"

# Common fix: restart k3s
ssh rancher@192.168.100.12 "systemctl restart k3s"
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
ssh rancher@192.168.100.11
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

### Rancher Cannot Connect to Harvester

In Rancher UI, the imported Harvester cluster shows "Unavailable":

```bash
# Check cattle-cluster-agent on Harvester side
kubectl get pods -n cattle-system
kubectl logs -n cattle-system -l app=cattle-cluster-agent

# Verify Rancher URL is reachable from Harvester nodes
kubectl exec -n cattle-system deploy/cattle-cluster-agent -- \
  curl -k https://192.168.100.50/ping
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
1. DNS resolves `rancher.kubernerdes.com` to a publicly routable IP (not 192.168.100.50)
2. Port 80 is open for ACME HTTP-01 challenge

For air-gapped deployments with self-signed certs, use `ingress.tls.source=secret`:

```bash
# Create a self-signed cert
openssl req -x509 -newkey rsa:4096 -keyout tls.key -out tls.crt \
  -days 365 -nodes -subj "/CN=rancher.kubernerdes.com" \
  -addext "subjectAltName=DNS:rancher.kubernerdes.com,IP:192.168.100.50"

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
# Check DHCP leases on infra-01
ssh rke@192.168.100.21 "cat /var/lib/dhcpd/dhcpd.leases | grep -A5 <MAC>"

# Verify TFTP is serving
tftp 192.168.100.10 -c get pxelinux.0

# Check Apache is serving Harvester files
curl http://192.168.100.10/harvester/

# Check firewall on nuc-00
firewall-cmd --list-all | grep -E "tftp|http"
```

Common fixes:
- Verify the NUC's MAC address matches the DHCP static lease
- Confirm BIOS boot order: Network first, Secure Boot disabled
- Check `next-server` in dhcpd.conf points to `192.168.100.10`

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
