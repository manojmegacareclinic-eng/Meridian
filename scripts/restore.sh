#!/usr/bin/env bash
# Restore script for Meridian database
# Usage: ./restore.sh <backup_file>

set -euo pipefail

BACKUP_FILE="${1:-}"

if [ -z "${BACKUP_FILE}" ]; then
    echo "Usage: $0 <backup_file>"
    echo "Example: $0 ./backups/meridian_20260115_120000.sql.gz"
    exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "ERROR: Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
    echo "ERROR: DATABASE_URL environment variable not set"
    exit 1
fi

echo "Starting restore at $(date)..."
echo "Restore file: ${BACKUP_FILE}"

# Verify backup integrity
if ! gunzip -t "${BACKUP_FILE}"; then
    echo "ERROR: Backup file is corrupted"
    exit 1
fi

echo "Backup integrity verified"

# Confirm restore
echo "WARNING: This will OVERWRITE the current database!"
read -p "Are you sure you want to continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Restore cancelled"
    exit 1
fi

echo "Starting restore at $(date)..."

# Drop and recreate database
DB_NAME=$(echo "${DATABASE_URL}" | sed -n 's/.*\/\([^?]*\).*/\1/p')
DB_HOST=$(echo "${DATABASE_URL}" | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo "${DATABASE_URL}" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_USER=$(echo "${DATABASE_URL}" | sed -n 's/.*\/\/\([^:]*\):.*/\1/p')

echo "Dropping and recreating database..."

# Use pg_dump to get the schema first, then restore
if gunzip -c "${BACKUP_FILE}" | psql "${DATABASE_URL}"; then
    echo "Restore completed successfully at $(date)"
else
    echo "ERROR: Restore failed"
    exit 1
fi

echo "Restore process completed"