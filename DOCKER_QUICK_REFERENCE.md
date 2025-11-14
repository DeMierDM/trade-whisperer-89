# Docker Architecture - Quick Reference

## Containers at a Glance

| Service | Port | Purpose | Key Files |
|---------|------|---------|-----------|
| **API Server** | 3001 | Market data, WebSocket streams, CSV logging | `/docker/api-server/server.js` |
| **Backtesting Server** | 3002 | Historical data, backtests, signals | `/docker/backtesting-server/server.js` |
| **PostgreSQL** | 5433 | Persistent data storage | `docker-compose.yml` |
| **Redis** | 6379 | Optional session management | `docker-compose.yml` |

---

## Core API Endpoints

### API Server (3001)

```bash
# Check health
curl http://localhost:3001/health

# Get data files
curl http://localhost:3001/api/data-files

# Fetch stock bars
curl -X POST http://localhost:3001/api/fetch-market-data \
  -H "Content-Type: application/json" \
  -d '{
    "dataType": "bars",
    "symbol": "SPY",
    "start": "2024-03-01T09:30:00Z",
    "end": "2024-03-01T16:00:00Z",
    "timeframe": "5Min"
  }'

# Fetch options
curl -X POST http://localhost:3001/api/fetch-market-data \
  -H "Content-Type: application/json" \
  -d '{
    "dataType": "options_bars_by_dte",
    "ticker": "SPY",
    "expiryDate": "241220",
    "start": "2024-03-01T09:30:00Z",
    "end": "2024-03-01T16:00:00Z"
  }'

# Get option quotes
curl -X POST http://localhost:3001/api/get-option-quotes \
  -H "Content-Type: application/json" \
  -d '{
    "symbols": ["SPY251010C00670000", "SPY251010P00670000"]
  }'

# Get recent trades
curl -X POST http://localhost:3001/api/get-recent-trades \
  -H "Content-Type: application/json" \
  -d '{"symbol": "SPY", "minutesBack": 30}'

# Test connection
curl -X POST http://localhost:3001/api/test-connection \
  -H "Content-Type: application/json" \
  -d '{"provider": "alpaca", "getKeys": true}'
```

### Backtesting Server (3002)

```bash
# Check health
curl http://localhost:3002/health

# Fetch current options with auto DTE logic
curl -X POST http://localhost:3002/api/fetch-current-options \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "SPY",
    "strikeRange": 5,
    "strikeSpacing": 5
  }'

# Fetch historical stock bars
curl -X POST http://localhost:3002/api/fetch-historical-data \
  -H "Content-Type: application/json" \
  -d '{
    "dataType": "bars",
    "symbol": "SPY",
    "start": "2024-03-01T09:30:00Z",
    "end": "2024-03-03T16:00:00Z",
    "timeframe": "1min"
  }'

# Fetch multi-day options (0DTE + 1DTE)
curl -X POST http://localhost:3002/api/fetch-historical-data \
  -H "Content-Type: application/json" \
  -d '{
    "dataType": "options_bars_by_date_range",
    "ticker": "SPY",
    "start": "2024-03-01T09:30:00Z",
    "end": "2024-03-05T16:00:00Z"
  }'
```

---

## Data Formats

### OHLCV Bar
```javascript
{
  t: 1234567890,     // Unix timestamp (seconds)
  o: 450.25,         // Open
  h: 451.50,         // High
  l: 449.75,         // Low
  c: 450.50,         // Close
  v: 150000,         // Volume
  vw: 450.40         // VWAP (optional)
}
```

### Stock Quote
```javascript
{
  symbol: "SPY",
  bid: 450.25,
  ask: 450.35,
  bid_size: 2500,
  ask_size: 1800,
  timestamp: 1234567890000,
  data_source: "stock_quote"
}
```

### Options Contract
```javascript
{
  symbol: "SPY241220C00670000",  // TICKER+YYMMDD+C/P+PRICE
  strike: "670.00",
  bid: 2.45,
  ask: 2.55,
  bid_size: 500,
  ask_size: 400,
  timestamp: 1234567890000,
  expiry: "241220"
}
```

### Options Greeks
```javascript
{
  "SPY241220C00670000": {
    impliedVol: 0.23,
    delta: 0.65,
    gamma: 0.004,
    vega: 0.12,
    theta: -0.08,
    rho: 0.15
  }
}
```

---

## WebSocket Usage

### Connect
```javascript
const ws = new WebSocket('ws://localhost:3001');

ws.onopen = () => {
  // Subscribe to symbols
  ws.send(JSON.stringify({
    action: 'subscribe',
    symbols: ['SPY', 'SPY251010C00670000']
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log(message);
};
```

### Message Types

```javascript
// Stock Trade
{
  type: 'stock_trade',
  data: { symbol, price, size, timestamp, exchange, conditions }
}

// Stock Quote
{
  type: 'stock_quote',
  data: { symbol, bid, ask, bid_size, ask_size, timestamp }
}

// Options Quote
{
  type: 'option_quote',
  data: { symbol, bid, ask, bid_size, ask_size, timestamp }
}

// Connected
{
  type: 'connected',
  message: 'Connected to live OPRA data stream'
}
```

---

## CSV Data Files

Located in `/docker/api-server/data/` (mounted to `/app/data/` in container):

