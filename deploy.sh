#!/bin/bash
# -*- coding: utf-8 -*-
#
# One-command deploy: ./deploy.sh
#
# Prerequisites (once):
#   1. Install Docker:  curl -fsSL https://get.docker.com | sh
#   2. Install Docker Compose: already included in Docker Engine 24+
#   3. Point DNS A records to this server:
#        yourdomain.com     → <server IP>
#        api.yourdomain.com → <server IP>
#   4. Copy .env.prod → .env and fill in real values
#   5. Ensure firewalls allow ports 80 & 443:
#        ufw allow 80/tcp && ufw allow 443/tcp

set -euo pipefail

cd "$(dirname "$0")"

echo "=== Pulling latest code ==="
git pull --ff-only

echo "=== Copying .env.prod to .env (if .env doesn't exist) ==="
[ -f .env ] || cp .env.prod .env
echo "IMPORTANT: Edit .env with your real passwords and domain before continuing!"
echo "           vi .env"
echo ""
read -rp "Press Enter after you've updated .env... "

echo "=== Building images ==="
docker compose -f docker-compose.prod.yml build --pull

echo "=== Starting services ==="
docker compose -f docker-compose.prod.yml up -d

echo "=== Waiting for health checks ==="
sleep 10
docker compose -f docker-compose.prod.yml ps

echo ""
echo "=== Deployment complete ==="
echo "Visit: https://${DOMAIN:-yourdomain.com}"
echo ""
echo "Troubleshooting:"
echo "  docker compose -f docker-compose.prod.yml logs -f"
echo "  docker compose -f docker-compose.prod.yml ps"
