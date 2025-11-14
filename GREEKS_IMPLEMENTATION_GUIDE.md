# Greeks and IV Implementation Guide

## Overview

This system now properly captures Greeks (Delta, Gamma, Theta, Vega, Rho) and Implied Volatility from Alpaca's API and saves them to the PostgreSQL database.

## Changes Made

### 1. OptionsDataChannel.js
**File:** `/docker/data-bus-manager/OptionsDataChannel.js`

#### New Methods Added:

**`getOptionSnapshots(symbols)`**
- Fetches real-time snapshots from Alpaca's `/v2/options/snapshots` API
- Returns: Latest trade, latest quote, Greeks, and Implied Volatility
- Automatically batches requests (50 symbols per batch)
- Publishes data to event bus: `options.{symbol}.snapshot`

**`startGreeksPolling(symbols, intervalMs = 60000)`**
- Starts periodic polling for Greeks data
- Default: Updates every 60 seconds (1 minute)
- Use this to continuously monitor Greeks for active positions

**`stopGreeksPolling()`**
- Stops the polling interval
- Called automatically on shutdown

### 2. SQLCacheLayer.js
**File:** `/docker/data-bus-manager/SQLCacheLayer.js`

#### New Database Table:

```sql
CREATE TABLE bus_option_greeks (
  symbol VARCHAR(50) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  delta DECIMAL(10,6),
  gamma DECIMAL(10,6),
  theta DECIMAL(10,6),
  vega DECIMAL(10,6),
  rho DECIMAL(10,6),
  implied_volatility DECIMAL(10,6),
  last_price DECIMAL(12,4),
  bid DECIMAL(12,4),
  ask DECIMAL(12,4),
  data_source VARCHAR(50) DEFAULT 'alpaca_snapshots',
  metadata JSONB,
  PRIMARY KEY (symbol, timestamp)
);
```

#### New Method Added:

**`handleSnapshotUpdate(channel, data)`**
- Extracts Greeks and IV from snapshot data
- Buffers data for batch insertion
- Automatically flushes to database every 5 seconds or 100 records

### 3. DataBusManager.js
**File:** `/docker/data-bus-manager/DataBusManager.js`

#### New Methods Added:

**`getOptionSnapshots(symbols)`**
- Delegates to OptionsDataChannel
- Fetches Greeks data on-demand

**`startGreeksPolling(symbols, intervalMs)`**
- Starts periodic Greeks updates
- Use for active position monitoring

**`stopGreeksPolling()`**
- Stops Greeks polling

#### Event Routing:
- Snapshot events (`options.*.snapshot`) → `handleSnapshotUpdate()`
- Regular option data → `handleOptionsUpdate()`

---

## Usage Examples

### 1. Fetch Greeks for Specific Contracts (One-Time)

```javascript
const DataBusManager = require('./DataBusManager');

const busManager = new DataBusManager({
  alpacaApiKey: process.env.ALPACA_API_KEY,
  alpacaApiSecret: process.env.ALPACA_API_SECRET,
  databaseUrl: process.env.DATABASE_URL
});

await busManager.initialize();

// Fetch Greeks for specific option symbols
const symbols = [
  'SPY251231C00500000',
  'IWM251231C00210000'
];

const snapshots = await busManager.getOptionSnapshots(symbols);

console.log(snapshots);
// Output:
// {
//   'SPY251231C00500000': {
//     symbol: 'SPY251231C00500000',
//     timestamp: '2025-11-10T18:30:00.000Z',
//     greeks: {
//       delta: 0.5234,
//       gamma: 0.0012,
//       theta: -0.0345,
//       vega: 0.1234,
//       rho: 0.0567
//     },
//     impliedVolatility: 0.2345,
//     latestQuote: { bid: 5.20, ask: 5.25 }
//   }
// }
```

### 2. Start Continuous Greeks Monitoring

```javascript
// Start polling Greeks every minute for active positions
const activeContracts = [
  'SPY251231C00500000',
  'IWM251231C00210000'
];

// Poll every 60 seconds (1 minute)
busManager.startGreeksPolling(activeContracts, 60000);

// Greeks will be automatically:
// 1. Fetched from Alpaca every minute
// 2. Published to event bus
// 3. Saved to database

// Stop polling when positions are closed
busManager.stopGreeksPolling();
```

### 3. Subscribe to Real-Time Greeks Updates

```javascript
// Listen for snapshot events
busManager.subscribe('options.*.snapshot', (channel, data) => {
  console.log(`Greeks update for ${data.symbol}:`);
  console.log(`  Delta: ${data.greeks.delta}`);
  console.log(`  IV: ${data.impliedVolatility}`);
});

// Now start polling
busManager.startGreeksPolling(activeContracts, 60000);
```

### 4. Query Historical Greeks from Database

```javascript
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Get Greeks history for a specific contract
const result = await pool.query(`
  SELECT
    timestamp,
    delta,
    gamma,
    theta,
    vega,
    implied_volatility,
    last_price
  FROM bus_option_greeks
  WHERE symbol = $1
    AND timestamp >= $2
    AND timestamp <= $3
  ORDER BY timestamp ASC
`, [
  'SPY251231C00500000',
  '2025-11-10T00:00:00Z',
  '2025-11-10T23:59:59Z'
]);

console.log('Greeks history:', result.rows);
```

### 5. Integration with Trading Strategy

