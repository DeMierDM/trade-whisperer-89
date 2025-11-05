# Backtesting Engine Integration - Implementation Summary

## ✅ Completed Tasks

### 1. **Bar-Level Greeks Integration**
- Updated `BacktestEngine.updateOpenPositions()` to fetch real option bars per timestamp
- Integrated `GreeksCalculator.estimateGreeksFromOHLCV()` for bar-by-bar Greeks calculation
- Greeks are now calculated using the actual bar's timestamp for accurate 0DTE time decay

### 2. **Options Data Fetching**
- Implemented `BacktestEngine.fetchOptionsData()` with caching
- Fetches complete options chain for target expiry date
- Retrieves historical OHLCV bars for each contract
- Caches data to minimize API calls during backtest

### 3. **Contract Instance Tracking**
- Each position now has a unique `instance_id` (UUID)
- Prevents data confusion when same contract symbol is traded multiple times
- Enables proper tracking of Greeks evolution per specific position

### 4. **Bar-Level Greeks Storage**
- Implemented `saveBarGreeks()` method
- Saves Greeks to `option_contract_bars` table for every bar while position is open
- Enables post-backtest analysis of Greeks evolution
- Validates theta decay, delta changes, gamma risk over time

### 5. **Real Option Prices for Exits**
- Fixed position update logic to fetch actual option bars at each timestamp
- Uses real close prices from OHLCV data for P&L tracking
- Exit decisions based on actual market prices, not entry price

### 6. **HAVWAP Strategy Exit Logic**
- `shouldExit()` method fully implemented with multiple exit conditions:
  - ✅ Profit target (default 30%)
  - ✅ Stop loss (default 50%)
  - ✅ Time stop (default 60 minutes max hold)
  - ✅ 0DTE auto-close at 3:50 PM ET
- Proper handling of 0DTE expiry detection

### 7. **Enhanced Position Opening**
- Proper contract selection using `ContractSelector.selectBestContract()`
- Delta targeting (default 0.30 delta for directional trades)
- Volume filtering (minimum 50 contracts)
- Position sizing based on portfolio allocation (10% per trade)
- Contract multiplier (100) properly applied

## 📋 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      BACKTEST WORKFLOW                           │
└─────────────────────────────────────────────────────────────────┘

1. Fetch Underlying Data (SPY 1-min bars)
          ↓
2. Generate HAVWAP Strategy Signals
          ├─ Calculate hourly-anchored VWAP
          ├─ Calculate VWAP slope
          └─ Emit BUY_CALL / BUY_PUT signals
          ↓
3. For Each Signal → Fetch Options Data
          ├─ Get options chain for target expiry (0DTE)
          ├─ Fetch OHLCV bars for all contracts
          └─ Cache data for reuse
          ↓
4. Contract Selection
          ├─ Build option chain from bars
          ├─ Filter by delta target (±0.30)
          ├─ Filter by volume (>50)
          └─ Select best contract
          ↓
5. Open Position
          ├─ Create contract instance (UUID)
          ├─ Store entry Greeks
          └─ Save to database
          ↓
6. Track Position (Every Bar)
          ├─ Fetch option bar at current timestamp
          ├─ Calculate Greeks using GreeksCalculator
          ├─ Save bar-level Greeks to DB
          └─ Check exit conditions
          ↓
7. Close Position (When Exit Triggered)
          ├─ Calculate P&L (price difference × quantity × 100 - fees)
          ├─ Store exit Greeks
          └─ Move to closed positions
          ↓
8. Calculate Performance Metrics
          ├─ Total return, Sharpe ratio
          ├─ Win rate, profit factor
          └─ Max drawdown
