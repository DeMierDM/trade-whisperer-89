# Trade Whisperer Docker Container Architecture Documentation

## Overview

The Trade Whisperer application uses a multi-container Docker architecture with two primary services:
1. **API Server (Port 3001)** - Handles market data fetching, WebSocket live streaming, and CSV data logging
2. **Backtesting Server (Port 3002)** - Processes historical data, runs backtests, and executes strategy analysis
3. **PostgreSQL Database (Port 5433)** - Persists trading data, API keys, and historical records
4. **Redis (Port 6379)** - Session management and caching (optional)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend Application                     │
│              (React/Vue - Browser-based UI)                  │
└─────────────────┬───────────────────────────┬────────────────┘
                  │                           │
        HTTP/REST │                           │ WebSocket
                  ▼                           ▼
        ┌──────────────────────────────────────────────┐
        │  API SERVER (Node.js Express)  - Port 3001   │
        │  ─────────────────────────────────────────   │
        │  • Market Data Fetching (Alpaca APIs)        │
        │  • Live Data Streaming (WebSocket)           │
        │  • CSV Data Logging                          │
        │  • Options Quote Management                  │
        └──────────┬─────────────────────────┬─────────┘
                   │                         │
        PostgreSQL │                         │ HTTP
                   ▼                         ▼
        ┌──────────────────────────────────────────────┐
        │    BACKTESTING SERVER - Port 3002            │
        │  ─────────────────────────────────────────   │
        │  • Historical Data Processing                │
        │  • Strategy Backtesting                      │
        │  • Options Greeks Calculation                │
        │  • Signal Generation                         │
        │  • Performance Analysis                      │
        └──────────┬──────────────────────────────────┘
                   │
                   ▼
        ┌──────────────────────────────────────────────┐
        │   PostgreSQL Database - Port 5433            │
        │  ─────────────────────────────────────────   │
        │  • API Keys & Credentials                    │
        │  • Trading History                          │
        │  • Strategy Configurations                  │
        │  • Performance Metrics                       │
        └──────────────────────────────────────────────┘

Alpaca APIs (External)
     ↑
     │ (HTTPS)
     │
     ├─ Data API (Market Data)
     ├─ Broker API (Options Contracts)
     ├─ WebSocket IEX Feed (Stock Quotes/Trades)
     └─ WebSocket OPRA Feed (Options Quotes)
```

---

## Container Specifications

### 1. API Server Container

**File:** `/docker/api-server/server.js`  
**Port:** 3001  
**Base Image:** node:18-alpine

#### Key Features:
- **CSV Data Logging:** Tracks all quotes and trades to timestamped CSV files
- **WebSocket Server:** Broadcasts live market data to connected clients
- **Dual Alpaca Connections:** 
  - IEX feed for stock quotes/trades
  - OPRA feed for options quotes (MessagePack encoded)
- **Rate Limiting:** Throttles quote broadcasts to 100ms intervals per symbol

---

### 2. Backtesting Server Container

**File:** `/docker/backtesting-server/server.js`  
**Port:** 3002  
**Base Image:** node:18-alpine (implied from docker-compose)

#### Key Features:
- **Intelligent Date Logic:** Auto-selects appropriate DTE based on market conditions
- **Options Data Fetching:** Retrieves multi-day historical options data
- **Strategy Loading:** Dynamically loads and executes trading strategies
- **Signal Generation:** Emits trading signals via WebSocket

---

### 3. PostgreSQL Database

**Container:** trading_db  
**Port:** 5433 (mapped from 5432)  
**Credentials:**
- Username: `trader`
- Password: `trading123`
- Database: `trading_system`

---

## API Endpoint Reference

### API Server Endpoints (`localhost:3001`)

#### Health & Status
```
GET /health
Response: { status: 'healthy', timestamp: ISO8601 }
```

#### Data Files Management
```
GET /api/data-files
Response: { 
  files: [ { filename, size, created, modified, rows } ],
  total: number,
  current_session: { stock_quotes_file, stock_trades_file, option_quotes_file }
}
```

#### Market Data Fetching
```
POST /api/fetch-market-data
Body: {
  dataType: 'bars' | 'quote' | 'options' | 'options_greeks' | 'options_bars' | 'options_bars_by_dte',
  symbol?: string,
  symbols?: string[],  // For options endpoints
  start: ISO8601,
  end: ISO8601,
  timeframe?: '5Min' | '1Min' | '1Hour' | '1Day',
  useLiveKeys?: boolean
}

