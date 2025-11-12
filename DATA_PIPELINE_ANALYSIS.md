# Data Pipeline Analysis - Alpaca WebSocket to SQL Database

## Executive Summary

Analyzed the data pipeline from Alpaca WebSocket streams to PostgreSQL database. The system has proper database schemas for all data types, but there are gaps in what's being captured from Alpaca's API, particularly around Greeks data.

## 1. Stock Data (OHLCV) - ✅ COMPLETE

### Currently Captured from WebSocket:
**Trade Data:**
- symbol
- price
- size/volume
- timestamp
- exchange
- conditions

**Quote Data:**
- symbol
- bid/ask prices
- bid_size/ask_size
- timestamp

### Database Storage:
**Table:** `bus_stock_data`
- All OHLCV fields properly stored
- Includes metadata JSONB field for additional data
- Proper indexes on symbol+timestamp

**Status:** ✅ **FULLY IMPLEMENTED** - Stock OHLCV data is being captured and stored correctly.

---

## 2. Options Contract Data - ⚠️ PARTIALLY COMPLETE

### Currently Captured from Alpaca:

#### From REST API (Contracts Endpoint):
- contract_symbol (e.g., SPY251031C00450000)
- underlying_symbol
- strike_price
- expiration_date
- option_type (CALL/PUT)
- status

#### From WebSocket/Latest Quotes:
- bid (bp)
- ask (ap)
- bid_size (bs)
- ask_size (as)
- last_price (p)
- timestamp (t)

#### From Historical Bars API:
- OHLCV bars (open, high, low, close, volume)
- Timestamp

### Database Storage:
**Table:** `bus_option_data`
- symbol
- timestamp
- bid/ask
- bid_size/ask_size
- data_source
- metadata (JSONB)

**Additional Tables:**
- `option_contracts` - Full position tracking with Greeks fields
- `contract_greeks_history` - Time series of Greeks during position
- `option_contract_bars` - Bar-level OHLCV + Greeks

### What's MISSING:

#### ❌ Greeks NOT Being Captured from Alpaca API

**Available from Alpaca (but not currently captured):**
- Delta - Rate of change of option price vs underlying price
- Gamma - Rate of change of delta
- Theta - Time decay rate
- Vega - Sensitivity to volatility changes
- Rho - Sensitivity to interest rate changes
- Implied Volatility (IV)

**Why Greeks Are Missing:**
1. Alpaca's WebSocket stream (v1beta1) only provides trade/quote data, NOT Greeks
2. Greeks come from Alpaca's REST API endpoints:
   - `/v2/options/snapshots` - Latest trade, quote, IV, and Greeks
   - `/v2/options/chain` - Full chain with Greeks for all strikes

3. Your current `OptionsDataChannel.js` only calls:
   - `/v2/options/contracts` - Gets contract metadata (no Greeks)
   - `/v1beta1/options/quotes/latest` - Gets bid/ask (no Greeks)
   - `/v1beta1/options/bars` - Gets OHLCV (no Greeks)

**Solution Implemented for Backtesting:**
- Greeks are calculated LOCALLY using Black-Scholes formula
- `GreeksCalculator.js` computes all Greeks from OHLCV bars
- Works well for backtesting mode

**Problem for Live Trading:**
- No Greeks being captured from Alpaca in real-time
- Would need to add calls to snapshots API to get Alpaca's calculated Greeks
- Current implementation relies on local Black-Scholes calculations only

---

## 3. What Alpaca Provides vs What's Being Saved

### Stock Data
| Field | Alpaca Provides | Currently Saved | Status |
|-------|----------------|-----------------|--------|
| Price | ✅ | ✅ | ✅ |
| Volume | ✅ | ✅ | ✅ |
| Bid | ✅ | ✅ | ✅ |
| Ask | ✅ | ✅ | ✅ |
| Timestamp | ✅ | ✅ | ✅ |
| Exchange | ✅ | ✅ (in metadata) | ✅ |
| Conditions | ✅ | ✅ (in metadata) | ✅ |