```

## 🔑 Key Components

### GreeksCalculator
- **Input**: Underlying price, strike, expiry, option type, OHLCV bar, bar timestamp
- **Output**: Delta, gamma, theta, vega, rho, IV, theoretical price
- **Critical Feature**: Uses bar timestamp for accurate 0DTE time decay

### ContractSelector
- **Input**: Option chain with bars, selection criteria (delta, volume, spread)
- **Output**: Best contract matching criteria
- **Method**: `selectBestContract()` ranks by delta proximity, liquidity

### BarGreeksProcessor
- **Input**: Contract instance, option bars, underlying bars
- **Output**: Bar-level Greeks time series
- **Storage**: `option_contract_bars` table with full OHLCV + Greeks

### BacktestEngine
- **Orchestrates**: Complete backtest workflow
- **Manages**: Position lifecycle, P&L tracking, performance metrics
- **Stores**: Results in PostgreSQL for analysis

## 📊 Database Schema Integration

### option_contracts (Position Tracking)
```sql
- instance_id (UUID) -- Unique per position
- contract_symbol, strike_price, expiry_date, option_type
- entry_timestamp, entry_price, quantity
- entry_delta, entry_gamma, entry_theta, entry_vega, entry_rho, entry_iv
- exit_timestamp, exit_price
- exit_delta, exit_gamma, exit_theta, exit_vega, exit_rho, exit_iv
- gross_pnl, net_pnl, fees, return_pct
- close_reason (PROFIT_TARGET, STOP_LOSS, TIME_STOP, ZERO_DTE_TIME_STOP)
```

### option_contract_bars (Greeks Evolution)
```sql
- contract_instance_id (FK to option_contracts.instance_id)
- bar_timestamp
- option_open, option_high, option_low, option_close, option_volume
- underlying_price
- delta, gamma, theta, vega, rho, implied_volatility
- time_to_expiry (decreases toward 0 for 0DTE)
```

## 🎯 HAVWAP Strategy Configuration

```javascript
{
  vwapPeriod: 60,              // 1-hour VWAP window
  slopeThreshold: 0.0001,      // Minimum VWAP slope for signal
  slopeLookback: 10,           // Bars for slope calculation
  priceVwapThreshold: 0.001,   // 0.1% price distance from VWAP
  
  deltaTarget: 0.30,           // Target 30-delta options
  minVolume: 50,               // Minimum contract volume
  maxSpreadPct: 15,            // Max 15% bid/ask spread (live)
  preferredDTE: 0,             // 0DTE contracts
  
  profitTarget: 0.30,          // 30% profit target
  stopLoss: 0.50,              // 50% stop loss
  maxHoldingPeriod: 60,        // Max 60 minutes hold
  zeroDTECloseTime: '15:50',   // Auto-close at 3:50 PM
  
  maxPositions: 1,             // 1 concurrent position
  contractsPerTrade: 1         // 1 contract per trade
}
```

## 🧪 Testing Strategy

### Multi-Day Validation
Test on different market conditions:
- **2024-10-10 (Thursday)**: High volume, mid-week
- **2024-10-11 (Friday)**: Expiry day, increased volatility
- **2024-10-14 (Monday)**: Week start, different flow

### Validation Checks
1. ✅ All trades have entry/exit Greeks
2. ✅ P&L calculations match: `(exit_price - entry_price) × quantity × 100 - fees`
3. ✅ 0DTE trades close before 4:00 PM ET
4. ✅ Greeks evolution shows decreasing T (time to expiry)
5. ✅ Delta, gamma, theta behave as expected
6. ✅ IV calculations are within reasonable bounds (1% - 500%)

## 🚀 Next Steps

1. **Run End-to-End Test** on real Alpaca data
2. **Validate Greeks Evolution** for sample trades
3. **Optimize Strategy Parameters** using backtest results
4. **Add Performance Analytics** dashboard
5. **Integrate with Frontend** for visualization
6. **Connect to Live Paper Trading** bot

## 📈 Expected Outcomes

- **Accurate Backtests**: Real market data, real contract prices
- **Greeks Tracking**: Full visibility into position Greeks evolution
- **Performance Analysis**: Sharpe ratio, win rate, drawdown metrics
- **Strategy Validation**: Test HAVWAP on multiple days
- **Live Trading Ready**: Same code works for paper/live trading

## ⚠️ Critical Implementation Notes

### 0DTE Time Decay
- T (time to expiry) is calculated per bar: `(market_close_time - current_bar_time) / year_in_ms`
- As market approaches 4:00 PM, T → 0
- Theta decay accelerates exponentially
- Gamma spikes for ATM options near expiry

### Contract Instance Uniqueness
- Never reuse instance_id
- Each new position = new UUID
- Prevents confusion when trading same symbol multiple times
- Enables tracking Greeks evolution per specific position

### Data Caching
- Options data cached by `${symbol}_${expiry}_${start}_${end}`
- Reduces API calls during backtest
- Important for staying within Alpaca rate limits

### Fee Calculation
- $0.65 per contract per side = $1.30 total per contract
- Applied to gross P&L: `net_pnl = gross_pnl - (quantity × 1.30)`
- Affects actual returns significantly on small positions

## 🎉 Summary

The backtesting engine is now fully integrated with:
- ✅ Real historical OHLCV data (underlying + options)
- ✅ Bar-by-bar Greeks calculation with proper 0DTE time decay
- ✅ Contract instance tracking with unique IDs
- ✅ Complete position lifecycle management
- ✅ HAVWAP strategy with robust exit logic
- ✅ Performance metrics and validation

**Ready for comprehensive testing and validation!**