Request Examples:

1. Fetch Stock Bars (OHLCV)
{
  dataType: 'bars',
  symbol: 'SPY',
  start: '2024-03-01T09:30:00Z',
  end: '2024-03-01T16:00:00Z',
  timeframe: '5Min'
}
Response: { data: { bars: Bar[] } }

2. Fetch Latest Quote
{
  dataType: 'quote',
  symbol: 'SPY'
}
Response: { data: { quote: QuoteData } }

3. Fetch Options (Current/ATM)
{
  dataType: 'options',
  symbol: 'SPY'
}
Response: { data: EnrichedContract[] }

4. Fetch Options Greeks
{
  dataType: 'options_greeks',
  symbols: 'SPY251010C00670000,SPY251010P00670000'
}
Response: { data: { [symbol]: GreeksData } }

5. Fetch Historical Options Bars
{
  dataType: 'options_bars',
  symbols: 'SPY251010C00653000,SPY251010P00653000',
  timeframe: '1min',
  start: '2024-03-03T09:30:00Z',
  end: '2024-03-03T16:00:00Z'
}
Response: { 
  data: { bars: { [symbol]: Bar[] }, next_page_token?: string },
  metadata: { total_symbols, total_bars, timeframe, date_range }
}

6. Fetch Options by DTE (Days to Expiration)
{
  dataType: 'options_bars_by_dte',
  ticker: 'SPY',
  expiryDate: '241220',  // YYMMDD format
  strikeRange: 10,
  strikeSpacing: 5,
  timeframe: '1min',
  start: '2024-03-01T09:30:00Z',
  end: '2024-03-01T16:00:00Z'
}
Response: {
  data: {
    bars: { [symbol]: Bar[] },
    underlying_analysis: { price_range, center_strike, strike_spacing },
    symbol_generation: { generated_symbols, symbols_with_data }
  },
  metadata: { ... }
}
```

#### Options Quote Retrieval (Batch)
```
POST /api/get-option-quotes
Body: {
  symbols: ['SPY251010C00670000', 'SPY251010P00670000']  // Max 50 per request
}
Response: {
  quotes: {
    [symbol]: {
      symbol: string,
      bid: number,
      ask: number,
      bid_size: number,
      ask_size: number,
      timestamp: number,
      data_source: 'opra_feed'
    }
  },
  total: number,
  requested: number,
  data_source: 'opra_feed',
  timestamp: ISO8601
}
```

#### Recent Trades Retrieval
```
POST /api/get-recent-trades
Body: {
  symbol: 'SPY',
  minutesBack: 30
}
Response: {
  trades: [ { timestamp, symbol, price, size, exchange, conditions, source } ],
  symbol: string,
  minutesBack: number,
  total: number,
  oldestTrade: ISO8601,
  newestTrade: ISO8601
}
```

#### Test API Connection
```
POST /api/test-connection
Body: {
  provider: 'alpaca',
  getKeys: true  // Request stored API keys
}
Response: {
  isConnected: boolean,
  message: string,
  keys?: { api_key, api_secret, mode: 'live' }
}
```

---

### Backtesting Server Endpoints (`localhost:3002`)

#### Health Check
```
GET /health
Response: {
  status: 'ok',
  service: 'backtesting-server',
  port: 3002,
  timestamp: ISO8601
}
```

#### Fetch Current Options (Real-time)
```
POST /api/fetch-current-options
Body: {
  ticker: 'SPY',
  strikeRange: 5,
  strikeSpacing: 5
}
Response: {
  data: [ { symbol, strike, bid, ask, last, vol, oi, delta, itm, timestamp, expiry } ],
  metadata: {
    ticker: string,
    strategy: '0DTE' | '1DTE' | '2DTE',
    reason: string,
    expiry_date: 'YYMMDD',
    current_price: number,
    center_strike: number,
    total_symbols_generated: number,
    symbols_with_data: number,
    total_bars: number
  }
}
```

#### Fetch Historical Data
```
POST /api/fetch-historical-data
Body: {
  dataType: 'bars' | 'options_bars_by_dte' | 'options_bars_by_date_range' | 'options_bars_by_historical_dte',
  symbol?: string,
  ticker?: string,
  start: ISO8601,
  end: ISO8601,
  expiryDate?: 'YYMMDD',
  timeframe?: '1min' | '5min',
  strikeRange?: number,
  strikeSpacing?: number,
  dteType?: '0DTE' | 'weekly' | 'monthly'
}

