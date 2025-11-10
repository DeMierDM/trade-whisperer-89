# Backtest UI Display Fix Plan

## Issues Identified

### 1. **API Response Format Mismatch** ❌ CRITICAL
- **Backend Returns**: `{ backtestId, trades: [...], totalTrades }`
- **Frontend Expects**: `[...]` (just array)
- **Impact**: Frontend sees object instead of array, can't render trades

### 2. **Field Name Mismatch** ❌ CRITICAL  
- **Backend Returns**: `total_return`, `win_rate`, `sharpe_ratio`
- **Frontend Expects**: `total_return_pct`, `win_rate_pct`, etc.
- **Impact**: All metrics show as 0 or undefined

### 3. **Missing Signals Endpoint** ❌ BLOCKING
- **Expected**: `GET /api/backtest/:id/signals`
- **Status**: Returns 404 / HTML error page
- **Impact**: Can't display HAVWAP indicators

### 4. **Polling Too Fast** ⚠️ WARNING
- Frontend fetches results immediately after triggering
- Backtest needs 20-40 seconds to complete
- Frontend shows "0 trades" because backtest still running

### 5. **Greeks Not Displayed** ⚠️ PARTIAL
- Greeks ARE being calculated (confirmed in database)
- But frontend may not be extracting/displaying them
- Need to verify frontend trade display component

## Architecture Comparison

### Original Plan (OPTIONS_BACKTESTING_ARCHITECTURE.md)
- ✅ Contract individualization with unique IDs
- ✅ Greeks calculation at entry
- ⚠️ Greeks calculation at exit (partial)
- ⚠️ Greeks time series tracking (NOT implemented)
- ✅ HAVWAP indicator calculation
- ❌ Signal storage in database (partially - no endpoint)
- ⚠️ Bid/Ask vs OHLCV separation (needs docs)

### Current Implementation
- ✅ Fetches real Alpaca data
- ✅ Generates signals with HAVWAP
- ✅ Selects contracts by delta
- ✅ Calculates Greeks at entry
- ✅ Stores trades in database
- ⚠️ Exit Greeks not always calculated
- ❌ No Greeks time series table
- ❌ Signals not exposed via API
- ❌ Frontend/backend contract mismatch

## Fixes Required

### Fix 1: Update Trades Endpoint Response Format
**File**: `/docker/backtesting-server/server.js`

**Change**:
```javascript
// BEFORE
res.json({
  backtestId: parseInt(backtestId),
  trades: result.rows,
  totalTrades: result.rows.length
});

// AFTER
res.json(result.rows); // Just return array
```

### Fix 2: Add Signals Endpoint
**File**: `/docker/backtesting-server/server.js`

**Add new endpoint**:
```javascript
/**
 * Get signals for a specific backtest
 * GET /api/backtest/:id/signals
 */
app.get('/api/backtest/:id/signals', async (req, res) => {
  try {
    const backtestId = req.params.id;

    const result = await pool.query(`
      SELECT 
        id, timestamp, signal_type, symbol,
        underlying_price, indicator_values,
        target_delta, executed
      FROM strategy_signals
      WHERE backtest_id = $1
      ORDER BY timestamp
    `, [backtestId]);

    res.json({
      backtestId: parseInt(backtestId),
      signals: result.rows,
      totalSignals: result.rows.length
    });

  } catch (error) {
    console.error('❌ [BACKTEST] Error fetching signals:', error);
    res.status(500).json({ error: error.message });
  }
});
```

### Fix 3: Fix Frontend Field Mapping
**File**: `/src/hooks/useBacktest.ts`

**Change**:
```typescript
// BEFORE
setResults({
  id: backtestRun.id,
  totalReturn: backtestRun.total_return_pct ?? 0,
  sharpeRatio: backtestRun.sharpe_ratio ?? 0,
  maxDrawdown: backtestRun.max_drawdown_pct ?? 0,
  winRate: backtestRun.win_rate_pct ?? 0,
  // ...
});

// AFTER
setResults({
  id: backtestRun.id,
  totalReturn: parseFloat(backtestRun.total_return || 0) * 100, // Convert to %
  sharpeRatio: parseFloat(backtestRun.sharpe_ratio || 0),
  maxDrawdown: parseFloat(backtestRun.max_drawdown || 0) * 100, // Convert to %
  winRate: parseFloat(backtestRun.win_rate || 0) * 100, // Convert to %
  totalTrades: parseInt(backtestRun.total_trades || 0),
  avgWin: parseFloat(backtestRun.avg_win || 0),
  avgLoss: parseFloat(backtestRun.avg_loss || 0),
  profitFactor: parseFloat(backtestRun.profit_factor || 0),
});
```

