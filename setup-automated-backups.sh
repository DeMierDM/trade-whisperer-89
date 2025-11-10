#!/bin/bash

# Automated PostgreSQL Backup Script for Trade Whisperer
# Creates daily backups and keeps the last 10

# Configuration
BACKUP_DIR="$HOME/trading-backups"
CONTAINER_NAME="trading_db"
DB_USER="trader"
DB_NAME="trading_system"
RETENTION_DAYS=10

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo -e "${BLUE}  Trade Whisperer Database Backup${NC}"
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo ""

# Create backup directory if it doesn't exist
if [ ! -d "$BACKUP_DIR" ]; then
    echo "Creating backup directory: $BACKUP_DIR"
    mkdir -p "$BACKUP_DIR"
fi

# Generate filename with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/trading_db_${TIMESTAMP}.sql"

echo "Backing up database..."
echo "  Container: $CONTAINER_NAME"
echo "  Database: $DB_NAME"
echo "  Backup file: $BACKUP_FILE"
echo ""

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "❌ Error: Container $CONTAINER_NAME is not running"
    echo "   Start it with: docker-compose up -d"
    exit 1
fi

# Perform backup
docker exec $CONTAINER_NAME pg_dump -U $DB_USER $DB_NAME > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Database backup successful${NC}"

    # Compress backup
    echo "Compressing backup..."
    gzip "$BACKUP_FILE"

    if [ $? -eq 0 ]; then
        COMPRESSED_FILE="${BACKUP_FILE}.gz"
        BACKUP_SIZE=$(du -h "$COMPRESSED_FILE" | cut -f1)
        echo -e "${GREEN}✅ Backup compressed: $BACKUP_SIZE${NC}"
        echo "   Location: $COMPRESSED_FILE"
    else
        echo "⚠️  Compression failed, keeping uncompressed backup"
        BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        echo "   Location: $BACKUP_FILE"
    fi

    # Clean up old backups
    echo ""
    echo "Cleaning up old backups (keeping last $RETENTION_DAYS)..."

    cd "$BACKUP_DIR"
    OLD_BACKUPS=$(ls -t trading_db_*.sql.gz 2>/dev/null | tail -n +$((RETENTION_DAYS + 1)))

    if [ ! -z "$OLD_BACKUPS" ]; then
        echo "$OLD_BACKUPS" | while read file; do
            echo "  Removing: $file"
            rm -f "$file"
        done
    else
        echo "  No old backups to remove"
    fi

    # Show backup summary
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════${NC}"
    echo -e "${GREEN}Backup Summary${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════${NC}"
    echo "Latest backup: $(basename $COMPRESSED_FILE 2>/dev/null || basename $BACKUP_FILE)"
    echo "Size: $BACKUP_SIZE"
    echo "Total backups: $(ls -1 trading_db_*.sql.gz 2>/dev/null | wc -l | xargs)"
    echo "Location: $BACKUP_DIR"
    echo ""
    echo -e "${GREEN}✅ Backup complete!${NC}"

else
    echo "❌ Backup failed"
    exit 1
fi
