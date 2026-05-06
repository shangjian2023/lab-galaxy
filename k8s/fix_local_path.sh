#!/usr/bin/env bash
set -euo pipefail

NODE_NAME="vm-0-12-ubuntu"
STORAGE_PATH="/var/lib/rancher/k3s/storage"

# Create the new config.json
NEW_CONFIG=$(cat <<EOJSON
{
  "nodePathMap": [
    {
      "node": "${NODE_NAME}",
      "paths": ["${STORAGE_PATH}"]
    },
    {
      "node": "DEFAULT_PATH_FOR_NON_LISTED_NODES",
      "paths": ["${STORAGE_PATH}"]
    }
  ]
}
EOJSON
)

echo "New config.json:"
echo "$NEW_CONFIG"

# Patch the configmap
sudo kubectl patch configmap local-path-config -n kube-system \
  --type merge \
  -p "{\"data\":{\"config.json\":$(echo "$NEW_CONFIG" | sudo kubectl run -it --rm --image=busybox:1.36 --restart=Never -- sh -c 'cat' 2>/dev/null || echo "$NEW_CONFIG")}}"

echo "ConfigMap patched. Restarting provisioner..."

# Delete the provisioner pod to pick up the new config
sudo kubectl delete pod -l app=local-path-provisioner -n kube-system

echo "Waiting for provisioner to restart..."
sleep 5
sudo kubectl logs -l app=local-path-provisioner -n kube-system --tail=10
