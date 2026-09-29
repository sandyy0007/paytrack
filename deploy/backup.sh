#!/bin/bash
set -e

BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/paytrack_backup_${TIMESTAMP}.sql"

mkdir -p "$BACKUP_DIR"

echo "📦 Creating automated PostgreSQL backup: ${BACKUP_FILE}..."
docker compose exec -T db pg_dump -U paytrack_admin -d paytrack --clean --if-exists > "$BACKUP_FILE"

echo "✅ Backup completed successfully! File size: $(du -h "$BACKUP_FILE" | cut -f1)"

# Keep last 14 days of backups
find "$BACKUP_DIR" -type f -name "paytrack_backup_*.sql" -mtime +14 -delete
echo "🧹 Old backups pruned (retaining last 14 days)."
