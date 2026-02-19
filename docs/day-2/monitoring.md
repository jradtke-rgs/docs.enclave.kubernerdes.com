---
id: monitoring
title: Monitoring
sidebar_label: Monitoring
sidebar_position: 2
---

# Monitoring

## Dashboards Available

| Dashboard | URL | Purpose |
|-----------|-----|---------|
| Harvester UI | https://192.168.100.60 | Cluster nodes, VMs, storage, networking |
| Rancher Manager | https://192.168.100.50 | Multi-cluster overview, workload health |
| HAProxy Stats | http://192.168.100.22:9000/stats | Load balancer backend health, traffic |
| Longhorn UI | https://192.168.100.60 → Storage → Longhorn | Volume health, replica status |

## Harvester Dashboard

Access the Harvester UI at `https://192.168.100.60` (or `https://harvester.kubernerdes.com`).

Key views:

- **Dashboard** — cluster-wide CPU/memory/storage utilization
- **Hosts** — per-node resource usage, disk health, network
- **Virtual Machines** — running VMs, their state, and console access
- **Volumes** — Longhorn PVC status, replica counts
- **Networks** — VM network interfaces and bridge configuration

### Node Health Check

From the Harvester UI → **Hosts**, each node should show:

- State: `Active`
- Disk: `Schedulable`
- Memory: reasonable headroom (alert if > 85% used)

From the command line:

```bash
# Node conditions
kubectl get nodes -o custom-columns=\
'NAME:.metadata.name,STATUS:.status.conditions[-1].type,REASON:.status.conditions[-1].reason'

# Resource pressure
kubectl top nodes
```

## Rancher Dashboard

Access at `https://192.168.100.50` (or `https://rancher.kubernerdes.com`).

- **Cluster Explorer** → select `harvester` cluster → workload health
- **Monitoring** → if you've deployed the rancher-monitoring chart, Grafana dashboards are available here
- **Fleet** → GitOps-managed workloads across clusters

### Enable Rancher Monitoring (Optional)

```bash
helm repo add rancher-charts https://charts.rancher.com
helm install rancher-monitoring rancher-charts/rancher-monitoring \
  --namespace cattle-monitoring-system \
  --create-namespace \
  --kubeconfig ~/.kube/harvester-config \
  --set prometheus.prometheusSpec.resources.requests.memory=512Mi \
  --set prometheus.prometheusSpec.resources.limits.memory=2Gi
```

This deploys Prometheus + Grafana + Alertmanager into the Harvester cluster. Access Grafana via Rancher UI → Monitoring → Grafana.

## HAProxy Stats Page

The HAProxy stats page provides real-time load balancer visibility.

Access at: http://192.168.100.22:9000/stats

Key metrics to monitor:

| Metric | Healthy | Alert |
|--------|---------|-------|
| Backend UP count | = configured backend count | Any backend DOWN |
| Session rate | Baseline normal | Sudden spike |
| Error rate | ~0 | > 0.1% |

From the command line:

```bash
# Check HAProxy backend status via socket
echo "show stat" | socat stdio /var/run/haproxy/admin.sock | cut -d',' -f1,2,18,19
```

## Key Metrics to Watch

### Storage (Longhorn)

```bash
# Overall storage health
kubectl get volumes -n longhorn-system

# Degraded volumes (replicas not fully replicated)
kubectl get volumes -n longhorn-system \
  -o custom-columns='NAME:.metadata.name,STATE:.status.state,ROBUSTNESS:.status.robustness' | \
  grep -v healthy

# Disk space
kubectl get nodes.longhorn.io -n longhorn-system
```

Alert thresholds:
- Volume robustness `degraded`: investigate within 24h
- Volume robustness `faulted`: immediate action required
- Disk usage > 80%: plan expansion or cleanup

### etcd Health

Harvester's control plane uses etcd. Check its health periodically:

```bash
# SSH to any Harvester node
ssh rancher@192.168.100.11

# etcd health
kubectl get pods -n kube-system | grep etcd
crictl ps | grep etcd

# etcd endpoint health (from inside nuc-01)
ETCDCTL_API=3 etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/var/lib/rancher/k3s/server/tls/etcd/server-ca.crt \
  --cert=/var/lib/rancher/k3s/server/tls/etcd/server-client.crt \
  --key=/var/lib/rancher/k3s/server/tls/etcd/server-client.key \
  endpoint health
```

### Certificate Expiry

```bash
# Check all cert-manager certificates
kubectl --kubeconfig ~/.kube/rancher-k3s-config \
  get certificates -A

# Check expiry
kubectl --kubeconfig ~/.kube/rancher-k3s-config \
  get certificates -A -o \
  custom-columns='NAMESPACE:.metadata.namespace,NAME:.metadata.name,READY:.status.conditions[-1].status,EXPIRY:.status.notAfter'
```

Certificates managed by cert-manager renew automatically at 2/3 of their lifetime. If a certificate is stuck `NotReady`, see [Troubleshooting](./troubleshooting#certificate-issues).

## Alerting

Basic alerting can be configured via:

1. **Rancher Monitoring Alertmanager** — email/Slack/PagerDuty alerts for pod failures, node pressure
2. **Keepalived** — log to syslog when VIP transitions (visible in `journalctl -u keepalived`)
3. **HAProxy** — log backend state changes to syslog

```bash
# Watch HAProxy state changes in real time
journalctl -u haproxy -f | grep -E "Server|backend"

# Watch Keepalived VIP transitions
journalctl -u keepalived -f
```
