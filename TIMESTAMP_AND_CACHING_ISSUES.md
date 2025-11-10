# Timestamp & Caching Issues - Root Cause Analysis

**Date:** 2025-10-26
**Status:** 🔴 CRITICAL ISSUES FOUND

---

## Summary

**Problem:** Multi-day backtests only execute 1 trade instead of 12+ signals
- **Signals Generated:** 12 per day ✅
- **Signals Executed:** 1 per day ❌
- **Success Rate:** 8% (1/12)

---

## Root Cause #1: Memory Cache Pollution

### What's Happening:

1. **First Signal (14:24:00Z)** - API Fallback Success ✅
   ```
   📡 Falling back to API to fetch option data...
   ✅ [ALPACA] Generated 6 option symbols
   ✅ OPENED: SPY241001C00560000 x1 @ $8.75
   ```

2. **Second Signal (14:51:00Z)** - Fails with Cached Data ❌
   ```
   ✅ [SQL CACHE] Built option chain with 19 contracts
   🎯 Filtered option chain from 19 to 0 contracts
   ⚠️  No contracts found within $3-5 strike range
   ```

### The Issue:

When `buildOptionChainFromCache()` runs API fallback for the 1st signal:
- Fetches option data for **ENTIRE trading day** (9:30-16:00)
- Caches result in **memory** with some cache key
- **19 contracts** get cached in memory

When 2nd signal executes at different timestamp:
- Hits **MEMORY CACHE** with 19 contracts
- These contracts have **mismatched timestamps** or **wrong strike ranges**
- Filters to **0 contracts**
- Signal execution fails

### Database Evidence:

```sql
SELECT DISTINCT strike_price FROM option_contracts
WHERE expiry_date = '2024-10-01';

-- Result: Only $560.00 strike (1 row)
-- But logs show: "19 contracts" ← from MEMORY CACHE!
```

---

## Root Cause #2: Strike Range Mismatch in Cached Data

### Old Cache Data Structure:

The database still has remnants from `strikeRange=10` runs:
- Strikes: `$560, $561, $566, $571, $576`
- Spacing: **Irregular** ($1, then $5)
- Range: **±$16** from ATM

### Filter Expectations:

With `strikeRange=1`, filter expects:
- Strikes: `ATM-$5, ATM, ATM+$5`
- Spacing: **$5 regular intervals**
- Range: **±$5** from ATM

### Example Failure:

```
SPY at $561.13:
  ATM = $560
  Expected: $555, $560, $565
  Cached:   $560, $561, $566, $571, $576

  $560 ✅ Passes filter
  $561 ❌ Rejected (not on $5 boundary: $560 + (1 × $5) = $565, not $561)
  $566 ❌ Rejected (too far: $566 > $565 max)

  Result: Only $560 passes, but needs 3 strikes → FILTERED TO 0
```

---

## Root Cause #3: Cache Key Collision or Reuse

### Hypothesis:

The memory cache key in `buildOptionChainFromCache()` might be:
- Too broad (e.g., keyed by date only, not timestamp)
- Being reused across different timestamps
- Not properly invalidated after API fallback

### Code Location:

`/docker/backtesting-server/utils/data-cache-manager.js:237`

```javascript
const cacheKey = `chain_${symbol}_${expiryDate}_${utcTimestamp}`;

if (this.memoryCache.has(cacheKey)) {
  console.log(`📦 [CACHE] Using cached option chain...`);
  return this.memoryCache.get(cacheKey);
}
```

### Issue:

After API fallback at 14:24:00Z fetches data for entire day, where does it cache?
- Does it cache under the `14:24:00Z` key only?
- Or does it cache for multiple timestamps?
- Why do subsequent timestamps see "19 contracts"?

---

## Root Cause #4: Position Limit (1 Position at a Time)

Looking at the backtest logic:

```javascript
// Possible position limit check?
if (this.openPositions.length > 0) {
  console.log(`⚠️ Already have open position, skipping signal`);
  return false;
}
```

### Evidence:

- 1st signal opens position successfully
- Position stays open until end of day
- 11 subsequent signals fail to execute
- Position closes at `BACKTEST_END`

This suggests the system might only allow **1 open position at a time**.

---

## Investigation Needed

### 1. Check Position Limit Logic

Search for:
```javascript
if (this.openPositions.length > 0)
if (this.openPositions.length >= maxPositions)
```

**File:** `backtest-engine.js` in `executeSignal()` method

### 2. Trace Memory Cache Flow

For signal #2 at 14:51:00Z:
- What cache key does it query?
- Why does it find "19 contracts"?
- Where did these 19 contracts come from?

**Files:**
- `/docker/backtesting-server/utils/data-cache-manager.js`
- `/docker/backtesting-server/engine/backtest-engine.js`

### 3. Verify API Fallback Caching

When API fallback fetches full day data:
- How many timestamps does it cache?
- What cache keys does it use?
- Should it cache per-timestamp or per-day?

---

## Proposed Solutions

### Solution #1: Clear Memory Cache Between Signals

Add cache invalidation or use timestamp-specific keys:

```javascript
// After each signal execution, clear relevant cache
this.dataCacheManager.clearCache();

// OR use more specific cache keys
const cacheKey = `chain_${symbol}_${expiryDate}_${timestamp}_${strikeRange}`;
```

### Solution #2: Fix Strike Range in Old Cache

Delete ALL cached option data and rebuild with correct `strikeRange=1`:

```sql
DELETE FROM option_contract_bars;
DELETE FROM option_contracts WHERE execution_mode = 'pre-cache';
```

Then run `populate-sql-cache.js` with correct settings.

### Solution #3: Allow Multiple Concurrent Positions

If position limit is the issue, update backtest config:

```javascript
maxConcurrentPositions: 5  // Allow up to 5 positions
```

Or remove position limit for signals if strategy allows.

### Solution #4: Per-Timestamp API Fallback

Instead of fetching entire day on first miss, fetch only for specific timestamp:

```javascript
// BEFORE: Fetch 9:30-16:00 (entire day)
const startOfDay = `${expiryDate}T09:30:00-04:00`;
const endOfDay = `${expiryDate}T16:00:00-04:00`;

// AFTER: Fetch ±5min window around timestamp
const startWindow = moment(timestamp).subtract(5, 'minutes').format();
const endWindow = moment(timestamp).add(5, 'minutes').format();
```

---

## Next Steps

1. **Investigate position limit** - Check if backtest allows only 1 position at a time
2. **Trace cache key usage** - Understand why signal #2 sees "19 contracts" from cache
3. **Clear all cached data** - Delete old strike range data from database
4. **Test with cache disabled** - Run backtest with `useSQL: false` to force all API calls
5. **Add detailed logging** - Log cache keys and hits/misses for debugging

---

## Test Command

```bash
# Run backtest with detailed logging
curl -X POST http://localhost:3002/api/backtest/run \
  -H "Content-Type: application/json" \
  -d '{
    "strategy": "havwap-proper",
    "symbol": "SPY",
    "startDate": "2024-10-01",
    "endDate": "2024-10-01",
    "initialCapital": 10000,
    "debug": true
  }'

# Monitor for:
# - "Already have open position" messages
# - Cache key values
# - Number of contracts at each signal
```

---

## Summary of Findings

| Issue | Impact | Severity |
|-------|--------|----------|
| Memory cache pollution with 19 contracts | 11/12 signals fail | 🔴 CRITICAL |
| Old strike range data ($561 with $1 spacing) | Filter rejects valid strikes | 🔴 CRITICAL |
| Possible position limit (1 at a time) | Can't open multiple positions | 🟡 HIGH |
| Timestamp mismatch in cached data | Wrong bars selected | 🟡 HIGH |

**Current State:** System technically works but only opens 1 position per day instead of following all 12 signals.

**Target State:** Execute all 12 signals successfully with proper strike selection and Greeks calculation.

---

**Created:** 2025-10-26
**Author:** Claude Code Analysis
**Priority:** CRITICAL - Blocks multi-signal trading