Request Examples:

1. Fetch Stock Bars for Backtesting
{
  dataType: 'bars',
  symbol: 'SPY',
  start: '2024-03-01T09:30:00Z',
  end: '2024-03-03T16:00:00Z',
  timeframe: '1min'
}
Response: {
  data: { bars: Bar[] },
  metadata: { symbol, total_bars, timeframe, date_range }
}

2. Fetch Options by Single DTE
{
  dataType: 'options_bars_by_dte',
  ticker: 'SPY',
  expiryDate: '241220',
  start: '2024-03-01T09:30:00Z',
  end: '2024-03-01T16:00:00Z',
  strikeRange: 10,
  strikeSpacing: 5
}
Response: {
  data: {
    bars: { [symbol]: Bar[] },
    underlying_analysis: { price_range, center_strike },
    symbol_generation: { total_generated, symbols_with_data, generated_symbols }
  },
  metadata: { ... }
}

3. Fetch Options for Multi-Day Backtest (0DTE + 1DTE)
{
  dataType: 'options_bars_by_date_range',
  ticker: 'SPY',
  start: '2024-03-01T09:30:00Z',
  end: '2024-03-05T16:00:00Z',
  strikeRange: 10,
  strikeSpacing: 5
}
Response: {
  data: {
    bars: { [symbol]: Bar[] },
    trading_days: ['2024-03-01', '2024-03-04', '2024-03-05'],
    contracts_by_day: { [date]: [symbols] },
    underlying_analysis: { ... },
    symbol_generation: { ... }
  },
  metadata: {
    total_symbols_generated: number,
    trading_days_count: number,
    includes_0dte: true,
    includes_1dte: true,
    pagination_used: true
  }
}

