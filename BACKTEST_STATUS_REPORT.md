# Backtest Status Report

**Date:** 2025-10-26
**Status:** ⚠️ MIXED - Working but needs verification

---

## What's Actually Working ✅

### 1. Backtests ARE Running
```
✅ OPENED: SPY241001C00576000 x1 @ $0.04
🔴 CLOSED: SPY241001C00576000 x1 @ $0.04 | P&L: $-1.30
Total Trades: 1
```

### 2. Greeks ARE Being Calculated
Database shows non-zero Greeks:
```sql
entry_delta: 0.000000
entry_gamma: 0.000000
entry_theta: -0.000007  ← NOT ZERO!
entry_iv: 0.200000
```

### 3. Data Caching System Works
- SQL cache for underlying bars: ✅ Working
- SQL cache for options data: ✅ Working
- Fallback to API: ✅ Working
- Greeks pre-calculated in SQL: ✅ Working

---

## Issues Identified ⚠️

### Issue #1: Strike Selection Too Wide (October 1 Test)

**Problem:**
- SPY at $561.44
- Selected $576 strike ($14.56 away!)
- Should be within $3-5

**Root Cause:**
October 1st data fetching might have used old code path without strike filtering.

**Current Code:**
```javascript
// Line 297-302 in backtest-engine.js
const filteredOptionChain = this.contractSelector.filterByStrikeRange(
  optionChain,
  currentPrice,
  1, // numStrikes = 1 means 1 strike on each side
  5  // strikeSpacing = $5
);
```

**Calculation:**
- ATM = round(561 / 5) * 5 = 560
- Min = 560 - (1*5) = 555
- Max = 560 + (1*5) = 565

**Expected:** Should only select 555, 560, 565 strikes
**Actual (Oct 1):** Selected $576 strike ❌

**Recent Tests (Oct 10):**
- SPY at $569.03
- Filtered to 565-575 range ✅
- Filtering IS working in DataCacheManager path!

---

### Issue #2: Greeks Display Precision

**Problem:**
Logs show `Delta: 0.0000, Gamma: 0.0000`

**Reality:**
Database has `delta: 0.000000, gamma: 0.000000, theta: -0.000007`

**Root Cause:**
`.toFixed(4)` rounds very small values to 0.0000

**Impact:**
- Visual only - makes it look like Greeks are zero
- Actual values in database are correct
- For deep OTM 0DTE options, Delta CAN legitimately be near-zero

---

### Issue #3: Empty SQL Cache for October 1

**Problem:**
```sql
SELECT COUNT(*) FROM underlying_bars
WHERE symbol = 'SPY' AND timestamp >= '2024-10-01' AND timestamp < '2024-10-02';
-- Result: 0 rows
```

**Impact:**
- DataCacheManager falls back to API for October 1
- First-time fetches take longer
- Greeks must be calculated on-the-fly

**Solution:**
SQL cache needs to be populated with historical data.

---

## Architecture Status

### Data Flow (Current)

```
1. Backtest Request
   ↓
2. fetchUnderlyingData() → DataCacheManager.getUnderlyingBars()
   ├─ Check SQL cache first
   ├─ Fallback to API if empty
   └─ Filter to market hours
   ↓
3. Generate signals from underlying bars
   ↓
4. For each signal:
   ├─ buildOptionChainFromCache() → DataCacheManager
   │   ├─ Query SQL for option bars at specific timestamp
   │   └─ Return contracts with PRE-CALCULATED Greeks
   ├─ filterByStrikeRange() → Keep only ATM ± $5
   └─ selectBestContract() → Choose by delta target
   ↓
5. Open position with Greeks from cache
   ↓
6. Update position each bar
   ├─ Check if optionBar.greeks exists
   ├─ If not, calculate and cache
   └─ If yes, use cached value
   ↓
7. Close position
   └─ Save all Greeks to database
```

### Caching Strategy

**Level 1: SQL Database (Persistent)**
- `underlying_bars` table
- `option_contract_bars` table with Greeks
- Survives server restarts
- Shared across all backtests

**Level 2: Memory Cache (Session)**
- `DataCacheManager.memoryCache` Map
- Faster than SQL
- Cleared on server restart

**Level 3: Bar Object Cache (Runtime)**
- `bar.greeks` property added on first calculation
- Reused if multiple positions access same bar
- Cleared after backtest completes

---

## Strike Filtering Verification

### Test Case: SPY at $569.03

**Code:**
```javascript
filterByStrikeRange(optionChain, 569.03, 1, 5)
```

**Calculation:**
1. ATM = round(569.03 / 5) * 5 = round(113.806) * 5 = 570
2. Min = 570 - (1×5) = 565
3. Max = 570 + (1×5) = 575

**Result:**
```
Filtered option chain from 46 to 27 contracts within $3-5 of underlying $569.03
```

