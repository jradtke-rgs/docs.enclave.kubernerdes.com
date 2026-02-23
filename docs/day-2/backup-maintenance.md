---
id: backup-maintenance
title: Backup & Maintenance
sidebar_label: Backup & Maintenance
sidebar_position: 3
---

# Backup & Maintenance

## Backup Strategy Overview

| What | Method | Frequency | Stored |
|------|--------|-----------|--------|
| nuc-00 config files | `backup_hosts.sh` script | Weekly | NFS/external or git |
| infra VM configs | Ansible playbooks in git | On change | GitHub |
| Harvester VM volumes | Longhorn snapshots + backup | Daily | NFS backup target |
| Harvester cluster config | `kubectl get -o yaml` export | Weekly | Git |
| Rancher config | Helm values + kubectl export | On change | Git |
| etcd snapshot | K3s auto-snapshot | Daily | Local + NFS |

## `backup_hosts.sh` Script

The enclave repo includes a script that archives key configuration directories from all hosts.

```bash
#!/usr/bin/env bash
# backup_hosts.sh — archive config from all enclave hosts

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backup/enclave}"
DATE=$(date +%Y%m%d-%H%M%S)
HOSTS=(nuc-00 nuc-00-01 nuc-00-02 nuc-00-03)

mkdir -p "${BACKUP_DIR}/${DATE}"

for host in "${HOSTS[@]}"; do
  echo "Backing up ${host}..."
  tar czf "${BACKUP_DIR}/${DATE}/${host}-config.tar.gz" \
    --exclude='*.log' \
    -C / \
    etc/NetworkManager \
    etc/dhcp \
    etc/named \
    etc/haproxy \
    etc/keepalived \
    etc/httpd \
    etc/libvirt \
    root/.ssh/authorized_keys
done

echo "Backup complete: ${BACKUP_DIR}/${DATE}"

# Prune backups older than 30 days
find "${BACKUP_DIR}" -maxdepth 1 -type d -mtime +30 -exec rm -rf {} +
```

Run it:

```bash
chmod +x backup_hosts.sh
BACKUP_DIR=/mnt/backup/enclave ./backup_hosts.sh
```

Add to cron on `nuc-00`:

```bash
crontab -e
# Add:
0 2 * * 0 BACKUP_DIR=/mnt/backup/enclave /root/scripts/backup_hosts.sh >> /var/log/enclave-backup.log 2>&1
```

## Ansible-Based Config Management

The enclave source repo uses Ansible to manage all host configurations. After any manual change to a host, run the corresponding playbook to reconcile state and commit the changes.

### Repository Structure

```
enclave.kubernerdes.com/
├── Ansible/
│   ├── hosts               # inventory file
│   └── ...
├── Files/
│   ├── nuc-00-01/          # DHCP, DNS configs
│   ├── nuc-00-02/          # DNS secondary configs
│   └── nuc-00-03/          # HAProxy, Keepalived configs
└── Scripts/
    └── ...
```

### Common Playbook Runs

```bash
# Full site configuration
ansible-playbook -i Ansible/hosts site.yml

# Only infrastructure VMs
ansible-playbook -i Ansible/hosts infra-vms.yml

# Check mode (dry run)
ansible-playbook -i Ansible/hosts site.yml --check --diff
```

### Adding a New DHCP Static Lease

1. Find the MAC address of the new device
2. Edit the DHCP config on `nuc-00-01` at `/etc/dhcp/dhcpd.conf`:

```
host new-device {
  hardware ethernet AA:BB:CC:DD:EE:FF;
  fixed-address 10.10.12.25;
  option host-name "new-device";
}
```

3. Restart DHCP:

```bash
systemctl restart dhcpd
```

4. Commit the config change to the repo:

```bash
git add Files/nuc-00-01/etc/dhcp/dhcpd.conf
git commit -m "Add static DHCP lease for new-device"
```

## Longhorn Backups

Configure an NFS backup target in Longhorn for VM volume backups:

1. Harvester UI → **Advanced** → **Settings** → **backup-target**
2. Set: `nfs://10.10.12.10/backup/longhorn` (or S3 endpoint)

Or via kubectl:

```bash
kubectl patch setting backup-target -n longhorn-system \
  --type merge \
  -p '{"value":"nfs://10.10.12.10/backup/longhorn"}'
```

Create recurring snapshots:

```bash
# Create a recurring job: daily snapshot, retain 7
cat << 'EOF' | kubectl apply -f -
apiVersion: longhorn.io/v1beta2
kind: RecurringJob
metadata:
  name: daily-snapshot
  namespace: longhorn-system
spec:
  cron: "0 1 * * *"
  task: snapshot
  retain: 7
  concurrency: 1
EOF
```

## K3s etcd Snapshots (Rancher Manager)

K3s on the Rancher cluster automatically takes etcd snapshots. Verify and manage:

```bash
# On rancher-01 (or any Rancher K3s node)
# List local snapshots
ls -lh /var/lib/rancher/k3s/server/db/snapshots/

# K3s config for snapshot schedule (in /etc/rancher/k3s/config.yaml)
cat << 'EOF' > /etc/rancher/k3s/config.yaml
etcd-snapshot-schedule-cron: "0 2 * * *"
etcd-snapshot-retain: 7
etcd-snapshot-dir: /var/lib/rancher/k3s/server/db/snapshots
EOF

systemctl restart k3s
```

Copy snapshots off the VM:

```bash
scp mansible@10.10.12.211:/var/lib/rancher/k3s/server/db/snapshots/\* \
  /mnt/backup/enclave/rancher-etcd/
```

## Harvester Upgrade

Upgrades are managed through the Harvester UI:

1. Harvester UI → **Dashboard** → **Upgrade** (appears when new version is available)
2. Review release notes at https://github.com/harvester/harvester/releases
3. Click **Start Upgrade**
4. Harvester upgrades one node at a time, draining workloads before upgrading each node

Manual upgrade via kubectl:

```bash
cat << 'EOF' | kubectl apply -f -
apiVersion: harvesterhci.io/v1beta1
kind: Upgrade
metadata:
  name: hvst-upgrade-v1-7-x
  namespace: harvester-system
spec:
  version: v1.7.x
  image: rancher/harvester:v1.7.x
EOF
```

## Rancher Manager Upgrade

```bash
helm repo update

# Check current version
helm list -n cattle-system --kubeconfig ~/.kube/rancher-k3s-config

# Upgrade
helm upgrade rancher rancher-prime/rancher \
  --namespace cattle-system \
  --kubeconfig ~/.kube/rancher-k3s-config \
  --reuse-values \
  --version <new-version>

# Monitor rollout
kubectl --kubeconfig ~/.kube/rancher-k3s-config \
  rollout status deployment rancher -n cattle-system
```

## System Patching (Rocky Linux)

```bash
# Run on nuc-00 and all VMs via Ansible
ansible-playbook -i Ansible/hosts patch.yml

# Or manually on each host
dnf update -y
systemctl reboot  # if kernel was updated
```

After rebooting `nuc-00`, the infra VMs (`nuc-00-01`, `nuc-00-02`, `nuc-00-03`) are also rebooted — there will be a brief DHCP/DNS/VIP outage. Plan this during a maintenance window.
