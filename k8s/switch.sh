#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

export KUBECONFIG="/etc/rancher/k3s/k3s.yaml"

log()  { echo -e "${GREEN}[SWITCH]${NC} $1"; }

log "=== Switching to K8s ==="

# ── Step 1: Stop Docker Compose services ──
log "[1/4] Stopping Docker Compose services..."
cd /home/ubuntu/kg-platform-new
sudo docker-compose -f docker-compose.prod.yml down
ok "Docker Compose stopped"

# ── Step 2: Stop system Caddy ──
log "[2/4] Stopping system Caddy..."
sudo kill $(pgrep -f "caddy run") 2>/dev/null || true
sleep 2
ok "System Caddy stopped"

# ── Step 3: Apply K8s Caddy + expose NodePorts ──
log "[3/4] Deploying K8s Caddy and exposing NodePorts..."
kubectl apply -f /tmp/k8s/10-caddy.yaml
ok "Caddy manifest applied"

# Wait for caddy to be ready
sleep 5
kubectl rollout status deployment/caddy-k8s -n kg-platform --timeout=60s 2>/dev/null || true

# ── Step 4: Verify ──
log "[4/4] Verifying..."
echo ""
kubectl get pods -n kg-platform
echo ""
kubectl get svc -n kg-platform
echo ""

# Test endpoints
NODE_IP=$(hostname -I | awk '{print $1}')
log "NodePort assignments:"
log "  backend:    $NODE_IP:30080"
log "  frontend:   $NODE_IP:30001"
log "  ai-service: $NODE_IP:30081"
log "  caddy http: $NODE_IP:30082"
log "  caddy https:$NODE_IP:30443"
echo ""
log "Testing graph.mazhuoran.cloud..."
sleep 3
curl -sk -o /dev/null -w "HTTPS %{http_code}\n" https://graph.mazhuoran.cloud || echo "HTTPS not ready yet"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://graph.mazhuoran.cloud || echo "HTTP not ready yet"
echo ""
log "Testing api.mazhuoran.cloud..."
curl -sk -o /dev/null -w "HTTPS %{http_code}\n" https://api.mazhuoran.cloud || echo "HTTPS not ready yet"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://api.mazhuoran.cloud || echo "HTTP not ready yet"

echo ""
log "=== Switch complete ==="
echo "If sites work, clean up Docker:"
echo "  docker container prune -f"
echo "  docker image prune -f"
echo ""
echo "To rollback (if needed):"
echo "  kubectl delete -f /tmp/k8s/10-caddy.yaml"
echo "  cd /home/ubuntu/kg-platform-new && sudo docker-compose -f docker-compose.prod.yml up -d"
