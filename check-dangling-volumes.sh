#!/bin/bash

# Script to search for PostgreSQL data in dangling Docker volumes

echo "🔍 Searching for PostgreSQL database in dangling volumes..."
echo ""

found_postgres=0

for vol in $(docker volume ls -q -f dangling=true); do
    # Check if this volume contains PostgreSQL data
    result=$(docker run --rm -v $vol:/data alpine sh -c "ls /data 2>/dev/null | grep -E 'base|pg_|postgresql.conf'" 2>/dev/null)

    if [ ! -z "$result" ]; then
        echo "✅ Found PostgreSQL data in volume: $vol"
        echo "   Contents:"
        docker run --rm -v $vol:/data alpine ls -lah /data 2>/dev/null | head -10
        echo ""
        found_postgres=1

        # Save the volume name
        echo $vol > .recovered_volume_name
    fi
done

if [ $found_postgres -eq 0 ]; then
    echo "❌ No PostgreSQL data found in dangling volumes"
    echo ""
    echo "The database was likely permanently deleted when 'docker-compose down -v' was run."
else
    echo "✅ Found PostgreSQL volume! See above for volume name."
fi