4. Fetch Options with Automatic DTE Calculation
{
  dataType: 'options_bars_by_historical_dte',
  ticker: 'SPY',
  dteType: '0DTE' | 'weekly' | 'monthly',
  start: '2024-03-01T09:30:00Z',
  end: '2024-03-05T16:00:00Z'
}
Response: {
  data: {
    bars: { [symbol]: Bar[] },
    underlying_analysis: { ... },
    symbol_generation: { ... }
  },
  metadata: {
    expiration_dates: ['241220', '241227'],
    dte_type: string,
    trading_days_analyzed: number
  }
}
```

---

## Data Schemas

### Bar/OHLCV Format

**From Alpaca API:**
```javascript
{
  t: number,           // Unix timestamp (seconds or milliseconds)
  o: number,           // Open price
  h: number,           // High price
  l: number,           // Low price
  c: number,           // Close price
  v: number,           // Volume
  n: number,           // Trade count (optional)
  vw: number           // Volume-weighted average price (optional)
}
```

**Internal Format (normalized):**
```javascript
{
  timestamp: number,   // Unix milliseconds
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
  vwap: number
}
```

### Stock Quote Format

**OPRA/IEX Feed:**
```javascript
{
  S: string,           // Symbol
  bp: number,          // Bid price
  ap: number,          // Ask price
  bs: number,          // Bid size
  as: number,          // Ask size
  t: number,           // Timestamp
  c: string[]          // Conditions array (optional)
}
```

**Internal Format:**
```javascript
{
  symbol: string,
  bid: number,
  ask: number,
  bid_size: number,
  ask_size: number,
  timestamp: number,
  exchange: string,
  conditions: string[],
  data_source: 'stock_quote' | 'opra_live'
}
```

### Stock Trade Format

**OPRA/IEX Feed:**
```javascript
{
  S: string,           // Symbol
  p: number,           // Price
  s: number,           // Size
  t: number,           // Timestamp
  x: string,           // Exchange
  c: string[]          // Conditions
}
```

**Internal Format:**
```javascript
{
  symbol: string,
  price: number,
  size: number,
  timestamp: number,
  exchange: string,
  conditions: string[],
  data_source: 'stock_trade'
}
```

### Options Contract Format

**Alpaca API Response:**
```javascript
{
  symbol: string,              // e.g., "SPY251010C00670000"
  underlying_symbol: string,   // e.g., "SPY"
  strike_price: string,        // e.g., "670.00"
  expiration_date: string,     // e.g., "2024-10-10"
  type: 'call' | 'put',
  status: 'active' | 'inactive',
  close_price: number,
  // Plus enriched fields from quotes:
  bid: number,
  ask: number,
  bid_size: number,
  ask_size: number,
  last_price: number,
  volume: number,
  timestamp: number,
  data_source: 'opra_feed' | 'estimated_from_close'
}
```

### Options Quote Format (OPRA)

**Raw OPRA Feed:**
```javascript
{
  S: string,           // Symbol
  bp: number,          // Bid price
  ap: number,          // Ask price
  bs: number,          // Bid size
  as: number,          // Ask size
  t: number,           // Timestamp
  p: number,           // Last trade price
  s: number,           // Last trade size (volume)
}
```

**Processed Format:**
```javascript
{
  symbol: string,
  bid: number,
  ask: number,
  bid_size: number,
  ask_size: number,
  last_price: number,
  volume: number,
  timestamp: number,
  data_source: 'opra_feed'
}
```

### Options Greeks Format

```javascript
{
  [symbol]: {
    impliedVol: number,    // 0.0 - 1.0
    delta: number,         // -1.0 to 1.0
    gamma: number,         // Rate of delta change
    vega: number,          // Per 1% IV change
    theta: number,         // Per day
    rho: number            // Per 1% rate change
  }
}
```

### Options Bars Format

```javascript
{
  bars: {
    [symbol]: [
      {
        t: string,         // ISO timestamp
        o: number,         // Open
        h: number,         // High
        l: number,         // Low
        c: number,         // Close
        v: number,         // Volume
        vw: number,        // VWAP (optional)
        n: number          // Trade count (optional)
      }
    ]
  },
  next_page_token?: string
}
```

---

## CSV Data Logging

The API server automatically logs all market data to CSV files in `/app/data/`:

### Stock Quotes CSV
**File:** `stock_quotes_YYYY-MM-DD.csv`  
**Columns:** `timestamp,symbol,bid,ask,bid_size,ask_size,exchange,conditions,data_source`

### Stock Trades CSV
**File:** `stock_trades_YYYY-MM-DD.csv`  
**Columns:** `timestamp,symbol,price,size,exchange,conditions,data_source`

### Options Quotes CSV
**File:** `option_quotes_YYYY-MM-DD.csv`  
**Columns:** `timestamp,symbol,bid,ask,bid_size,ask_size,timestamp_alpaca,data_source`

---

## WebSocket Communication

### Client Connection
```
ws://localhost:3001
```

### Client to Server (Subscribe to Live Data)
```javascript
{
  action: 'subscribe',
  symbols: ['SPY', 'SPY251010C00670000', 'SPY251010P00670000']
}
```

### Server to Client (Stock Trade)
```javascript
{
  type: 'stock_trade',
  data: {
    symbol: 'SPY',
    price: 452.50,
    size: 100,
    timestamp: 1708000000000,
    exchange: 'NYSE',
    conditions: [],
    data_source: 'stock_trade'
  }
}
```

### Server to Client (Stock Quote)
```javascript
{
  type: 'stock_quote',
  data: {
    symbol: 'SPY',
    bid: 452.45,
    ask: 452.55,
    bid_size: 2000,
    ask_size: 1500,
    timestamp: 1708000000000,
    data_source: 'stock_quote'
  }
}
```

### Server to Client (Options Quote)
```javascript
{
  type: 'option_quote',
  data: {
    symbol: 'SPY251010C00670000',
    bid: 2.45,
    ask: 2.55,
    bid_size: 500,
    ask_size: 400,
    timestamp: 1708000000000,
    data_source: 'opra_live'
  }
}
```

### Server to Client (Connected Confirmation)
```javascript
{
  type: 'connected',
  message: 'Connected to live OPRA data stream'
}
```

---

## Environment Configuration

### .env File Structure

```env
DATABASE_URL=postgresql://trader:trading123@database:5432/trading_system
PORT=3001

