# Safe Docker Commands Reference

**IMPORTANT: How to avoid deleting your database**

---

## ✅ SAFE Commands (Data Persists)

### Restart Services
```bash
# Safe - restarts containers, keeps all data
docker-compose restart

# Restart specific service
docker-compose restart database
docker-compose restart data_bus_manager
```

### Stop Services
```bash
# Safe - stops containers, keeps all data
docker-compose stop

# Stop specific service
docker-compose stop database
```

### View Services
```bash
# View running containers
docker-compose ps
docker ps

# View logs
docker-compose logs -f data_bus_manager
docker logs trading_db --tail 50
```

### Start Services
```bash
# Safe - starts stopped containers
docker-compose start

# Start all services (if stopped)
docker-compose up -d
```

---

## ⚠️ DANGEROUS Commands (Can Delete Data)

### NEVER Use These Commands

```bash
# ❌ DELETES ALL DATA - Volume removed permanently
docker-compose down -v

# ❌ DELETES ALL VOLUMES - All databases lost
docker volume prune

# ❌ DELETES SPECIFIC VOLUME
docker volume rm trade-whisperer-89_postgres_data
```

**If you accidentally run `docker-compose down -v`:**
- All 24+ million records will be permanently deleted
- No recovery possible (unless you have Time Machine backup)
- You'll need to start fresh

---

## 🔄 Proper Shutdown Sequence

### When you're done working:

**Option 1: Leave containers running (Recommended)**
```bash
# Just close your terminal - containers keep running
# Data continues to be cached in background
```

**Option 2: Stop containers (saves resources)**
```bash
# Stop all services, keep all data
docker-compose stop

# Restart later with:
docker-compose start
```

**Option 3: Complete shutdown (rebuilds take longer)**
```bash
# Remove containers but KEEP volumes
docker-compose down   # ✅ NO -v FLAG!

# Restart later with:
docker-compose up -d
```

---

## 📊 Check Data Status

### View current data counts:
```bash
# Check stock data
docker exec trading_db psql -U trader -d trading_system -c \
  "SELECT symbol, data_type, COUNT(*)
   FROM bus_stock_data
   GROUP BY symbol, data_type;"

# Check total records
docker exec trading_db psql -U trader -d trading_system -c \
  "SELECT
    (SELECT COUNT(*) FROM bus_stock_data) as stock_records,
    (SELECT COUNT(*) FROM bus_option_data) as option_records,
    (SELECT COUNT(*) FROM backtests) as backtests;"
```

### Check volume size:
```bash
# View volume info
docker volume inspect trade-whisperer-89_postgres_data

# Check database size
docker exec trading_db psql -U trader -d trading_system -c \
  "SELECT pg_size_pretty(pg_database_size('trading_system')) as size;"
```

---

## 🔒 Data Persistence Explained

### How Data Persists

Your data is stored in a **Docker volume**:
```
Volume Name: trade-whisperer-89_postgres_data
Location: /var/lib/docker/volumes/trade-whisperer-89_postgres_data/_data
```

This volume:
- ✅ Survives container restarts
- ✅ Survives `docker-compose down` (without -v)
- ✅ Survives `docker-compose restart`
- ✅ Survives system reboots
- ❌ DELETED by `docker-compose down -v`
- ❌ DELETED by `docker volume rm`

### What Data is Stored

**Stock Market Data:**
- Real-time quotes (bid/ask prices)
- Trade executions
- Volume data
- Currently storing: 24+ million records

**Options Data:**
- Option chain quotes
- Greeks calculations
- Contract data

**Backtesting Data:**
- Backtest results
- Option contract positions
- Strategy signals
- Performance metrics

---

## 🧪 Test Data Persistence

I created a test script for you:

```bash
./test-data-persistence.sh
```

This script:
1. Counts records before restart
2. Restarts database container
3. Counts records after restart
4. Verifies data persisted

---

## 🛡️ Backup Recommendations

### Automated Daily Backups

```bash
# Set up automated backups
./setup-automated-backups.sh

# This creates:
# - Daily database dumps in ~/trading-backups
# - Compressed .gz files
# - Keeps last 10 backups
# - Runs at 2 AM daily (if you set up cron)
```

### Manual Backup

```bash
# Create backup now
docker exec trading_db pg_dump -U trader trading_system > \
  ~/backup_$(date +%Y%m%d_%H%M%S).sql

# Compress it
gzip ~/backup_*.sql
```

### Restore from Backup

```bash
# Restore from backup
gunzip -c ~/backup_20251106.sql.gz | \
  docker exec -i trading_db psql -U trader -d trading_system
```

---

## 🚨 Emergency Recovery

If you accidentally deleted data:

1. **Check Time Machine** (macOS)
   - Go to `~/Library/Containers/com.docker.docker/Data/`
   - Restore from before deletion

2. **Check Manual Backups**
   - Look in `~/trading-backups/`
   - Look for `.sql` or `.sql.gz` files

3. **Start Fresh**
   - System will work immediately
   - Data will accumulate as you use it

---

## ✅ Best Practices

1. **NEVER use `-v` flag** with `docker-compose down`
2. **Set up automated backups** (run `./setup-automated-backups.sh`)
3. **Leave containers running** when not actively developing
4. **Use `docker-compose restart`** instead of down/up
5. **Back up before major changes**

---

## 📋 Quick Reference Card

```bash
# Safe Commands ✅
docker-compose restart        # Restart, keep data
docker-compose stop          # Stop, keep data
docker-compose start         # Start stopped containers
docker-compose down          # Remove containers, keep data

# Dangerous Commands ❌
docker-compose down -v       # DELETES ALL DATA
docker volume rm ...         # DELETES VOLUME
docker volume prune          # DELETES UNUSED VOLUMES

# Backup Commands 🛡️
./setup-automated-backups.sh # Set up auto backups
./test-data-persistence.sh   # Test data persists
```

---

**Remember:** Your data is safe as long as you:
- ✅ Keep the volume (don't use `-v` flag)
- ✅ Run regular backups
- ✅ Test persistence occasionally

**Current Status:** 24+ million records safely stored in persistent volume ✅
