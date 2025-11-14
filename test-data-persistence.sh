#!/bin/bash

# Test Data Persistence Script
# Verifies that stock/options data survives container restarts

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Data Persistence Test${NC}"
echo -e "${BLUE}═════════════════════════════════════════════${NC}"
echo ""

# Step 1: Count records before restart
echo "📊 Step 1: Counting records before restart..."
BEFORE_STOCK=$(docker exec trading_db psql -U trader -d trading_system -t -c "SELECT COUNT(*) FROM bus_stock_data;" | xargs)
BEFORE_OPTIONS=$(docker exec trading_db psql -U trader -d trading_system -t -c "SELECT COUNT(*) FROM bus_option_data;" | xargs)

echo -e "   Stock records: ${GREEN}${BEFORE_STOCK}${NC}"
echo -e "   Options records: ${GREEN}${BEFORE_OPTIONS}${NC}"
echo ""

# Step 2: Restart containers (WITHOUT -v flag!)
echo "🔄 Step 2: Restarting containers (preserving volumes)..."
docker-compose restart database data_bus_manager

echo "   Waiting 10 seconds for services to initialize..."
sleep 10
echo ""

# Step 3: Count records after restart
echo "📊 Step 3: Counting records after restart..."
AFTER_STOCK=$(docker exec trading_db psql -U trader -d trading_system -t -c "SELECT COUNT(*) FROM bus_stock_data;" | xargs)
AFTER_OPTIONS=$(docker exec trading_db psql -U trader -d trading_system -t -c "SELECT COUNT(*) FROM bus_option_data;" | xargs)

echo -e "   Stock records: ${GREEN}${AFTER_STOCK}${NC}"
echo -e "   Options records: ${GREEN}${AFTER_OPTIONS}${NC}"
echo ""

# Step 4: Verify persistence
echo -e "${BLUE}═════════════════════════════════════════════${NC}"
echo "📋 Test Results:"
echo -e "${BLUE}═════════════════════════════════════════════${NC}"
echo ""

STOCK_DIFF=$((AFTER_STOCK - BEFORE_STOCK))
OPTIONS_DIFF=$((AFTER_OPTIONS - BEFORE_OPTIONS))

if [ $AFTER_STOCK -ge $BEFORE_STOCK ]; then
    echo -e "${GREEN}✅ Stock data persisted successfully${NC}"
    echo "   Before: $BEFORE_STOCK"
    echo "   After:  $AFTER_STOCK"
    if [ $STOCK_DIFF -gt 0 ]; then
        echo -e "   ${GREEN}+$STOCK_DIFF new records (data bus is working!)${NC}"
    fi
else
    echo -e "${RED}❌ Stock data was lost!${NC}"
    echo "   Before: $BEFORE_STOCK"
    echo "   After:  $AFTER_STOCK"
fi

echo ""

if [ $AFTER_OPTIONS -ge $BEFORE_OPTIONS ]; then
    echo -e "${GREEN}✅ Options data persisted successfully${NC}"
    echo "   Before: $BEFORE_OPTIONS"
    echo "   After:  $AFTER_OPTIONS"
    if [ $OPTIONS_DIFF -gt 0 ]; then
        echo -e "   ${GREEN}+$OPTIONS_DIFF new records${NC}"
    fi
else
    echo -e "${RED}❌ Options data was lost!${NC}"
    echo "   Before: $BEFORE_OPTIONS"
    echo "   After:  $AFTER_OPTIONS"
fi

echo ""
echo -e "${BLUE}═════════════════════════════════════════════${NC}"
echo ""

# Show volume info
echo "📦 Volume Information:"
docker volume inspect trade-whisperer-89_postgres_data --format 'Name: {{.Name}}
Mountpoint: {{.Mountpoint}}
Created: {{.CreatedAt}}'

echo ""
echo -e "${GREEN}✅ Data persistence test complete!${NC}"
echo ""
echo "ℹ️  To SAFELY restart services (preserving data):"
echo "   docker-compose restart"
echo ""
echo "⚠️  NEVER use this command (deletes all data):"
echo "   docker-compose down -v  ❌ DON'T USE -v"
