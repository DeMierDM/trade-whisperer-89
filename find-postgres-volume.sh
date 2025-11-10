#!/bin/bash

# Script to find actual PostgreSQL database volumes

echo "🔍 Searching for actual PostgreSQL database volumes..."
echo ""

found=0

for vol in $(docker volume ls -q -f dangling=true); do
    # Check for PostgreSQL-specific directories
    has_base=$(docker run --rm -v $vol:/data alpine sh -c "test -d /data/base && echo 1 || echo 0" 2>/dev/null)
    has_pg_wal=$(docker run --rm -v $vol:/data alpine sh -c "test -d /data/pg_wal && echo 1 || echo 0" 2>/dev/null)
    has_pg_conf=$(docker run --rm -v $vol:/data alpine sh -c "test -f /data/postgresql.conf && echo 1 || echo 0" 2>/dev/null)

    if [ "$has_base" == "1" ] || [ "$has_pg_wal" == "1" ] || [ "$has_pg_conf" == "1" ]; then
        echo "✅ FOUND PostgreSQL database in volume: $vol"
        echo ""
        echo "   Volume contents:"
        docker run --rm -v $vol:/data alpine ls -lah /data 2>/dev/null | head -20
        echo ""
        echo "   Database size:"
        docker run --rm -v $vol:/data alpine du -sh /data 2>/dev/null
        echo ""

        # Check for backtests table data
        echo "   Checking for backtest data..."
        docker run --rm -v $vol:/data alpine sh -c "find /data/base -type f | wc -l" 2>/dev/null | xargs echo "   Number of database files:"
        echo ""

        found=1
        echo "==================================================="
        echo ""
    fi
done

if [ $found -eq 0 ]; then
    echo "❌ No PostgreSQL database volumes found in dangling volumes."
    echo ""
    echo "This means the database was permanently deleted when I ran"
    echo "'docker-compose down -v' which removes all volumes."
    echo ""
    echo "However, you can check for:"
    echo "1. CSV exports in ./data/"
    echo "2. Any manual backups you may have created"
    echo "3. Time Machine backups (if on macOS)"
fi
