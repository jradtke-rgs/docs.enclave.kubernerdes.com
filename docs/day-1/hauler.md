---
id: hauler
title: Hauler & Carbide Setup
sidebar_label: Hauler & Carbide
sidebar_position: 4
---

# Hauler & Carbide Setup

[Hauler](https://hauler.dev) is RGS Carbide's artifact management tool. It mirrors container images, Helm charts, and other content into a local store that can be served to air-gapped clusters. Install and run Hauler on `nuc-00`.

## Prerequisites

You will need your Carbide credentials (username and password) from the Carbide Portal. Contact your RGS team to request access if you haven't done so already (see [Prerequisites](../day-0/prerequisites.md)).

## Step 1: Install Cosign

Cosign provides supply-chain verification for Carbide images.

```bash
sudo su -

COSIGN_BINARY=cosign-linux-amd64
COSIGN_CHECKSUMS=cosign_checksums.txt
TMPDIR="$(mktemp -d)"

curl -fsSL -o ${TMPDIR}/${COSIGN_BINARY} \
  "https://github.com/sigstore/cosign/releases/latest/download/${COSIGN_BINARY}"
curl -fsSL -o ${TMPDIR}/${COSIGN_CHECKSUMS} \
  "https://github.com/sigstore/cosign/releases/latest/download/${COSIGN_CHECKSUMS}"

EXPECTED_HASH=$(grep -w "${COSIGN_BINARY}" ${TMPDIR}/${COSIGN_CHECKSUMS} | awk '{ print $1 }')
CALCULATED_HASH=$(sha256sum ${TMPDIR}/${COSIGN_BINARY} | awk '{ print $1 }')

if [[ ${EXPECTED_HASH} != ${CALCULATED_HASH} ]]; then
  echo "ERROR: hash does not match. Exiting."
  exit 1
fi

install -m 0755 -o root "${TMPDIR}/${COSIGN_BINARY}" /usr/local/bin/cosign
cosign version
```

## Step 2: Install Hauler

```bash
curl -sfL https://get.hauler.dev | bash
hauler version
```

## Step 3: Configure Credentials

```bash
mkdir -p ~/.hauler

cat << 'EOF' > ~/.hauler/credentials
export HAULER_USER="<your-carbide-username>"
export HAULER_PASSWORD="<your-carbide-password>"
export HAULER_SOURCE_REPO_URL="rgcrprod.azurecr.us"
EOF

source ~/.hauler/credentials
```

Set up persistent shell helpers so credentials and the store path are available across sessions:

```bash
mkdir -p ~/.bashrc.d/

cat << 'EOF' > ~/.bashrc.d/HAULER
export HAULER_STORE_DIR=/srv/www/htdocs/hauler/store
export HAULER_CREDS_FILE=~/.hauler/credentials

[ -f $HAULER_CREDS_FILE ] && source $HAULER_CREDS_FILE
alias HAULER_LOGIN="$(which hauler) login \$HAULER_SOURCE_REPO_URL -u \$HAULER_USER -p \$HAULER_PASSWORD"
EOF

hauler completion bash >> ~/.bashrc.d/HAULER-completion
source ~/.bashrc
```

## Step 4: Log In to the Carbide Registry

```bash
HAULER_LOGIN
```

## Step 5: Prepare the Hauler Store Directory

Apache serves this directory so nodes can pull images during deployment:

```bash
mkdir -p /srv/www/htdocs/hauler/store
export HAULER_STORE_DIR=/srv/www/htdocs/hauler/store
```

## Step 6: Sync Carbide Products

Sync the required products into the local Hauler store:

| Product | Version |
|---------|---------|
| Rancher Manager | v2.13.3 |
| RKE2 | v1.35.2+rke2r1 |
| NeuVector | v5.4.9 |

```bash
PRODUCTS="rancher=v2.13.3 rke2=v1.35.2+rke2r1 neuvector=v5.4.9"

for PRODUCT in $PRODUCTS; do
  echo "Syncing: $PRODUCT"
  hauler store sync --products $PRODUCT --platform linux/amd64
  echo
done
```

> Each product sync can take several minutes depending on your connection. Rancher pulls a large number of images.

## Step 7: Sync Carbide Core Images

```bash
curl -sfOL https://raw.githubusercontent.com/rancherfederal/carbide-releases/main/carbide-key.pub

cat << EOF > carbide-images.yaml
apiVersion: content.hauler.cattle.io/v1
kind: Images
metadata:
  name: carbide-images
spec:
  images:
$(curl -sfL https://raw.githubusercontent.com/rancherfederal/carbide-releases/main/carbide-images.txt | sed '/nats/d' | sed 's/^/    - name: /')
EOF

hauler store sync --filename carbide-images.yaml
```

## Verification

```bash
# Check the store is populated
hauler store info

# Verify Apache is serving it
curl -s http://10.10.12.10/hauler/store/ | head -20
```

## Capturing Running Cluster Images (Post-Deployment)

After clusters are up, capture all running images into the store for future air-gap refreshes:

```bash
for CONFIG in $(find ~/.kube -name "*.kubeconfig"); do
  export KUBECONFIG=$CONFIG
  CLUSTER_NAME=$(kubectl config view --minify --output jsonpath='{.contexts[0].context.cluster}')
  kubectl get pods --all-namespaces \
    -o jsonpath="{.items[*].spec.containers[*].image}" \
    | tr ' ' '\n' | sort -u > ~/.hauler/image_list.${CLUSTER_NAME}
done

cat ~/.hauler/image_list.* | sort -u > ~/.hauler/all_image_list

IMAGE_LIST_MODIFIED=$(sed 's/^/    - name: /' ~/.hauler/all_image_list)

cat << EOF > hauler-manifest.yaml
---
apiVersion: content.hauler.cattle.io/v1
kind: Images
metadata:
  name: hauler-cluster-images
spec:
  images:
$IMAGE_LIST_MODIFIED
EOF

hauler store sync --filename hauler-manifest.yaml
```

Proceed to [Harvester Cluster](./harvester-cluster.md).