### Options Data
| Field | Alpaca Provides | Currently Saved | Status |
|-------|----------------|-----------------|--------|
| **Price Data** |
| Bid | ✅ | ✅ | ✅ |
| Ask | ✅ | ✅ | ✅ |
| Last Price | ✅ | ✅ | ✅ |
| OHLCV Bars | ✅ | ✅ (backtesting) | ✅ |
| **Contract Info** |
| Symbol | ✅ | ✅ | ✅ |
| Strike | ✅ | ✅ | ✅ |
| Expiry | ✅ | ✅ | ✅ |
| Type (C/P) | ✅ | ✅ | ✅ |
| **Greeks** |
| Delta | ✅ (snapshots API) | ❌ (not captured) | ⚠️ |
| Gamma | ✅ (snapshots API) | ❌ (not captured) | ⚠️ |
| Theta | ✅ (snapshots API) | ❌ (not captured) | ⚠️ |
| Vega | ✅ (snapshots API) | ❌ (not captured) | ⚠️ |
| Rho | ✅ (snapshots API) | ❌ (not captured) | ⚠️ |
| IV | ✅ (snapshots API) | ❌ (not captured) | ⚠️ |

---

## 4. Recommendations

### For Live Trading:
**Add Greeks Capture from Alpaca API**

Modify `OptionsDataChannel.js` to periodically call:
```javascript
GET /v2/options/snapshots?symbols={contract_symbols}
```

This will return:
- Latest trade
- Latest quote
- **Greeks (delta, gamma, theta, vega, rho)**
- **Implied Volatility**

**Frequency:** Every 1-5 minutes during market hours for active contracts

### For Backtesting:
**Current Implementation is Good**
- Using Black-Scholes for Greeks calculation works well
- OHLCV bars provide all needed data
- No need to fetch Greeks from Alpaca for historical data

### Database Schema:
**Already Prepared** ✅
- All Greek fields exist in database
- `option_contracts` table has entry/exit Greeks
- `contract_greeks_history` table for time series
- `option_contract_bars` table for bar-level Greeks

No schema changes needed - just need to populate the fields!

---

## 5. File Locations

### Data Pipeline Files:
- `/docker/data-bus-manager/StockDataChannel.js` - Stock websocket handler
- `/docker/data-bus-manager/OptionsDataChannel.js` - Options REST API handler
- `/docker/data-bus-manager/SQLCacheLayer.js` - Database write layer
- `/docker/init.sql` - Database schema

### Greeks Calculation:
- `/docker/backtesting-server/utils/greeks-calculator.js` - Black-Scholes calculator
- `/docker/backtesting-server/utils/black-scholes.js` - Pricing formulas
- `/docker/backtesting-server/utils/bar-greeks-processor.js` - Bar-level processing

### Backtesting:
- `/docker/backtesting-server/utils/data-cache-manager.js` - Options data cache
- `/docker/backtesting-server/engine/backtest-engine.js` - Main engine
- `/docker/backtesting-server/utils/contract-selector.js` - Contract filtering

---

## 6. Key Findings

### ✅ What's Working Well:
1. Stock OHLCV data fully captured and stored
2. Options contract metadata properly saved
3. Options bid/ask quotes properly saved
4. Historical bars (OHLCV) properly cached for backtesting
5. Database schema complete with all Greek fields
6. Black-Scholes Greeks calculator working for backtesting

### ⚠️ What's Missing:
1. **Greeks not captured from Alpaca's real-time API**
2. **Implied Volatility not captured from Alpaca**
3. No periodic snapshots polling for active contracts

### 📌 Impact:
- **Backtesting:** ✅ No impact - Greeks calculated locally
- **Live Trading:** ⚠️ Missing Alpaca's calculated Greeks and IV
- **Analysis:** ⚠️ Can't compare Alpaca's Greeks vs Black-Scholes

---

## 7. Next Steps

If you want to capture ALL available data from Alpaca:

1. **Add Snapshots API Integration** (30 min)
   - Create periodic polling in `OptionsDataChannel.js`
   - Call `/v2/options/snapshots` for active contracts
   - Store Greeks in database

2. **Add WebSocket Options Stream** (1 hour)
   - Connect to `wss://stream.data.alpaca.markets/v1beta1/indicative`
   - Subscribe to option trades/quotes in real-time
   - More efficient than polling snapshots

3. **Validate Greeks Data** (15 min)
   - Compare Alpaca's Greeks vs Black-Scholes
   - Log discrepancies for analysis
   - Use `greeks-validator.js` utility

---

Generated: 2025-11-10