# Alpaca Live API Keys
ALPACA_LIVE_API_KEY=YOUR_LIVE_KEY
ALPACA_LIVE_API_SECRET=YOUR_LIVE_SECRET

# Alpaca Paper API Keys (for backtesting)
ALPACA_PAPER_API_KEY=YOUR_PAPER_KEY
ALPACA_PAPER_API_SECRET=YOUR_PAPER_SECRET
```

### Docker Compose Environment

```yaml
environment:
  DATABASE_URL: postgresql://trader:trading123@database:5432/trading_system
  PORT: 3001
  ALPACA_LIVE_API_KEY: ${ALPACA_LIVE_API_KEY}
  ALPACA_LIVE_API_SECRET: ${ALPACA_LIVE_API_SECRET}
  ALPACA_PAPER_API_KEY: ${ALPACA_PAPER_API_KEY}
  ALPACA_PAPER_API_SECRET: ${ALPACA_PAPER_API_SECRET}
```

---

## Data Storage & Persistence

### PostgreSQL Schema Overview

**Tables:**
- `users` - User accounts and authentication
- `api_keys` - API credentials for different providers
- `trading_data` - Historical trading information
- `strategies` - Strategy configurations
- `signals` - Generated trading signals
- `performance_metrics` - Backtest results

### Docker Volumes

```yaml
volumes:
  postgres_data:           # PostgreSQL persistent storage
  ./docker/api-server:/app # API server code mount
  ./data:/app/data         # CSV data files persistence
```

---

## Inter-Container Communication

### API Server → Backtesting Server
```
HTTP POST http://backtesting-server:3002/api/fetch-historical-data
or
HTTP POST http://localhost:3002/api/fetch-historical-data (from host)
```

### API Server → PostgreSQL
```
Connection String: postgresql://trader:trading123@database:5432/trading_system
Default Pool Size: Configured in connection
```

### WebSocket Connections
- **Frontend → API Server:** Direct WebSocket at `ws://localhost:3001`
- **Alpaca IEX Feed:** `wss://stream.data.alpaca.markets/v2/iex`
- **Alpaca OPRA Feed:** `wss://stream.data.alpaca.markets/v1beta1/opra` (MessagePack)

---

## Key Technical Details

### Option Symbol Format (Alpaca Standard)

**Format:** `{TICKER}{YYMMDD}{C|P}{PRICE}`

Example: `SPY241220C00670000`
- `SPY` - Underlying ticker
- `241220` - Expiration date (Dec 20, 2024)
- `C` - Call (or P for Put)
- `00670000` - Strike price ($670.00 as 8-digit code)

**Price Encoding:**
- First 5 digits: Dollar amount (padded with zeros)
- Last 3 digits: Cents (padded with zeros)
- Example: $580.50 = `00580` + `500` = `00580500`

### Intelligent Date Logic

The backtesting server implements smart DTE selection:

```javascript
getBestDTE() {
  // 0DTE: If market open before 3:30 PM ET
  // 1DTE: After hours on weekdays
  // 2DTE: Friday after hours (target Monday)
  // 1DTE: Weekend (target Monday)
}
```

