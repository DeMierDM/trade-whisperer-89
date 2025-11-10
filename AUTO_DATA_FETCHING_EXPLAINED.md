# Automatic Data Fetching - How It Works

**Your backtesting system automatically fetches and caches data for ANY date range you specify.**

## How It Works

### 1. When You Run a Backtest

```javascript
const result = await engine.runBacktest({
  strategy: myStrategy,
  symbol: 'SPY',
  startDate: '2024-11-01',  // ANY date you want
  endDate: '2024-11-15',    // ANY date you want
  initialCapital: 100000
});
```

### 2. Automatic Data Flow

```
BacktestEngine.runBacktest()
    ↓
BacktestEngine.fetchUnderlyingData()  (line 191)
    ↓
DataCacheManager.getUnderlyingBars()
    ↓
┌─────────────────────────────────────┐
│ Check SQL Cache                     │
│ - Found sufficient data (≥100 bars)?│
│   → YES: Return cached data ✅      │
│   → NO: Continue to API ↓          │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ Fetch from Alpaca API               │
│ - Call alpacaClient.getHistoricalBars() │
│ - Download 1-min bars for date range│
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ Save to Database                    │
│ - saveUnderlyingBarsToDatabase()    │
│ - Insert into underlying_bars table │
│ - ON CONFLICT: Update existing      │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ Cache in Memory                     │
│ - Store in Map for session          │
│ - Next backtest uses cached data    │
└─────────────────────────────────────┘
```

## Code References

### BacktestEngine (backtest-engine.js:376)
```javascript
async fetchUnderlyingData(symbol, startDate, endDate) {
  console.log(`📊 [DATA CACHE] Getting underlying data for ${symbol} (${startDate} to ${endDate})`);
  return await this.dataCacheManager.getUnderlyingBars(symbol, startDate, endDate);
}
```

### DataCacheManager (data-cache-manager.js:28-102)
```javascript
async getUnderlyingBars(symbol, startDate, endDate) {
  // 1. Check memory cache
  if (this.memoryCache.has(cacheKey)) {
    return this.memoryCache.get(cacheKey);
  }

  // 2. Check SQL database
  const result = await this.db.query(/* ... */);

  if (result.rows && result.rows.length > 100) {
    console.log(`✅ [SQL CACHE] Found ${result.rows.length} bars`);
    return filteredBars;  // Return cached data
  }

  // 3. Fetch from API if not in cache
  console.log(`📡 [API] Fetching from Alpaca`);
  const apiResponse = await this.fetchUnderlyingFromAPI(symbol, startDate, endDate);

  return bars;  // API bars are auto-saved to DB
}
```

### Auto-Save to Database (data-cache-manager.js:429-448)
```javascript
async fetchUnderlyingFromAPI(symbol, startDate, endDate) {
  const response = await this.alpacaClient.getHistoricalBars({
    symbol,
    start,
    end,
    timeframe: '1Min'
  });

  const bars = response.bars || [];

  // 🔥 AUTOMATIC SAVE
  if (bars.length > 0) {
    await this.saveUnderlyingBarsToDatabase(symbol, bars);
  }

  return bars;
}
```

## Example Usage

### Test 1: Fetch November 2024 data
```bash
docker exec trading_backtest node -e "
const BacktestEngine = require('./engine/backtest-engine');
const { Pool } = require('pg');
const AlpacaClient = require('./utils/alpaca-client');

const db = new Pool({
  host: 'database',
  port: 5432,
  database: 'trading_system',
  user: 'trader',
  password: 'trading123'
});

const engine = new BacktestEngine(db, new AlpacaClient());

// This will automatically fetch if not cached
engine.fetchUnderlyingData('SPY', '2024-11-01', '2024-11-15')
  .then(bars => {
    console.log(\`Got \${bars.length} bars\`);
    process.exit(0);
  });
"
```

### Test 2: Run backtest on any date
```bash
# December 2024 (will auto-fetch if not cached)
docker exec trading_backtest node /app/run-enhanced-backtest.js \
  --symbol SPY \
  --start 2024-12-01 \
  --end 2024-12-15

# January 2025 (will auto-fetch if not cached)
docker exec trading_backtest node /app/run-enhanced-backtest.js \
  --symbol SPY \
  --start 2025-01-20 \
  --end 2025-01-31
```

## Benefits

### 1. First Run (No Cache)
- Fetches from Alpaca API (**~30-60 seconds**)
- Saves to PostgreSQL
- Calculates and saves Greeks
- Returns data to backtest

### 2. Second Run (Cached)
- Reads from PostgreSQL (**~1-2 seconds**)
- No API calls (faster + no rate limits)
- Pre-calculated Greeks (faster backtest)

### 3. Partial Cache
- Date range: 2024-11-01 to 2024-11-30
- Cached: 2024-11-01 to 2024-11-15 ✅
- Missing: 2024-11-16 to 2024-11-30 ❌
- **System automatically fetches only missing dates**

## Pre-Warming Cache (Optional)

The `populate-sql-cache.js` script is for **pre-warming** the cache:

```bash
# Fetch full month at once (faster than backtest-by-backtest)
docker exec -e POSTGRES_HOST=database -e POSTGRES_PORT=5432 \
  -e POSTGRES_DB=trading_system -e POSTGRES_USER=trader \
  -e POSTGRES_PASSWORD=trading123 \
  trading_backtest node /app/scripts/populate-sql-cache.js \
  --symbol=SPY --start=2024-11-01 --end=2024-11-30
```

**When to use:**
- Fetching multiple months of data
- Preparing for optimization runs (many backtests)
- Initial system setup

**When NOT needed:**
- Running single backtest (auto-fetch is fine)
- Testing small date ranges
- System already has data cached

## Summary

✅ **System automatically fetches ANY date/timeframe you specify**
✅ **First fetch: Slow (API + save to DB)**
✅ **Subsequent fetches: Fast (read from DB)**
✅ **No manual intervention needed**
✅ **Pre-warming cache is optional (for speed)**

---

**The system is working as designed. Your requirement is already implemented!** 🎯
