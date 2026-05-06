#!/usr/bin/env bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Building Docker images for K3s ==="
echo "Project root: $PROJECT_ROOT"

# Tag images
BACKEND_TAG="kg-backend:latest"
AI_TAG="kg-ai-service:latest"
FRONTEND_TAG="kg-frontend:latest"

build_and_import() {
    local tag="$1"
    local context="$2"
    local dockerfile="$3"
    local desc="$4"

    echo ""
    echo -e "${YELLOW}[1/2] Building $desc (${tag})...${NC}"
    docker build \
        -f "$PROJECT_ROOT/$dockerfile" \
        -t "$tag" \
        "$PROJECT_ROOT/$context"

    echo -e "${YELLOW}[2/2] Importing $tag into K3s containerd...${NC}"
    docker save "$tag" | sudo k3s ctr images import -
    echo -e "${GREEN}Done: $tag${NC}"
}

# Build and import backend
build_and_import "$BACKEND_TAG" "." "Dockerfile.backend" "Backend (FastAPI)"

# Build and import AI service
build_and_import "$AI_TAG" "." "Dockerfile.ai_service" "AI Service"

# Build and import frontend (with build arg)
echo ""
echo -e "${YELLOW}[1/2] Building Frontend (Next.js)...${NC}"
docker build \
    -f "$PROJECT_ROOT/Dockerfile.frontend" \
    --build-arg NEXT_PUBLIC_API_URL="/api/v1" \
    -t "$FRONTEND_TAG" \
    "$PROJECT_ROOT"

echo -e "${YELLOW}[2/2] Importing $FRONTEND_TAG into K3s containerd...${NC}"
docker save "$FRONTEND_TAG" | sudo k3s ctr images import -
echo -e "${GREEN}Done: $FRONTEND_TAG${NC}"

# Verify images are loaded
echo ""
echo "=== Verifying images in K3s ==="
sudo k3s ctr images ls | grep -E "kg-(backend|ai-service|frontend)" || true

echo ""
echo -e "${GREEN}=== All images built and loaded ===${NC}"