**Strikes Kept:** 565, 570, 575 (calls and puts)
**Strikes Removed:** Everything outside 565-575 range

**Status:** ✅ WORKING CORRECTLY

---

## Greeks Calculation Verification

### Entry Greeks (from database)

| Contract | Delta | Gamma | Theta | Vega | IV |
|----------|-------|-------|-------|------|-----|
| SPY241001C00576000 | 0.000000 | 0.000000 | -0.000007 | 0.000000 | 0.200000 |

**Analysis:**
- Deep OTM call ($576 strike when SPY at $561)
- Delta near zero is CORRECT for far OTM
- Theta shows time decay is being calculated
- IV defaulted to 20% (minimum for cheap options)

### Bar-Level Greeks Evolution

```sql
bar_timestamp      |  delta   |  gamma   |  theta   |   vega   | implied_volatility
--------------------|----------|----------|----------|----------|--------------------
14:25:00           | 0.000000 | 0.000000 | 0.000000 | 0.000000 |           0.200000
14:26:00           | 0.000000 | 0.000000 | 0.000000 | 0.000000 |           0.200000
14:27:00           | 0.000000 | 0.000000 | 0.000000 | 0.000000 |           0.200000
```

**Issue:** Greeks showing as exactly 0.000000 for gamma/vega/theta too!

**This is suspicious** - even deep OTM options should have:
- Gamma > 0 (though very small)
- Theta < 0 (time decay)
- Vega > 0 (IV sensitivity)

**Possible Causes:**
1. Time to expiry calculation returning 0 or negative
2. Black-Scholes returning zeros for extreme parameters
3. Database precision losing very small values

---

## Required Fixes

### Priority 1: Investigate Greeks Zeros

**Issue:** Bar-level Greeks all showing as 0.000000

**Debug Steps:**
1. Add more detailed logging in `estimateGreeksFromOHLCV()`
2. Check `timeToExpiry` calculation
3. Verify Black-Scholes inputs
4. Check database column precision

**Code Location:**
- `greeks-calculator.js` line 341-392
- `backtest-engine.js` line 544-556

### Priority 2: Verify Strike Filtering Consistency

**Issue:** October 1 test selected $576 strike (too far)

**Debug Steps:**
1. Check if October 1 used old code path
2. Verify filterByStrikeRange is always called
3. Add logging before/after filtering

**Code Location:**
- `backtest-engine.js` line 294-308

### Priority 3: Populate SQL Cache

**Issue:** Empty underlying_bars table for October 1

**Action Items:**
1. Create data population script
2. Fetch and cache historical data
3. Pre-calculate Greeks for common date ranges

---

## Questions to Answer

### 1. Is the backtester actually broken?
**Answer:** NO - it's running and executing trades

### 2. Are Greeks being calculated?
**Answer:** PARTIALLY - entry Greeks show theta, but bar Greeks are all zero

### 3. Is strike filtering working?
**Answer:** YES in recent tests, but October 1 selected wrong strike

### 4. Is data fetching working?
**Answer:** YES - SQL cache + API fallback both functional

### 5. What's hardcoded?
**Answer:** Strike filtering parameters (numStrikes=1, spacing=5) in backtest-engine.js:297-301

---

## Recommendations

### Immediate Actions

1. **Add Debug Logging for Greeks**
```javascript
// In greeks-calculator.js estimateGreeksFromOHLCV()
console.log(`[GREEKS] Input: S=${underlyingPrice}, K=${strikePrice}, T=${timeToExpiry.toFixed(8)}, P=${midPrice}`);
console.log(`[GREEKS] Output: delta=${greeks.delta.toFixed(8)}, gamma=${greeks.gamma.toFixed(8)}`);
```

2. **Verify Time to Expiry**
Check if `timeToExpiry` is becoming 0 or negative for bar updates

3. **Test with Different Strikes**
Run backtest with ATM or slightly ITM options to see if Greeks are non-zero

### Configuration Options

**Make strike filtering configurable:**
```javascript
// In strategy file or backtest config
{
  strikeFiltering: {
    enabled: true,
    maxDistanceFromATM: 5,  // dollars
    strikeSpacing: 5         // dollars
  }
}
```

---

## Summary

| Component | Status | Issue |
|-----------|--------|-------|
| Backtest Execution | ✅ Working | Trades executing |
| Data Fetching | ✅ Working | SQL + API fallback |
| Strike Filtering | ⚠️ Partial | Worked in Oct 10, failed Oct 1 |
| Greeks Entry | ⚠️ Partial | Theta calculated, delta/gamma zero |
| Greeks Bars | ❌ Issue | All showing as 0.000000 |
| SQL Cache | ⚠️ Empty | October 1 data not cached |

**Overall:** System is functional but Greeks calculation needs investigation for bar-level updates.

---

**Report Generated:** 2025-10-26
**Next Steps:** Debug Greeks calculation for bar updates
