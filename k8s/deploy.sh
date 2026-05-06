#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export KUBECONFIG="${KUBECONFIG:-/etc/rancher/k3s/k3s.yaml}"

log()  { echo -e "${BLUE}[DEPLOY]${NC} $1"; }
ok()   { echo -e "${GREEN}[OK]${NC}     $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC}   $1"; }

# ── Step 1: Check K3s ──
log "Checking K3s..."
if ! kubectl get nodes &>/dev/null; then
    echo "K3s not ready. Run install-k3s.sh first."
    exit 1
fi
ok "K3s ready"
kubectl get nodes

# ── Step 2: Apply core manifests (infra + apps, no caddy) ──
MANIFESTS=(
    "01-namespace.yaml"
    "02-secrets.yaml"
    "03-postgresql.yaml"
    "04-neo4j.yaml"
    "05-redis.yaml"
    "06-minio.yaml"
    "07-backend.yaml"
    "08-ai-service.yaml"
    "09-frontend.yaml"
)

log "Applying core manifests..."
for manifest in "${MANIFESTS[@]}"; do
    log "  $manifest"
    kubectl apply -f "$manifest"
done
ok "Core manifests applied"

# ── Step 3: Wait for infrastructure ──
log "Waiting for infrastructure..."
kubectl rollout status statefulset/postgres -n kg-platform --timeout=120s 2>/dev/null && ok "postgres ready" || warn "postgres not ready yet"
kubectl rollout status statefulset/neo4j -n kg-platform --timeout=120s 2>/dev/null && ok "neo4j ready" || warn "neo4j not ready yet"
kubectl rollout status statefulset/redis -n kg-platform --timeout=60s 2>/dev/null && ok "redis ready" || warn "redis not ready yet"
kubectl rollout status statefulset/minio -n kg-platform --timeout=60s 2>/dev/null && ok "minio ready" || warn "minio not ready yet"

# ── Step 4: Wait for apps ──
log "Waiting for apps..."
kubectl rollout status deployment/ai-service -n kg-platform --timeout=120s 2>/dev/null && ok "ai-service ready" || warn "ai-service not ready yet"
kubectl rollout status deployment/backend -n kg-platform --timeout=120s 2>/dev/null && ok "backend ready" || warn "backend not ready yet"
kubectl rollout status deployment/frontend -n kg-platform --timeout=60s 2>/dev/null && ok "frontend ready" || warn "frontend not ready yet"

echo ""
log "=== Status ==="
kubectl get pods -n kg-platform -o wide
echo ""
kubectl get svc -n kg-platform
echo ""
kubectl get pvc -n kg-platform