### stock_quotes_YYYY-MM-DD.csv
```
timestamp,symbol,bid,ask,bid_size,ask_size,exchange,conditions,data_source
2024-03-01T09:31:00Z,SPY,450.25,450.35,2500,1800,NASDAQ,,stock_quote
```

### stock_trades_YYYY-MM-DD.csv
```
timestamp,symbol,price,size,exchange,conditions,data_source
2024-03-01T09:31:00Z,SPY,450.30,500,NASDAQ,,stock_trade
```

### option_quotes_YYYY-MM-DD.csv
```
timestamp,symbol,bid,ask,bid_size,ask_size,timestamp_alpaca,data_source
2024-03-01T09:31:00Z,SPY251010C00670000,2.45,2.55,500,400,2024-03-01T09:31:00Z,opra_feed
```

---

## Option Symbol Format

**Pattern:** `{TICKER}{YYMMDD}{C|P}{PRICE}`

**Example:** `SPY241220C00670000`
- `SPY` - Underlying ticker
- `24` - Year (2024)
- `12` - Month (December)
- `20` - Day (20th)
- `C` - Call option (P for Put)
- `00670000` - Strike price ($670.00)
  - First 5 digits: dollars (00670)
  - Last 3 digits: cents (000)

**Strike Price Encoding:**
```
$580.50 → 00580 + 500 → 00580500
$670.00 → 00670 + 000 → 00670000
$100.25 → 00100 + 250 → 00100250
```

---

## DTE (Days to Expiration) Logic

The backtesting server auto-selects based on market conditions:

| Scenario | DTE | Reason |
|----------|-----|--------|
| Market open, before 3:30 PM ET | 0DTE | Same-day expiry acceptable |
| After hours, weekday | 1DTE | Next trading day |
| Friday after hours | 2DTE | Monday expiry (skip weekend) |
| Weekend | 1DTE | Monday expiry |

---

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://trader:trading123@database:5432/trading_system

# Server
PORT=3001

# Alpaca Live API (real trading data)
ALPACA_LIVE_API_KEY=AKTL8AR39NTFB1N7LCZO
ALPACA_LIVE_API_SECRET=kPO2bEqUOdCfFTpnPKtclAd0JrUW2ii8q868Mhvf

# Alpaca Paper API (backtesting)
ALPACA_PAPER_API_KEY=PKOXMOGJS4PPPIY32O8Q
ALPACA_PAPER_API_SECRET=nnuf3ROkhpToOgyfCbkObFLPCEiBLjuj5CVl08cF
```

---

## Key Classes & Modules

### API Server

| File | Purpose |
|------|---------|
| `server.js` | Main Express server, WebSocket handler, market data fetching |
| N/A | Single-file architecture for simplicity |

### Backtesting Server

| File | Purpose |
|------|---------|
| `server.js` | Express server with historical data endpoints |
| `backtesting-engine.js` | Core strategy execution engine |
| `technical-indicators.js` | RSI, ROC, VWAP, MACD calculations |
| `indicator-mapper.js` | Maps strategy indicators to chart format |
| `options-backtest-auditor.js` | Independent validation & Greeks calculation |
| `signal-endpoints.js` | Signal emission API |
| `optuna-optimizer.js` | Parameter optimization |
| `strategies/*.js` | Individual strategy definitions |

---

## Common Tasks

### Check if API server is running
```bash
curl http://localhost:3001/health
```

### List all available CSV data
```bash
curl http://localhost:3001/api/data-files
```

### Get SPY stock bars for today
```bash
curl -X POST http://localhost:3001/api/fetch-market-data \
  -H "Content-Type: application/json" \
  -d '{
    "dataType": "bars",
    "symbol": "SPY",
    "start": "2024-03-01T09:30:00Z",
    "end": "2024-03-01T16:00:00Z",
    "timeframe": "1Min"
  }'
```

### Get current 0DTE options for SPY
```bash
curl -X POST http://localhost:3002/api/fetch-current-options \
  -H "Content-Type: application/json" \
  -d '{"ticker": "SPY"}'
```

### Backtest multi-day with 0DTE + 1DTE options
```bash
curl -X POST http://localhost:3002/api/fetch-historical-data \
  -H "Content-Type: application/json" \
  -d '{
    "dataType": "options_bars_by_date_range",
    "ticker": "SPY",
    "start": "2024-03-01T09:30:00Z",
    "end": "2024-03-08T16:00:00Z"
  }'
```

---

## Troubleshooting Checklist

- [ ] API server running: `curl http://localhost:3001/health`
- [ ] Backtesting server running: `curl http://localhost:3002/health`
- [ ] Database connected: Check logs for `Connected to PostgreSQL`
- [ ] Alpaca WebSocket connections established: Check logs for `Connected to Alpaca`
- [ ] CSV files being logged: Check `/data/` directory
- [ ] Quote throttling working: Check 100ms minimum between broadcasts
- [ ] Options data available: Verify date is not before March 2024

---

## Response Code Meanings

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 400 | Bad request (missing required parameter) |
| 404 | Resource not found (e.g., no data for date) |
| 500 | Server error (check logs) |

---

## Performance Notes

- **Quote Throttling:** 100ms minimum between broadcasts per symbol
- **Batch Sizes:** Options API requests limited to 50 symbols per batch
- **Pagination:** Large result sets paginated (1000 bars per page)
- **Rate Limits:** Respect Alpaca API rate limits (varies by plan)
- **CSV Size:** Grows daily with market activity (typically MB range)

