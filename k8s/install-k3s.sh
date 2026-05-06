#!/usr/bin/env bash
set -euo pipefail

echo "=== Installing K3s ==="

# Check if K3s is already installed
if command -v k3s &>/dev/null; then
    echo "K3s is already installed: $(k3s --version)"
    echo "To reinstall, first run: k3s-uninstall.sh"
    exit 0
fi

# Install K3s with Traefik disabled (we use Caddy instead)
echo "Downloading and installing K3s..."
curl -sfL https://get.k3s.io | sh -s - server --disable traefik

# Wait for K3s to be ready
echo "Waiting for K3s to start..."
for i in $(seq 1 30); do
    if kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml get nodes &>/dev/null; then
        break
    fi
    echo "  Waiting... ($i/30)"
    sleep 2
done

# Verify installation
echo ""
echo "=== K3s Installation Status ==="
echo "Node status:"
kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml get nodes -o wide

echo ""
echo "Core components:"
kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml get pods -n kube-system

echo ""
echo "Storage class:"
kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml get storageclass

echo ""
echo "=== K3s installed successfully ==="
echo "Kubeconfig: /etc/rancher/k3s/k3s.yaml"
echo "To use kubectl: export KUBECONFIG=/etc/rancher/k3s/k3s.yaml"
