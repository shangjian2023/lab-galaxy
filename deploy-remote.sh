#!/usr/bin/env bash
# deploy-remote.sh — One-click deploy kg-platform to 193.112.70.157
# Usage: ./deploy-remote.sh
set -euo pipefail

SSH_KEY="D:\X\shangjian.pem"
SSH_USER="ubuntu"
SSH_HOST="193.112.70.157"
REMOTE_DIR="/home/ubuntu/kg-platform"
SSH="ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no ${SSH_USER}@${SSH_HOST}"

log() { echo "[DEPLOY] $1"; }
ok()  { echo "[OK]     $1"; }
fail(){ echo "[FAIL]   $1"; exit 1; }

# ── Step 0: Upload code ──
log "Pushing code to server..."

# Use scp to create a tarball and extract on server
tar czf /tmp/kg-platform-deploy.tar.gz \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.venv' \
  --exclude='__pycache__' \
  --exclude='.next' \
  --exclude='.claude' \
  --exclude='*.log' \
  --exclude='tmp_*' \
  -C "$(dirname "$0")" .

scp -i "${SSH_KEY}" -o StrictHostKeyChecking=no \
  /tmp/kg-platform-deploy.tar.gz \
  ${SSH_USER}@${SSH_HOST}:/tmp/kg-platform-deploy.tar.gz

$SSH "mkdir -p ${REMOTE_DIR} && tar xzf /tmp/kg-platform-deploy.tar.gz -C ${REMOTE_DIR}/ && rm /tmp/kg-platform-deploy.tar.gz"
rm -f /tmp/kg-platform-deploy.tar.gz
ok "Code uploaded"

# ── Step 1: Cleanup old data ──
log "Cleaning up old Docker resources..."
$SSH bash << 'REMOTE_EOF'
set -euo pipefail

# Start Docker if not running
sudo systemctl start docker 2>/dev/null || true

# Remove old containers
docker stop $(docker ps -aq) 2>/dev/null || true
docker rm $(docker ps -aq) 2>/dev/null || true

# Remove old volumes
docker volume rm kg-platform_postgres_data kg-platform_neo4j_data \
  kg-platform_neo4j_logs kg-platform_redis_data kg-platform_minio_data \
  kg-platform_ai_data kg-platform_caddy_data kg-platform_caddy_config \
  2>/dev/null || true

# Remove old images
docker rmi kg-ai-service:latest kg-backend:latest kg-frontend:latest 2>/dev/null || true
docker image prune -a -f --filter "until=72h"
docker builder prune -af

# Remove K3d残留
sudo rm -rf /var/lib/rancher/k3s 2>/dev/null || true

# Remove old code copies
sudo rm -rf /opt/kg-platform 2>/dev/null || true
rm -rf /home/ubuntu/kg-platform-new 2>/dev/null || true

echo "Cleanup done"
df -h /
REMOTE_EOF
ok "Cleanup complete"

# ── Step 2: Generate .env with strong passwords ──
log "Generating secure passwords..."
$SSH bash << 'REMOTE_EOF'
set -euo pipefail

POSTGRES_PW=$(openssl rand -base64 32 | tr -d '\n')
NEO4J_PW=$(openssl rand -base64 32 | tr -d '\n')
MINIO_ACCESS=$(openssl rand -hex 16)
MINIO_SECRET=$(openssl rand -hex 32)
SECRET_KEY=$(openssl rand -hex 64)

cat > /home/ubuntu/kg-platform/.env << ENVEOF
DOMAIN=graph.mazhuoran.cloud
POSTGRES_PASSWORD=${POSTGRES_PW}
NEO4J_PASSWORD=${NEO4J_PW}
MINIO_ACCESS_KEY=${MINIO_ACCESS}
MINIO_SECRET_KEY=${MINIO_SECRET}
SECRET_KEY=${SECRET_KEY}
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-kaecyslkmwdvoozlkbmsrpofrcecvyaxjjtwngywgurajarv
OPENAI_BASE_URL=https://api.siliconflow.cn/v1
OPENAI_MODEL=Qwen/Qwen3.6-27B
LOG_LEVEL=INFO
ENVEOF