```javascript
class MyTradingStrategy {
  constructor(busManager) {
    this.bus = busManager;
    this.activePositions = new Map();
  }

  async onPositionOpened(contractSymbol) {
    // Start monitoring Greeks for this position
    this.activePositions.set(contractSymbol, Date.now());

    // Fetch initial Greeks
    const snapshots = await this.bus.getOptionSnapshots([contractSymbol]);
    const greeks = snapshots[contractSymbol]?.greeks;

    console.log(`Position opened: ${contractSymbol}`);
    console.log(`Initial Delta: ${greeks.delta}`);

    // Start polling if not already running
    const allSymbols = Array.from(this.activePositions.keys());
    this.bus.startGreeksPolling(allSymbols, 60000);
  }

  onPositionClosed(contractSymbol) {
    this.activePositions.delete(contractSymbol);

    // Update polling with remaining positions
    const allSymbols = Array.from(this.activePositions.keys());
    if (allSymbols.length > 0) {
      this.bus.startGreeksPolling(allSymbols, 60000);
    } else {
      // No more active positions, stop polling
      this.bus.stopGreeksPolling();
    }
  }
}
```

---

## Data Pipeline Flow

```
Alpaca API (/v2/options/snapshots)
    ↓
OptionsDataChannel.getOptionSnapshots()
    ↓
Publishes to: options.{symbol}.snapshot
    ↓
DataBusManager event handler
    ↓
SQLCacheLayer.handleSnapshotUpdate()
    ↓
Write buffer (batched)
    ↓
PostgreSQL (bus_option_greeks table)
```

---

## Database Schema Details

### bus_option_greeks Table

| Column | Type | Description |
|--------|------|-------------|
| symbol | VARCHAR(50) | Option contract symbol (e.g., SPY251231C00500000) |
| timestamp | TIMESTAMPTZ | When Greeks were captured |
| delta | DECIMAL(10,6) | Delta (∂V/∂S) - Price sensitivity to underlying |
| gamma | DECIMAL(10,6) | Gamma (∂²V/∂S²) - Delta sensitivity |
| theta | DECIMAL(10,6) | Theta (∂V/∂t) - Time decay (daily) |
| vega | DECIMAL(10,6) | Vega (∂V/∂σ) - IV sensitivity |
| rho | DECIMAL(10,6) | Rho (∂V/∂r) - Interest rate sensitivity |
| implied_volatility | DECIMAL(10,6) | Implied Volatility (annualized) |
| last_price | DECIMAL(12,4) | Last trade price |
| bid | DECIMAL(12,4) | Current bid price |
| ask | DECIMAL(12,4) | Current ask price |
| data_source | VARCHAR(50) | Always 'alpaca_snapshots' |
| metadata | JSONB | Full snapshot data (for debugging) |

### Indexes

- `PRIMARY KEY (symbol, timestamp)` - Prevents duplicates
- `idx_bus_greeks_symbol_time` - Fast queries by symbol and time
- `idx_bus_greeks_delta` - Fast queries by delta value

---

## Rate Limits and Best Practices

### Alpaca API Limits
- **Snapshots endpoint**: 200 requests per minute
- **Max symbols per request**: 50 symbols
- **Recommended polling interval**: 60 seconds (1 minute)

### Best Practices

1. **Don't over-poll**: Greeks don't change every second
   - Use 60-second intervals for active trading
   - Use 5-minute intervals for passive monitoring

2. **Batch requests**: Always fetch multiple symbols together
   ```javascript
   // Good: Batch request
   await busManager.getOptionSnapshots(['SPY...', 'IWM...', 'QQQ...']);

   // Bad: Individual requests
   await busManager.getOptionSnapshots(['SPY...']);
   await busManager.getOptionSnapshots(['IWM...']);
   await busManager.getOptionSnapshots(['QQQ...']);
   ```

3. **Stop polling when idle**: Always call `stopGreeksPolling()` when done
   ```javascript
   // Good
   busManager.stopGreeksPolling();

   // Bad: Leaves polling running forever
   ```

4. **Monitor database growth**: Greeks table can grow quickly
   - Consider archiving old data
   - Consider partitioning by date
   - Example: Keep last 30 days in main table

---

## Comparison: Alpaca Greeks vs Black-Scholes Greeks

| Source | When to Use | Pros | Cons |
|--------|-------------|------|------|
| **Alpaca Greeks** | Live trading, real-time decisions | Real market Greeks from Alpaca's models | API call required, rate limits |
| **Black-Scholes Greeks** | Backtesting, historical analysis | No API calls, instant calculation | Theoretical model, may differ from market |

### Both Are Available!

- **Live Trading**: Use Alpaca Greeks (this implementation)
- **Backtesting**: Use Black-Scholes calculator (already implemented)

---

## Troubleshooting

### Greeks Not Appearing

1. **Check API credentials**:
   ```bash
   echo $ALPACA_API_KEY
   echo $ALPACA_API_SECRET
   ```

2. **Check database connection**:
   ```javascript
   const stats = await busManager.getStats();
   console.log(stats.sqlCache);
   ```

3. **Check contract symbols are valid**:
   - Must be active contracts
   - Must have valid format: `SYMBOL[YY][MM][DD][C/P][PRICE]`

4. **Check logs for errors**:
   ```bash
   docker logs data-bus-manager | grep Greeks
   ```

### Greeks Are Null

- 0DTE options near expiry may not have Greeks from Alpaca
- Very deep ITM/OTM options may not have Greeks
- Illiquid contracts may not have Greeks
- Check `data_source` field to verify it's from Alpaca

### Database Insert Errors

- Check table exists: `\d bus_option_greeks` in psql
- Check data types match schema
- Check for NaN or Infinity values in Greeks

---

## Testing

See `test-greeks-capture.js` for a complete test script.

```bash
# Run Greeks test
node docker/data-bus-manager/test-greeks-capture.js
```

---

Generated: 2025-11-10
