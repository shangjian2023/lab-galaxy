#!/usr/bin/env bash
# deploy-update.sh — Rolling update for kg-platform
# Usage: ./deploy-update.sh
# This script pulls latest code, rebuilds changed images, and restarts services
# one at a time to minimize downtime.
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"

log() { echo "[UPDATE] $1"; }
ok()  { echo "[OK]     $1"; }

log "=== Rolling Update Started ==="

# Step 1: Backup
log "Step 1: Backing up databases..."
./scripts/backup.sh

# Step 2: Pull latest code
log "Step 2: Pulling latest code..."
git pull --ff-only
ok "Code updated"

# Step 3: Rebuild changed images
log "Step 3: Rebuilding images..."
docker compose -f "$COMPOSE_FILE" build --pull
ok "Images rebuilt"

# Step 4: Rolling restart — one service at a time
# Order: ai_service (no user impact) → backend (brief API downtime) → frontend

log "Step 4a: Restarting ai-service..."
docker compose -f "$COMPOSE_FILE" up -d --no-deps --force-recreate ai_service
sleep 10
ok "ai-service restarted"

log "Step 4b: Restarting backend..."
docker compose -f "$COMPOSE_FILE" up -d --no-deps --force-recreate backend
sleep 15
ok "backend restarted"

log "Step 4c: Restarting frontend..."
docker compose -f "$COMPOSE_FILE" up -d --no-deps --force-recreate frontend
sleep 10
ok "frontend restarted"

# Step 5: Verify
log "Step 5: Verifying services..."
docker compose -f "$COMPOSE_FILE" ps

echo ""
log "Testing endpoints..."
curl -sk -o /dev/null -w "Frontend: HTTPS %{http_code}\n" https://graph.mazhuoran.cloud/
curl -sk -o /dev/null -w "Backend:  HTTPS %{http_code}\n" https://graph.mazhuoran.cloud/api/v1/health
curl -sI https://api.mazhuoran.cloud/ | head -1

echo ""
ok "=== Rolling Update Complete ==="
