#!/usr/bin/env bash
# Backup script for Meridian database
# Usage: ./backup.sh [backup_dir]

set -euo pipefail

BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/meridian_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "Starting backup at $(date)..."
echo "Backup file: ${BACKUP_FILE}"

# Check if DATABASE_URL is set
if [ -z "${DATABASE_URL:-}" ]; then
    echo "ERROR: DATABASE_URL environment variable not set"
    exit 1
fi

# Perform backup
if pg_dump "${DATABASE_URL}" | gzip > "${BACKUP_FILE}"; then
    echo "Backup completed successfully at $(date)"
    echo "File size: $(du -h "${BACKUP_FILE}" | cut -f1)"
    
    # Verify backup integrity
    if gunzip -t "${BACKUP_FILE}"; then
        echo "Backup integrity verified"
    else
        echo "ERROR: Backup file is corrupted"
        exit 1
    fi
    
    # Keep only last 7 daily backups
    find "${BACKUP_DIR}" -name "meridian_*.sql.gz" -type f -mtime +7 -delete
    echo "Old backups cleaned up (kept last 7 days)"
else
    echo "ERROR: Backup failed"
    exit 1
fi

echo "Backup process completed"