chmod 600 /home/ubuntu/kg-platform/.env
echo "=== .env created ==="
cat /home/ubuntu/kg-platform/.env | sed 's/=.*/=***/g'
REMOTE_EOF
ok "Passwords generated"

# Step 3: Build images
log "Building Docker images..."
$SSH bash << 'REMOTE_EOF'
set -euo pipefail
cd /home/ubuntu/kg-platform
docker-compose -f docker-compose.prod.yml build --pull
REMOTE_EOF
ok "Images built"

# ── Step 4: Start services ──
log "Starting services..."
$SSH bash << 'REMOTE_EOF'
set -euo pipefail
cd /home/ubuntu/kg-platform
docker-compose -f docker-compose.prod.yml up -d
REMOTE_EOF
ok "Services started"

# ── Step 5: Configure system Caddy ──
log "Configuring system Caddy..."
$SSH bash << 'REMOTE_EOF'
set -euo pipefail

# Backup existing Caddyfile
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.backup.$(date +%Y%m%d_%H%M%S)

# Check if graph.mazhuoran.cloud is already configured
if grep -q "graph.mazhuoran.cloud" /etc/caddy/Caddyfile; then
  echo "graph.mazhuoran.cloud already in Caddyfile, skipping"
else
  sudo tee -a /etc/caddy/Caddyfile << 'EOF'

graph.mazhuoran.cloud {
    @websocket {
        header Connection *Upgrade*
        path /api/v1/ws/*
    }
    reverse_proxy @websocket 127.0.0.1:8000 {
        header_up Connection {>Connection}
        header_up Upgrade {>Upgrade}
    }
    handle /api/* {
        reverse_proxy 127.0.0.1:8000
    }
    handle /docs* {
        reverse_proxy 127.0.0.1:8000
    }
    handle /openapi.json* {
        reverse_proxy 127.0.0.1:8000
    }
    handle /health* {
        reverse_proxy 127.0.0.1:8000
    }
    reverse_proxy 127.0.0.1:3001
}
EOF
  echo "Added graph.mazhuoran.cloud to Caddyfile"
fi

# Reload Caddy (zero-downtime)
sudo systemctl reload caddy
echo "Caddy reloaded"
REMOTE_EOF
ok "Caddy configured"

# ── Step 6: Wait & Verify ──
log "Waiting for services to stabilize..."
sleep 15

log "Verifying deployment..."
$SSH bash << 'REMOTE_EOF'
set -euo pipefail
cd /home/ubuntu/kg-platform

echo "=== Container Status ==="
docker-compose -f docker-compose.prod.yml ps

echo ""
echo "=== NewAPI (should be 200) ==="
curl -sI https://api.mazhuoran.cloud/ | head -1

echo ""
echo "=== Frontend (should be 200) ==="
curl -skI https://graph.mazhuoran.cloud/ | head -1

echo ""
echo "=== Backend Health ==="
curl -sk https://graph.mazhuoran.cloud/api/v1/health | head -c 200

echo ""
echo "=== Disk Space ==="
df -h /
REMOTE_EOF

echo ""
ok "=== Deployment complete ==="
echo "Visit: https://graph.mazhuoran.cloud"
echo ""
echo "To view passwords:"
echo "  ssh -i ${SSH_KEY} ${SSH_USER}@${SSH_HOST} 'cat ${REMOTE_DIR}/.env'"
echo ""
echo "To view logs:"
echo "  ssh -i ${SSH_KEY} ${SSH_USER}@${SSH_HOST} 'cd ${REMOTE_DIR} && docker compose -f docker-compose.prod.yml logs -f'"
