#!/bin/bash
# Fix PVs with proper claimRef
set -euo pipefail

# Delete existing PVs
sudo kubectl delete pv --all 2>/dev/null || true

# Create PVs with correct claimRef
for spec in \
  "postgres-pv:/var/lib/rancher/k3s/storage/postgres-data:10Gi:postgres-data-postgres-0" \
  "neo4j-data-pv:/var/lib/rancher/k3s/storage/neo4j-data:5Gi:neo4j-data-neo4j-0" \
  "neo4j-logs-pv:/var/lib/rancher/k3s/storage/neo4j-logs:1Gi:neo4j-logs-neo4j-0" \
  "redis-pv:/var/lib/rancher/k3s/storage/redis-data:1Gi:redis-data-redis-0" \
  "minio-pv:/var/lib/rancher/k3s/storage/minio-data:10Gi:minio-data-minio-0"; do

  PV_NAME="${spec%%:*}"
  REST="${spec#*:}"
  HOST_PATH="${REST%%:*}"
  REST2="${REST#*:}"
  SIZE="${REST2%%:*}"
  PVC_NAME="${REST2#*:}"

  cat << EOF | sudo kubectl apply -f -
apiVersion: v1
kind: PersistentVolume
metadata:
  name: ${PV_NAME}
spec:
  capacity:
    storage: ${SIZE}
  accessModes:
    - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: local-path
  claimRef:
    name: ${PVC_NAME}
    namespace: kg-platform
  hostPath:
    path: ${HOST_PATH}
EOF

  echo "Created PV: $PV_NAME -> $PVC_NAME ($HOST_PATH, $SIZE)"
done

echo ""
echo "=== PV Status ==="
sudo kubectl get pv

echo ""
echo "=== PVC Status ==="
sudo kubectl get pvc -n kg-platform

echo ""
echo "=== Pod Status ==="
sudo kubectl get pods -n kg-platform
