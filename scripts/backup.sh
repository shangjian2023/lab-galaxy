#!/usr/bin/env bash
# backup.sh — Backup kg-platform data
# Usage: ./backup.sh [--full]
# --full: also backup MinIO file data (slower, larger)
set -euo pipefail

BACKUP_DIR="/home/ubuntu/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

log() { echo "[BACKUP] $1"; }
ok()  { echo "[OK]     $1"; }

log "Starting backup to $BACKUP_DIR"

# PostgreSQL
log "Backing up PostgreSQL..."
docker exec kg_postgres pg_dump -U postgres kg_platform | gzip > "$BACKUP_DIR/postgres.sql.gz"
ok "PostgreSQL: $(du -h "$BACKUP_DIR/postgres.sql.gz" | cut -f1)"

# Neo4j
log "Backing up Neo4j..."
docker exec kg_neo4j neo4j-admin database dump neo4j --to-path=/tmp
docker cp kg_neo4j:/tmp/neo4j.dump "$BACKUP_DIR/neo4j.dump" 2>/dev/null || \
  docker cp kg_neo4j:/data/databases/neo4j.dump "$BACKUP_DIR/neo4j.dump" 2>/dev/null || true
rm -f /tmp/neo4j.dump 2>/dev/null || true
ok "Neo4j: $(du -h "$BACKUP_DIR/neo4j.dump" 2>/dev/null | cut -f1 || echo 'skipped')"

# MinIO (metadata only, unless --full)
if [[ "${1:-}" == "--full" ]]; then
  log "Backing up MinIO data (full)..."
  tar czf "$BACKUP_DIR/minio.tar.gz" /var/lib/docker/volumes/*_minio_data/_data/ 2>/dev/null || true
  ok "MinIO: $(du -h "$BACKUP_DIR/minio.tar.gz" | cut -f1)"
else
  log "Skipping MinIO data (use --full to include)"
fi

# .env (passwords)
cp /home/ubuntu/kg-platform/.env "$BACKUP_DIR/.env" 2>/dev/null || true

# Summary
log "=== Backup Summary ==="
du -sh "$BACKUP_DIR"
ls -lh "$BACKUP_DIR/"

# Cleanup old backups (keep last 7 days)
log "Cleaning up backups older than 7 days..."
find /home/ubuntu/backups -maxdepth 1 -type d -mtime +7 -exec rm -rf {} \; 2>/dev/null || true
ok "Old backups cleaned"
