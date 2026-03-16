---
id: housekeeping
title: Housekeeping
sidebar_label: Housekeeping
sidebar_position: 6
---

# Housekeeping

Post-deployment housekeeping tasks to run after Rancher Manager is up and clusters are imported.

## SSH Keys & Config

Generate a dedicated SSH key for enclave access if you haven't already:

```bash
ssh-keygen -t ed25519 -C "enclave-admin" -f ~/.ssh/id_ed25519-enclave
```

Update your local `~/.ssh/config` to use it:

```
Host nuc-00
  HostName 10.10.12.10
  User mansible
  IdentityFile ~/.ssh/id_ed25519-enclave

Host nuc-00-01
  HostName 10.10.12.8
  User mansible
  IdentityFile ~/.ssh/id_ed25519-enclave

Host nuc-00-02
  HostName 10.10.12.9
  User mansible
  IdentityFile ~/.ssh/id_ed25519-enclave

Host nuc-00-03
  HostName 10.10.12.93
  User mansible
  IdentityFile ~/.ssh/id_ed25519-enclave

Host rancher-01
  HostName 10.10.12.211
  User sles
  IdentityFile ~/.ssh/id_ed25519-enclave

Host rancher-02
  HostName 10.10.12.212
  User sles
  IdentityFile ~/.ssh/id_ed25519-enclave

Host rancher-03
  HostName 10.10.12.213
  User sles
  IdentityFile ~/.ssh/id_ed25519-enclave
```

## Kubeconfig Consolidation

After all clusters are running, organize your kubeconfigs:

```bash
ls ~/.kube/*.kubeconfig
# enclave-harvester.kubeconfig
# enclave-rancher.kubeconfig
# enclave-applications.kubeconfig
# enclave-observability.kubeconfig
```

Set a default for daily use:

```bash
export KUBECONFIG=~/.kube/enclave-rancher.kubeconfig
```

Or merge them into a single config:

```bash
KUBECONFIG=$(ls ~/.kube/*.kubeconfig | tr '\n' ':') \
  kubectl config view --flatten > ~/.kube/enclave-merged.kubeconfig
```

## Clean Up Known Hosts

Remove stale entries before adding new ones (run from your workstation):

```bash
for NODE in $(seq 1 3); do
  ssh-keygen -R rancher-0${NODE} -f ~/.ssh/known_hosts
done
```

## Verify Ansible Inventory

Confirm Ansible can reach all hosts:

```bash
cd enclave.kubernerdes.com/
ansible all -i Ansible/hosts -m ping
```

All hosts should respond with `pong`. Fix any that don't before proceeding to Day 2 operations.