### Market Hour Detection

```javascript
isOvernightSession() {
  // 8 PM - 4 AM ET = Overnight (no regular trading)
  // 4 AM - 8 PM ET = Regular trading hours
  // Automatically switches between IEX and Overnight feeds
}
```

### Quote Throttling

To prevent memory overflow:
- Maximum broadcast frequency: 100ms per symbol per type
- Tracks `quoteThrottleMap` to enforce rate limiting
- Applies to both stock quotes and options quotes

---

## Strategy Framework

### Strategy File Structure

Each strategy in `/docker/backtesting-server/strategies/` contains:

```javascript
module.exports = {
  name: "Strategy Name",
  version: "1.0.0",
  
  signals: {
    indicators: [
      { name: 'rsi', params: [{ period: 2 }, { period: 9 }] },
      { name: 'roc', params: [{ period: 3 }] },
      { name: 'vwap', params: { adaptive_bands: true } }
    ],
    
    entry: {
      long: { conditions: [...], confirmation: {...} },
      short: { conditions: [...], confirmation: {...} }
    }
  },
  
  optionStrategy: {
    type: 'single_leg' | 'spread',
    direction: 'signal_based'
  },
  
  contractSelection: {
    expiration: { dte: [0, 1], preferredDTE: 0 },
    strike: { method: 'atm_offset', offset: {...} },
    liquidity: { minOpenInterest: 100, maxBidAskSpread: 0.08 }
  },
  
  riskManagement: {
    entry: { maxPositions: 100, positionSizing: 'fixed' },
    exit: { profitTarget: 0.05, stopLoss: 0.02 }
  }
}
```

### Indicator Specifications

**Supported Indicators:**
- RSI (Relative Strength Index) - period configurable
- ROC (Rate of Change) - period configurable
- VWAP (Volume Weighted Average Price)
- VWAP Slope - lookback period configurable
- MACD (Moving Average Convergence Divergence)
- Volume Analysis with Imbalance Detection
- Volatility - period configurable

---

## Performance Monitoring

### Backtesting Engine Metrics

```javascript
performance: {
  trades: number,           // Total trades executed
  wins: number,             // Winning trades
  losses: number,           // Losing trades
  totalPnL: number,         // Total profit/loss
  winRate: number,          // Win rate percentage
  sharpeRatio: number       // Risk-adjusted return
}
```

### Options Auditor Validation

The system includes independent auditing:
1. Recalculates Greeks from OHLCV data
2. Simulates strategy execution independently
3. Validates bid/ask spread modeling
4. Checks DTE-based entry/exit logic

---

## Deployment Checklist

- [ ] Set environment variables (.env.docker)
- [ ] Configure PostgreSQL credentials
- [ ] Set Alpaca API keys (Live and Paper)
- [ ] Create data directory for CSV logs
- [ ] Build Docker images
- [ ] Start containers with docker-compose
- [ ] Verify database initialization
- [ ] Test API connectivity
- [ ] Verify WebSocket streaming
- [ ] Monitor container logs

---

## Troubleshooting

### Common Issues

1. **WebSocket Connection Failures**
   - Ensure API server is running on port 3001
   - Check firewall settings
   - Verify CORS configuration in Express

2. **Options Data Not Available**
   - Historical options data only available from March 2024
   - Verify DTE expiration dates exist
   - Check API rate limits

3. **Database Connection Issues**
   - Verify PostgreSQL is running
   - Check DATABASE_URL in environment
   - Ensure credentials are correct

4. **Throttled API Responses**
   - Monitor CSV file sizes in /app/data/
   - Verify quote throttling is working (100ms minimum)
   - Check Alpaca API rate limits

---

## Future Enhancements

- [ ] Add authentication/authorization layer
- [ ] Implement real-time signal persistence
- [ ] Add performance analytics dashboard
- [ ] Support for more option strategies (spreads, butterflies)
- [ ] Real-time risk management and position monitoring
- [ ] Integration with other data providers