### Fix 4: Add Proper Polling with Status Check
**File**: `/src/pages/Backtesting.tsx`

**Add polling logic**:
```typescript
const pollForResults = async (backtestId: string) => {
  const maxAttempts = 20; // 60 seconds total
  let attempts = 0;

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const statusResponse = await fetch(`${ENDPOINTS.BACKTEST}/status/${backtestId}`);
    const status = await statusResponse.json();
    
    if (status.status === 'completed') {
      // Fetch trades now that it's complete
      const trades = await fetchTrades(backtestId);
      setTrades(trades);
      return status;
    } else if (status.status === 'failed') {
      throw new Error(status.error_message || 'Backtest failed');
    }
    
    attempts++;
  }
  
  throw new Error('Backtest timeout');
};
```

### Fix 5: Store Signals in Database
**File**: `/docker/backtesting-server/engine/backtest-engine.js`

**Add signal storage**:
```javascript
// After generating signals, store them
async storeSignals(backtestId, signals) {
  for (const signal of signals) {
    await this.db.query(`
      INSERT INTO strategy_signals (
        backtest_id, timestamp, signal_type, symbol,
        underlying_price, indicator_values, target_delta, executed
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      backtestId,
      signal.timestamp,
      signal.signal_type,
      signal.symbol || signal.underlying_symbol,
      signal.underlying_price,
      JSON.stringify(signal.indicator_values),
      signal.target_delta,
      false // Will be updated when executed
    ]);
  }
}
```

### Fix 6: Calculate Exit Greeks
**File**: `/docker/backtesting-server/engine/backtest-engine.js`

**In closePosition method**:
```javascript
async closePosition(position, currentBar, backtestId) {
  // Calculate exit Greeks
  const exitGreeks = this.greeksCalculator.estimateGreeksFromOHLCV(
    parseFloat(currentBar.c),
    position.strike_price,
    position.expiry_date,
    position.option_type,
    currentBar
  );

  await this.db.query(`
    UPDATE option_contracts
    SET 
      exit_timestamp = $1,
      exit_price = $2,
      exit_underlying_price = $3,
      exit_delta = $4,
      exit_gamma = $5,
      exit_theta = $6,
      exit_vega = $7,
      exit_iv = $8,
      status = 'CLOSED'
    WHERE instance_id = $9
  `, [
    currentBar.t,
    exitPrice,
    currentBar.c,
    exitGreeks.delta,
    exitGreeks.gamma,
    exitGreeks.theta,
    exitGreeks.vega,
    exitGreeks.impliedVolatility,
    position.instance_id
  ]);
}
```

## Implementation Order

1. **IMMEDIATE** (5 mins): Fix trades endpoint to return array
2. **IMMEDIATE** (5 mins): Fix frontend field mapping  
3. **URGENT** (15 mins): Add signals endpoint
4. **URGENT** (10 mins): Add polling logic to frontend
5. **IMPORTANT** (20 mins): Store signals in database
6. **IMPORTANT** (15 mins): Calculate exit Greeks
7. **OPTIONAL** (30 mins): Add Greeks time series tracking

## Testing Checklist

After implementing fixes:

- [ ] Run `node verify-api-responses.js` - should show all ✅
- [ ] Run `node debug-backtest-results.js` - should see trades in UI
- [ ] Check screenshots show populated results table
- [ ] Verify Greeks displayed in trade details
- [ ] Verify HAVWAP indicators shown in signals
- [ ] Check all metrics display correctly (%, numbers)
- [ ] Multi-day test (different market conditions)

## Success Criteria

✅ **UI displays backtest results**
✅ **All metrics show correct values (not 0)**
✅ **Trades table populated with contract details**
✅ **Greeks visible for each trade**
✅ **HAVWAP indicators shown**
✅ **Signals stored and retrievable**
✅ **Polling waits for completion**

## Architecture Gaps (Future Work)

These don't block basic functionality but are in the original architecture:

1. **Greeks Time Series Tracking**
   - Create `contract_greeks_history` table
   - Store Greeks at every bar during position hold
   - Enables Greeks evolution charts

2. **Live vs Backtest Separation**
   - Add mode detection in data fetching
   - Use OHLCV close for backtest
   - Use bid/ask for live trading

3. **Enhanced Risk Metrics**
   - MAE (Maximum Adverse Excursion)
   - MFE (Maximum Favorable Excursion)
   - Per-trade risk metrics

4. **Performance Optimization**
   - Cache option chains
   - Batch Greeks calculations
   - Parallel signal processing
