# Database Schema Fix Guide

## Problem
- **Error**: "relation 'underlying_bars' does not exist"
- **Cause**: Missing database tables after code changes
- **Impact**: Backtests fail, screen goes black

---

## Solution: Recreate Database with Complete Schema

### Step 1: Stop All Docker Containers

```bash
cd /Users/demierminor/Desktop/trade-whisperer-89
docker-compose down
```

### Step 2: Remove Old Database Volume (CAUTION: This deletes all data)

```bash
# List volumes
docker volume ls | grep trade-whisperer

# Remove the postgres volume
docker volume rm trade-whisperer-89_postgres_data

# OR if named differently:
docker volume prune -f
```

### Step 3: Restart Docker Compose (Will Create Fresh Database)

```bash
# Start all services - database will initialize with new schema
docker-compose up -d

# Check if services are running
docker-compose ps
```

### Step 4: Verify Database Schema

```bash
# Check that underlying_bars table exists
docker exec trading_db psql -U trader -d trading_system -c "\dt"

# Should see:
# - users
# - api_keys
# - trading_sessions
# - backtests
# - option_contracts
# - strategy_signals
# - contract_greeks_history
# - option_contract_bars
# - underlying_bars ✅ (NEW!)
```

### Step 5: Populate Historical Data (Optional but Recommended)

```bash
# Fetch October 2024 data for backtesting
docker exec -e POSTGRES_HOST=database -e POSTGRES_PORT=5432 \
  -e POSTGRES_DB=trading_system -e POSTGRES_USER=trader \
  -e POSTGRES_PASSWORD=trading123 \
  trading_backtest node /app/scripts/populate-sql-cache.js \
  --symbol=SPY --start=2024-10-01 --end=2024-10-31
```

---

## Alternative: Manual Table Creation (If You Want to Keep Existing Data)

If you want to **keep your existing backtest data**, run this SQL instead:

```bash
docker exec trading_db psql -U trader -d trading_system << 'EOF'

-- Create underlying_bars table
CREATE TABLE IF NOT EXISTS underlying_bars (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    open DECIMAL(10, 4) NOT NULL,
    high DECIMAL(10, 4) NOT NULL,
    low DECIMAL(10, 4) NOT NULL,
    close DECIMAL(10, 4) NOT NULL,
    volume BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_underlying_bar UNIQUE (symbol, timestamp)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_underlying_symbol_time ON underlying_bars(symbol, timestamp);
CREATE INDEX IF NOT EXISTS idx_underlying_timestamp ON underlying_bars(timestamp);

-- Verify table was created
\dt underlying_bars

EOF
```

---

## What Changed in init.sql

**Added to `/docker/init.sql` (lines 249-271):**

```sql
-- ============================================================================
-- DATA CACHE TABLES (for backtesting efficiency)
-- ============================================================================

-- Underlying bars cache - stores 1-min OHLCV data for fast backtesting
CREATE TABLE IF NOT EXISTS underlying_bars (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    open DECIMAL(10, 4) NOT NULL,
    high DECIMAL(10, 4) NOT NULL,
    low DECIMAL(10, 4) NOT NULL,
    close DECIMAL(10, 4) NOT NULL,
    volume BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_underlying_bar UNIQUE (symbol, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_underlying_symbol_time ON underlying_bars(symbol, timestamp);
CREATE INDEX IF NOT EXISTS idx_underlying_timestamp ON underlying_bars(timestamp);
```

---

## Testing the Fix

### Test 1: Check Database Connection

```bash
docker exec trading_db psql -U trader -d trading_system -c "SELECT COUNT(*) FROM underlying_bars;"
# Should return: 0 (or number of rows if data was imported)
```

### Test 2: Test Backtest API Endpoint

```bash
curl -X POST http://localhost:3002/api/backtest \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "SPY",
    "startDate": "2024-10-01",
    "endDate": "2024-10-01",
    "strategyParams": {
      "priceVwapThreshold": 0.002,
      "profitTarget": 0.15,
      "stopLoss": 0.15
    }
  }'
```

### Test 3: Run Backtest Through UI

1. Open http://localhost:8080
2. Navigate to Backtesting page
3. Fill in parameters:
   - Symbol: SPY
   - Start Date: 2024-10-01
   - End Date: 2024-10-01
4. Click "Run Backtest"
5. Should see results (not black screen)

---

## Common Issues After Fix

### Issue 1: "Docker daemon not running"
```bash
# Start Docker Desktop application
# OR on Linux:
sudo systemctl start docker
```

### Issue 2: "Port already in use"
```bash
# Check what's using the port
lsof -i :3002
lsof -i :5433

# Kill the process or change ports in docker-compose.yml
```

### Issue 3: "Permission denied"
```bash
# Fix docker permissions (Linux)
sudo usermod -aG docker $USER
newgrp docker
```

### Issue 4: Frontend still shows black screen
- Check browser console for errors (F12)
- Check docker logs:
  ```bash
  docker logs trading_frontend
  docker logs trading_backtest
  docker logs trading_api
  ```

---

## Next Steps After Database Is Fixed

1. ✅ **Add Backtest History Dropdown**
   - Modify frontend to fetch previous backtests
   - Display in dropdown selector

2. ✅ **Fix Frontend Error Handling**
   - Add proper error messages instead of black screen
   - Show loading states

3. ✅ **Populate Historical Data**
   - Fetch more months of data for better backtesting

---

## Quick Recovery Commands

```bash
# Full reset (deletes everything)
cd /Users/demierminor/Desktop/trade-whisperer-89
docker-compose down -v
docker-compose up -d

# Check logs
docker-compose logs -f

# Check database tables
docker exec trading_db psql -U trader -d trading_system -c "\dt"

# Restart specific service
docker-compose restart trading_backtest
```

---

**✅ Updated Files:**
- `docker/init.sql` - Added underlying_bars table definition

**🔧 Action Required:**
Choose one:
- **Option A**: Full database reset (recommended, clean start)
- **Option B**: Manual table creation (keeps existing data)
