# Trading System API Mapping Guide

## Overview
This document maps all API calls between the frontend (React/TypeScript) and the Docker backend servers, including WebSocket connections for real-time data streaming.

**Last Updated:** 2025-10-26

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                         │
│  Port: 5173 (Vite Dev Server)                                   │
│                                                                  │
│  Components:                                                     │
│  - Trading.tsx (Live Trading UI)                                │
│  - Backtesting.tsx (Strategy Testing)                           │
│  - Home.tsx (Dashboard)                                         │
│  - History.tsx (Trade History)                                  │
│  - Settings.tsx (Configuration)                                 │
│                                                                  │
│  Hooks:                                                          │
│  - useDockerWebSocket.ts (Stock/Option WebSocket)               │
│  - useOptionsData.ts (Options Chain Data)                       │
│  - useOptionsGreeks.ts (Greeks Calculation)                     │
│  - useBacktestingData.ts (Historical Data)                      │
│                                                                  │
│  API Client: dockerApiClient.ts                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↕ HTTP/REST & WebSocket
┌─────────────────────────────────────────────────────────────────┐
│                    DOCKER API SERVER (Node.js)                   │
│  Port: 3001                                                      │
│  File: docker/api-server/server.js                              │
│                                                                  │
│  Functions:                                                      │
│  - Market data fetching (stocks & options)                      │
│  - WebSocket relay for live data                                │
│  - API key management                                           │
│  - CSV data logging for historical storage                      │
│                                                                  │
│  External Integrations:                                          │
│  - Alpaca Stock WebSocket (wss://stream.data.alpaca.markets/v2/iex)
│  - Alpaca Options WebSocket (wss://stream.data.alpaca.markets/v1beta1/opra)
│  - Alpaca REST APIs (https://data.alpaca.markets)               │
│                                                                  │
│  Data Storage:                                                   │
│  - CSV Files: /app/data/*.csv (quotes, trades, options)         │
│  - PostgreSQL: trading_db (port 5433)                           │
└─────────────────────────────────────────────────────────────────┘
                            ↕ Database Queries
┌─────────────────────────────────────────────────────────────────┐
│                  POSTGRESQL DATABASE                             │
│  Port: 5433                                                      │
│  Container: trading_db                                           │
│                                                                  │
│  Tables:                                                         │
│  - users (authentication)                                        │
│  - api_keys (Alpaca credentials)                                │
│  - backtest_trades (historical test results)                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## REST API Endpoints

### 1. Health Check
**Endpoint:** `GET /health`  
**Purpose:** Server status verification  
**Request:** None  
**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-26T15:40:20.389Z"
}
```

**Frontend Usage:** API diagnostics, server monitoring

---

### 2. Fetch Market Data (Primary Endpoint)
**Endpoint:** `POST /api/fetch-market-data`  
**Purpose:** Fetch various types of market data from Alpaca  
**File:** `docker/api-server/server.js:239`

**Data Types Supported:**
- `bars` - Historical stock OHLCV bars
- `quote` - Latest stock quote (bid/ask)
- `options` - Options chain with ATM contracts
- `options_greeks` - Options Greeks (delta, gamma, theta, vega, IV)
- `options_bars_by_dte` - Historical options bars by DTE
- `options_bars` - Historical options OHLCV data
- `account` - (Future: Account information)
- `orders` - (Future: Order history)

#### 2a. Stock Bars (Historical OHLCV)
**Request:**
```json
{
  "dataType": "bars",
  "symbol": "SPY",
  "start": "2025-10-26T09:30:00Z",
  "end": "2025-10-26T16:00:00Z",
  "timeframe": "5Min"
}
```

**Response:**
```json
{
  "data": {
    "bars": [
      {
        "t": "2025-10-26T09:30:00Z",
        "o": 580.50,
        "h": 581.20,
        "l": 580.30,
        "c": 580.90,
        "v": 1234567,
        "vw": 580.75,
        "n": 456
      }
    ]
  }
}
```

**Frontend Usage:**
- `Trading.tsx:fetchHistoricalBars()` - Chart initialization
- `LiveTradingViewChart.tsx` - TradingView chart rendering

**Data Flow:**
```
Frontend Request → Docker API → Alpaca Data API
→ Normalize bars → Send to frontend → Render chart
```

---

#### 2b. Latest Quote (Bid/Ask)
**Request:**
```json
{
  "dataType": "quote",
  "symbol": "SPY"
}
```

**Response:**
```json
{
  "data": {
    "quote": {
      "bp": 580.70,  // bid price
      "ap": 580.84,  // ask price
      "bs": 100,     // bid size
      "as": 100,     // ask size
      "t": "2025-10-26T15:40:20.123Z"
    }
  }
}
```

**Frontend Usage:**
- `Trading.tsx:fetchMarketData()` - Current price display
- Real-time price updates

---

#### 2c. Options Chain
**Request:**
```json
{
  "dataType": "options",
  "symbol": "SPY"
}
```

**Backend Logic (server.js:315-509):**
1. Fetch active option contracts from Alpaca Broker API
2. Get current stock price to find ATM options
3. Filter for 0DTE contracts (same-day expiration)
4. Filter for ATM contracts (within $15 of current price)
5. Sort by distance from current price, take top 20
6. Fetch latest quotes from OPRA feed for real bid/ask prices
7. Merge contract data with OPRA quotes

**Response:**
```json
{
  "data": [
    {
      "symbol": "SPY251026C00580000",
      "strike_price": "580.00",
      "expiration_date": "2025-10-26",
      "type": "call",
      "bid": 2.42,
      "ask": 2.46,
      "bid_size": 100,
      "ask_size": 150,
      "last_price": 2.44,
      "volume": 5000,
      "timestamp": "2025-10-26T15:40:20.123Z",
      "data_source": "opra_feed"
    }
  ]
}
```

**Frontend Usage:**
- `Trading.tsx:fetchOptionsChain()` - Options table display
- `useOptionsData.ts` - Options data management

**Important Notes:**
- Uses LIVE API keys to access real market data
- OPRA feed provides real-time options quotes
- Automatically filters for 0DTE and ATM contracts
- Falls back to estimated data if OPRA quotes unavailable

---

#### 2d. Options Greeks
**Endpoint Detail:** `dataType: "options_greeks"`  
**Alpaca API:** `GET /v1beta1/options/snapshots`

**Request:**
```json
{
  "dataType": "options_greeks",
  "symbols": "SPY251026C00580000,SPY251026P00580000"
}
```

**Response:**
```json
{
  "data": {
    "SPY251026C00580000": {
      "latestQuote": {
        "bp": 2.42,
        "ap": 2.46
      },
      "greeks": {
        "delta": 0.612,
        "gamma": 0.0871,
        "theta": -0.152,
        "vega": 0.043
      },
      "impliedVolatility": 0.125
    }
  }
}
```

**Frontend Usage:**
- `useOptionsGreeks.ts` - Auto-refresh every 5 seconds
- `Trading.tsx` - Display Greeks in options table

**Data Flow:**
```
Options symbols from chain → Request Greeks → 
Alpaca snapshots API → Parse Greeks → 
Update UI with delta/gamma/theta/vega/IV
```

---

#### 2e. Historical Options Bars by DTE
**Endpoint Detail:** `dataType: "options_bars_by_dte"`  
**Purpose:** Fetch historical options OHLCV for backtesting

**Request:**
```json
{
  "dataType": "options_bars_by_dte",
  "ticker": "SPY",
  "expiryDate": "251026",  // YYMMDD format
  "start": "2025-10-26T09:30:00Z",
  "end": "2025-10-26T16:00:00Z",
  "timeframe": "1min",
  "strikeRange": 10,
  "strikeSpacing": 5
}
```

**Backend Logic (server.js:547-744):**
1. Fetch underlying stock bars to determine price range
2. Calculate center strike based on average price
3. Generate option symbols around center strike
4. Fetch options bars from Alpaca Market Data API
5. Save to CSV for historical storage
6. Return bars grouped by symbol

**Response:**
```json
{
  "data": {
    "bars": {
      "SPY251026C00580000": [
        {
          "t": "2025-10-26T09:30:00Z",
          "o": 2.40,
          "h": 2.50,
          "l": 2.38,
          "c": 2.45,
          "v": 1000,
          "vw": 2.44,
          "n": 50
        }
      ]
    },
    "underlying_analysis": {
      "ticker": "SPY",
      "price_range": { "min": 579.50, "max": 581.20, "average": 580.40 },
      "center_strike": 580,
      "strike_spacing": 5
    }
  },
  "metadata": {
    "ticker": "SPY",
    "expiry_date": "251026",
    "total_symbols_generated": 42,
    "symbols_with_data": 28,
    "total_bars": 15680,
    "timeframe": "1min"
  }
}
```

**Frontend Usage:**
- `useBacktestingData.ts` - Load historical options data
- `Backtesting.tsx` - Backtest strategy execution

**CRITICAL FOR BACKTESTING:**
- Returns OHLCV bars (not just bid/ask)
- Proper format for 0DTE/1DTE strategy testing
- Matches intraday trading patterns

---

### 3. Get Option Quotes (Batch)
**Endpoint:** `POST /api/get-option-quotes`  
**Purpose:** Fetch latest quotes for multiple option symbols  
**File:** `docker/api-server/server.js:854`

**Request:**
```json
{
  "symbols": [
    "SPY251026C00580000",
    "SPY251026P00580000"
  ]
}
```

**Response:**
```json
{
  "quotes": {
    "SPY251026C00580000": {
      "symbol": "SPY251026C00580000",
      "bid": 2.42,
      "ask": 2.46,
      "bid_size": 100,
      "ask_size": 150,
      "timestamp": "2025-10-26T15:40:20.123Z",
      "data_source": "opra_feed"
    }
  },
  "total": 2,
  "requested": 2,
  "data_source": "opra_feed",
  "timestamp": "2025-10-26T15:40:20.389Z"
}
```

**Features:**
- Batch processing (50 symbols per batch)
- Automatic rate limiting (100ms delay between batches)
- Uses OPRA feed for real-time data

**Frontend Usage:** Bulk quote refreshes

---

### 4. Get Recent Trades (CSV)
**Endpoint:** `POST /api/get-recent-trades`  
**Purpose:** Retrieve stored trade data from CSV files  
**File:** `docker/api-server/server.js:942`

**Request:**
```json
{
  "symbol": "SPY",
  "minutesBack": 30
}
```

**Response:**
```json
{
  "trades": [
    {
      "timestamp": "2025-10-26T15:35:20.123Z",
      "symbol": "SPY",
      "price": 580.75,
      "size": 100,
      "exchange": "IEX",
      "conditions": "",
      "source": "stock_trade"
    }
  ],
  "symbol": "SPY",
  "minutesBack": 30,
  "total": 142,
  "oldestTrade": "2025-10-26T15:10:20.123Z",
  "newestTrade": "2025-10-26T15:40:20.123Z"
}
```

**CSV Storage:**
- Location: `/app/data/stock_trades_YYYY-MM-DD.csv`
- Retention: Daily files (for historical analysis)
- Format: timestamp,symbol,price,size,exchange,conditions,data_source

**Frontend Usage:** Gap filling, historical chart data

---

### 5. Data Files List
**Endpoint:** `GET /api/data-files`  
**Purpose:** List available CSV data files  
**File:** `docker/api-server/server.js:109`

**Response:**
```json
{
  "files": [
    {
      "filename": "stock_quotes_2025-10-26.csv",
      "size": 1048576,
      "created": "2025-10-26T09:30:00Z",
      "modified": "2025-10-26T15:40:20Z",
      "rows": "quotes"
    }
  ],
  "total": 3,
  "data_directory": "/app/data",
  "current_session": {
    "stock_quotes": "stock_quotes_2025-10-26.csv",
    "stock_trades": "stock_trades_2025-10-26.csv",
    "option_quotes": "option_quotes_2025-10-26.csv"
  }
}
```

**Frontend Usage:** Data export, debugging, file management

---

### 6. Test API Connection
**Endpoint:** `POST /api/test-connection`  
**Purpose:** Validate Alpaca API credentials  
**File:** `docker/api-server/server.js:147`

**Request:**
```json
{
  "provider": "alpaca",
  "apiKey": "PK...",
  "apiSecret": "...",
  "getKeys": false
}
```

**OR (retrieve keys):**
```json
{
  "provider": "alpaca",
  "getKeys": true
}
```

**Response:**
```json
{
  "isConnected": true,
  "message": "Alpaca Live API connected successfully",
  "keys": {
    "api_key": "PK...",
    "api_secret": "...",
    "mode": "live"
  }
}
```

**Frontend Usage:**
- `Settings.tsx` - API key validation
- `useApiDiagnostics.ts` - Connection testing

---

## WebSocket Connections

### 1. Frontend ↔ Docker API WebSocket
**Endpoint:** `ws://localhost:3001`  
**Protocol:** JSON  
**Purpose:** Real-time stock and option data streaming

**Connection Flow:**
```javascript
// Frontend: useDockerWebSocket.ts
const ws = new WebSocket('ws://localhost:3001');

ws.onopen = () => {
  // Subscribe to symbols
  ws.send(JSON.stringify({
    action: 'subscribe',
    symbols: ['SPY', 'SPY251026C00580000']
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'connected':
      // Connection established
      break;
    case 'stock_trade':
      // Live stock trade
      handleStockTrade(message.data);
      break;
    case 'stock_quote':
      // Live stock quote
      handleStockQuote(message.data);
      break;
    case 'option_quote':
      // Live option quote
      handleOptionQuote(message.data);
      break;
  }
};
```

**Message Types:**

#### Connected Message
```json
{
  "type": "connected",
  "message": "Connected to live OPRA data stream"
}
```

#### Stock Trade
```json
{
  "type": "stock_trade",
  "data": {
    "symbol": "SPY",
    "price": 580.75,
    "size": 100,
    "timestamp": "2025-10-26T15:40:20.387Z",
    "exchange": "IEX",
    "conditions": [],
    "data_source": "stock_trade"
  }
}
```

#### Stock Quote
```json
{
  "type": "stock_quote",
  "data": {
    "symbol": "SPY",
    "bid": 580.70,
    "ask": 580.84,
    "bid_size": 100,
    "ask_size": 100,
    "timestamp": "2025-10-26T15:40:20.387Z",
    "data_source": "stock_quote"
  }
}
```

#### Option Quote
```json
{
  "type": "option_quote",
  "data": {
    "symbol": "SPY251026C00580000",
    "bid": 2.42,
    "ask": 2.46,
    "bid_size": 100,
    "ask_size": 150,
    "timestamp": "2025-10-26T15:40:20.387Z",
    "data_source": "opra_live"
  }
}
```

**Throttling:**
- Quotes throttled to 1 update per symbol per 100ms
- Prevents memory overflow from high-frequency updates
- Trades not throttled (immediate broadcast)

---

### 2. Docker API ↔ Alpaca Stock WebSocket
**Endpoint:** `wss://stream.data.alpaca.markets/v2/iex`  
**Protocol:** JSON  
**Purpose:** IEX stock feed (regular market hours)  
**File:** `docker/api-server/server.js:1155`

**Authentication:**
```json
{
  "action": "auth",
  "key": "PK...",
  "secret": "..."
}
```

**Subscription:**
```json
{
  "action": "subscribe",
  "quotes": ["SPY"],
  "trades": ["SPY"]
}
```

**Features:**
- Auto-reconnect on disconnect (5s delay)
- Heartbeat ping every 30s
- Automatic feed switching (IEX for regular hours)
- CSV logging of all quotes and trades

---

### 3. Docker API ↔ Alpaca Options WebSocket
**Endpoint:** `wss://stream.data.alpaca.markets/v1beta1/opra`  
**Protocol:** MessagePack (binary)  
**Purpose:** OPRA options feed (real-time)  
**File:** `docker/api-server/server.js:1017`

**Authentication (MessagePack encoded):**
```javascript
const authMessage = {
  action: 'auth',
  key: apiKey,
  secret: apiSecret
};
ws.send(encode(authMessage));  // MessagePack encoding
```

**Subscription:**
```javascript
const subscribeMessage = {
  action: 'subscribe',
  quotes: ['SPY251026C00580000', 'SPY251026P00580000']
};
ws.send(encode(subscribeMessage));
```

**Incoming Data (MessagePack):**
```javascript
ws.on('message', (data) => {
  const messages = decode(data);  // Decode binary MessagePack
  
  for (const message of messages) {
    if (message.T === 'q') {  // Quote
      const quote = {
        symbol: message.S,
        bid: message.bp,
        ask: message.ap,
        bid_size: message.bs,
        ask_size: message.as,
        timestamp: message.t
      };
      // Broadcast to frontend clients
    }
  }
});
```

**Features:**
- MessagePack binary protocol (required for OPRA)
- Auto-reconnect on disconnect
- Heartbeat ping every 30s
- CSV logging of all option quotes

---

## Data Flow Examples

### Example 1: Live Trading Chart Update
**Scenario:** User opens Trading page, SPY chart loads and updates live

```
1. INITIAL DATA LOAD
   Frontend (Trading.tsx)
   → fetchHistoricalBars(symbol='SPY', timeframe='5Min')
   → POST /api/fetch-market-data { dataType: 'bars', ... }
   → Docker API fetches from Alpaca Data API
   → Returns 507 historical bars
   → LiveTradingViewChart renders initial chart

2. WEBSOCKET CONNECTION
   Frontend (useDockerWebSocket)
   → new WebSocket('ws://localhost:3001')
   → onopen: send subscribe message { symbols: ['SPY'] }
   
   Docker API (server.js)
   → Receives subscription
   → Separates stock vs option symbols
   → Alpaca Stock WS: subscribe to quotes + trades
   
3. LIVE UPDATES
   Alpaca Stock WS
   → Receives trade: { T: 't', S: 'SPY', p: 580.75, ... }
   → Docker API logs to CSV
   → Docker API broadcasts to frontend: { type: 'stock_trade', data: {...} }
   
   Frontend (useDockerWebSocket)
   → Receives trade
   → Updates recentTrades state
   → useEffect triggers chart update
   → LiveTradingViewChart.update() adds new bar/updates current bar
```

**Performance Notes:**
- Historical data: ~500-2000 bars loaded once
- Live updates: ~10-100 trades per minute (varies by symbol)
- Chart updates: Debounced to prevent lag
- CSV logging: Asynchronous (non-blocking)

---

### Example 2: Options Chain with Greeks
**Scenario:** User selects SPY, options table populates with real data

```
1. FETCH OPTIONS CHAIN
   Frontend (Trading.tsx)
   → fetchOptionsChain(symbol='SPY')
   → POST /api/fetch-market-data { dataType: 'options', symbol: 'SPY' }
   
   Docker API (server.js:315)
   → GET /v2/options/contracts?underlying_symbols=SPY&status=active
   → Receives 652 contracts
   → Filters for 0DTE (same-day expiration)
   → Gets current stock price: $580.40
   → Filters for ATM (within $15): $565-$595 strikes
   → Sorts by distance from price
   → Takes top 20 contracts
   
   → GET /v1beta1/options/quotes/latest?symbols=...&feed=opra
   → Receives real OPRA quotes
   → Merges contracts with quotes
   → Returns enriched data

2. SET OPTION SYMBOLS
   Frontend (Trading.tsx)
   → Extracts symbols from options chain
   → setOptionSymbols(['SPY251026C00580000', ...])

3. FETCH GREEKS
   Frontend (useOptionsGreeks)
   → Triggered by optionSymbols change
   → POST /api/fetch-market-data { 
       dataType: 'options_greeks',
       symbols: 'SPY251026C00580000,...'
     }
   
   Docker API
   → GET /v1beta1/options/snapshots?symbols=...
   → Returns Greeks + IV for each symbol
   
   Frontend
   → Updates greeks state
   → Trading.tsx merges Greeks into options display
   → Table shows: Strike, Bid, Ask, Delta, Gamma, Theta, Vega, IV

4. WEBSOCKET UPDATES
   Frontend (useDockerWebSocket)
   → Subscribes to option symbols
   
   Alpaca Options WS (OPRA feed)
   → Streams live quotes (MessagePack)
   → Docker API decodes and broadcasts
   
   Frontend
   → Updates bid/ask in real-time
   → Greeks refresh every 5 seconds (polling)
```

**Data Sources:**
- Contracts: Alpaca Broker API (static data)
- Latest Quotes: Alpaca OPRA feed (real-time, API call)
- Greeks: Alpaca Market Data snapshots (polled every 5s)
- Live Quotes: Alpaca OPRA WebSocket (streaming)

---

### Example 3: Backtesting with 0DTE Options
**Scenario:** User runs backtest on SPY 0DTE strategy for Oct 26, 2025

```
1. FETCH HISTORICAL UNDERLYING
   Frontend (useBacktestingData)
   → POST /api/fetch-market-data {
       dataType: 'bars',
       symbol: 'SPY',
       start: '2025-10-26T09:30:00Z',
       end: '2025-10-26T16:00:00Z',
       timeframe: '1min'
     }
   → Receives ~390 1-minute bars

2. FETCH HISTORICAL OPTIONS BARS
   Frontend
   → POST /api/fetch-market-data {
       dataType: 'options_bars_by_dte',
       ticker: 'SPY',
       expiryDate: '251026',  // 0DTE
       start: '2025-10-26T09:30:00Z',
       end: '2025-10-26T16:00:00Z',
       timeframe: '1min',
       strikeRange: 10,
       strikeSpacing: 5
     }
   
   Docker API
   → Analyzes underlying price range (min: 579.50, max: 581.20)
   → Center strike: 580
   → Generates symbols: 570C, 570P, 575C, 575P, ..., 590C, 590P
   → Fetches bars for all 42 symbols
   → Receives data for 28 symbols (14 have liquidity)
   → Total: 15,680 bars (28 symbols × ~560 bars each)
   → Saves to CSV: options_bars_SPY_251026_2025-10-26.csv

3. RUN BACKTEST
   Frontend (Backtesting.tsx)
   → Combines underlying + options bars
   → Executes strategy logic:
     * Entry: When SPY crosses MA, buy ATM call
     * Exit: 15 minutes before close or 50% gain/loss
   → Simulates trades using OHLC data (not bid/ask)
   → Calculates:
     * Total P&L
     * Win rate
     * Sharpe ratio
     * Max drawdown

4. DISPLAY RESULTS
   → Equity curve chart (recharts)
   → Trade list with entry/exit prices
   → Metrics dashboard
```

**Key Differences vs Traditional Backtesting:**
- Uses OHLCV bars (actual trade data) not theoretical bid/ask
- 1-minute granularity for intraday 0DTE strategies
- Individual contract tracking (not just generic calls/puts)
- Realistic slippage based on bar high/low ranges
- DTE-aware: knows contracts expire same day

---

## CSV Data Storage

### Stock Quotes
**File:** `/app/data/stock_quotes_YYYY-MM-DD.csv`  
**Format:**
```
timestamp,symbol,bid,ask,bid_size,ask_size,exchange,conditions,data_source
2025-10-26T15:40:20.123Z,SPY,580.70,580.84,100,100,IEX,,stock_quote
```

### Stock Trades
**File:** `/app/data/stock_trades_YYYY-MM-DD.csv`  
**Format:**
```
timestamp,symbol,price,size,exchange,conditions,data_source
2025-10-26T15:40:20.123Z,SPY,580.75,100,IEX,,stock_trade
```

### Option Quotes
**File:** `/app/data/option_quotes_YYYY-MM-DD.csv`  
**Format:**
```
timestamp,symbol,bid,ask,bid_size,ask_size,timestamp_alpaca,data_source
2025-10-26T15:40:20.123Z,SPY251026C00580000,2.42,2.46,100,150,2025-10-26T15:40:20.387Z,opra_live
```

### Options Bars (Backtesting)
**File:** `/app/data/options_bars_SPY_251026_YYYY-MM-DD.csv`  
**Format:**
```
symbol,timestamp,open,high,low,close,volume,vwap,trade_count
SPY251026C00580000,2025-10-26T09:30:00Z,2.40,2.50,2.38,2.45,1000,2.44,50
```

**Retention:** Daily files, indefinite storage for backtesting

---

## Frontend-Backend Data Structure Mapping

### Stock Bar
**Alpaca API Response:**
```json
{
  "t": "2025-10-26T09:30:00Z",
  "o": 580.50,
  "h": 581.20,
  "l": 580.30,
  "c": 580.90,
  "v": 1234567,
  "vw": 580.75,
  "n": 456
}
```

**Frontend ChartBar (Trading.tsx):**
```typescript
interface ChartBar {
  time: string;        // "9:30 AM"
  timestamp: number;   // Unix seconds for TradingView
  date: string;        // "10/26/2025"
  open: number;        // 580.50
  high: number;        // 581.20
  low: number;         // 580.30
  close: number;       // 580.90
  volume: number;      // 1234567
}
```

**Normalization (normalizeHistoricalBar):**
```typescript
const bar = {
  time: formatTime(alpacaBar.t),
  timestamp: Math.floor(new Date(alpacaBar.t).getTime() / 1000),
  date: formatDate(alpacaBar.t),
  open: alpacaBar.o,
  high: alpacaBar.h,
  low: alpacaBar.l,
  close: alpacaBar.c,
  volume: alpacaBar.v
};
```

### Option Contract
**Backend (server.js):**
```javascript
{
  symbol: 'SPY251026C00580000',
  strike_price: '580.00',
  expiration_date: '2025-10-26',
  type: 'call',
  bid: 2.42,
  ask: 2.46,
  bid_size: 100,
  ask_size: 150,
  last_price: 2.44,
  volume: 5000,
  timestamp: '2025-10-26T15:40:20.123Z',
  data_source: 'opra_feed'
}
```

**Frontend (Trading.tsx):**
```typescript
interface OptionData {
  symbol: string;      // 'SPY251026C00580000'
  strike: string;      // '580C' or '580P'
  bid: string;         // '2.42'
  ask: string;         // '2.46'
  last: string;        // '2.44'
  vol: string;         // '5.0K'
  oi: string;          // Open Interest
  delta: string;       // '0.612' (from Greeks)
  gamma: string;       // '0.087'
  theta: string;       // '-0.152'
  vega: string;        // '0.043'
  iv: string;          // '12.5%'
  itm: boolean;        // true if in-the-money
  expiry: string;      // '10/26/2025'
}
```

### WebSocket Trade Message
**Alpaca Format:**
```json
{
  "T": "t",
  "S": "SPY",
  "p": 580.75,
  "s": 100,
  "t": "2025-10-26T15:40:20.387Z",
  "x": "IEX",
  "c": []
}
```

**Docker API Broadcast:**
```json
{
  "type": "stock_trade",
  "data": {
    "symbol": "SPY",
    "price": 580.75,
    "size": 100,
    "timestamp": "2025-10-26T15:40:20.387Z",
    "exchange": "IEX",
    "conditions": [],
    "data_source": "stock_trade"
  }
}
```

**Frontend State (useDockerWebSocket):**
```typescript
interface TradeData {
  symbol: string;
  price: number;
  size: number;
  timestamp: string;
  exchange?: string;
  conditions?: string[];
  data_source: string;
}
```

---

## Weekend & After-Hours Data Handling

### Problem
- Markets closed on weekends (Saturday/Sunday)
- After-hours: 4:00 PM - 9:30 AM ET (limited data)
- Users want to see "last available" data

### Solution

#### 1. Historical Data (Last 7 Days)
**Endpoint:** `POST /api/fetch-market-data`
```json
{
  "dataType": "bars",
  "symbol": "SPY",
  "start": "2025-10-19T09:30:00Z",  // 7 days ago
  "end": "2025-10-26T16:00:00Z",
  "timeframe": "1Day"
}
```

**Response:** Returns all trading days (excludes weekends)

**Frontend Display:**
- Chart shows last 7 trading days
- Latest bar = most recent market close
- Tooltip: "As of Oct 25, 4:00 PM ET (Market Closed)"

#### 2. Latest Quote Persistence
**Issue:** After hours, latest quote may be stale

**Solution (server.js):**
```javascript
// On market close, save last quote to database
await pool.query(`
  INSERT INTO latest_quotes (symbol, bid, ask, timestamp)
  VALUES ($1, $2, $3, $4)
  ON CONFLICT (symbol) UPDATE SET ...
`);

// On weekend/after-hours request
const cachedQuote = await pool.query(`
  SELECT * FROM latest_quotes WHERE symbol = $1
`);

return {
  ...cachedQuote,
  is_stale: true,
  last_market_close: '2025-10-25T16:00:00Z'
};
```

**Frontend Display:**
```
SPY: $580.75 ⚠️
Last Updated: Oct 25, 4:00 PM ET
Market Closed
```

#### 3. Options Weekend Data
**Challenge:** 0DTE options expire daily, no weekend contracts exist

**Solution:**
- Show "No 0DTE contracts available (Market Closed)"
- Allow viewing 1DTE/2DTE contracts (Monday expiry on weekend)
- Display last known bid/ask with timestamp

**Code (Backtesting.tsx):**
```typescript
const dteInfo = getBestDTE();  // Returns 1DTE on weekends

if (dteInfo.dte === '1DTE' && isWeekend()) {
  message = 'Weekend detected - showing Monday expiry (1DTE)';
}
```

---

## Error Handling & Edge Cases

### 1. API Key Issues
**Scenario:** Invalid or missing Alpaca API keys

**Backend Response:**
```json
{
  "error": "No API keys configured"
}
```

**Frontend Handling:**
```typescript
if (error?.message?.includes('No API keys')) {
  toast.error('Please configure API keys in Settings');
  navigate('/settings');
}
```

### 2. Options 404 (Paper Account)
**Scenario:** Paper accounts can't access some options endpoints

**Backend Response:**
```json
{
  "error": "404 - Options data not available on paper accounts"
}
```

**Frontend Handling:**
```typescript
if (response.status === 404 && dataType === 'options') {
  console.log('⚠️ Options not available on paper account');
  // Show upgrade message
}
```

### 3. WebSocket Disconnection
**Scenario:** Network issue or server restart

**Backend:** Auto-reconnect every 5 seconds
**Frontend:** 
```typescript
ws.onclose = () => {
  setConnected(false);
  setTimeout(() => connectWebSocket(), 5000);
};
```

**User Feedback:**
```
🔴 Disconnected from live data
🟡 Reconnecting... (Attempt 1/5)
🟢 Connected to live data
```

### 4. Rate Limiting
**Scenario:** Too many API requests to Alpaca

**Alpaca Response:** HTTP 429
**Backend Handling:**
```javascript
if (response.status === 429) {
  await new Promise(r => setTimeout(r, 1000));  // Wait 1s
  // Retry request
}
```

### 5. Empty Options Data
**Scenario:** No options available for requested parameters

**Backend Response:**
```json
{
  "data": [],
  "metadata": {
    "reason": "No contracts within strike range"
  }
}
```

**Frontend Display:**
```
No options contracts available
Try widening strike range or selecting different expiration
```

---

## Testing & Debugging

### API Diagnostics Component
**File:** `src/components/ApiDiagnostics.tsx`

**Tests:**
1. Health check (`GET /health`)
2. API key retrieval (`POST /api/test-connection`)
3. Stock quote (`POST /api/fetch-market-data` - quote)
4. Historical bars (`POST /api/fetch-market-data` - bars)
5. Options chain (`POST /api/fetch-market-data` - options)
6. Options Greeks (`POST /api/fetch-market-data` - options_greeks)
7. WebSocket connection (`ws://localhost:3001`)

**Usage:**
```
Settings → Diagnostics Tab → Run Tests
```

**Output:**
```
✅ Health Check: OK
✅ API Keys: Live keys configured
✅ Stock Quote: SPY @ $580.75
✅ Historical Bars: 507 bars loaded
⚠️ Options Chain: 404 (Paper account limitation)
✅ Options Greeks: 12 contracts with Greeks
✅ WebSocket: Connected, 45 messages received
```

### Debug Logging
**Backend (server.js):**
```javascript
console.log('📊 [BACKTESTING] Processing options_bars_by_dte');
console.log('✅ Received 28 symbols with data, 15680 total bars');
console.log('❌ Options bars API error: 404 Not Found');
```

**Frontend (Trading.tsx):**
```typescript
console.log('[TRADING] 🎯 Symbol changed to: SPY');
console.log('[CHART] ✅ Received 507 historical bars');
console.log('[OPTIONS] ⚠️ Paper account - limited data');
```

**Log Prefixes:**
- `📊` - Data fetching
- `✅` - Success
- `❌` - Error
- `⚠️` - Warning
- `🔍` - Debug info
- `📡` - WebSocket
- `💾` - Data storage

### CSV Data Inspection
**Location:** `/app/data/`

**View Files:**
```bash
docker exec -it trading_api ls -lh /app/data/
docker exec -it trading_api head -20 /app/data/stock_trades_2025-10-26.csv
```

**Analyze:**
```bash
# Count trades per symbol
docker exec -it trading_api awk -F',' 'NR>1 {print $2}' /app/data/stock_trades_2025-10-26.csv | sort | uniq -c

# Average trade size
docker exec -it trading_api awk -F',' 'NR>1 {sum+=$4; count++} END {print sum/count}' /app/data/stock_trades_2025-10-26.csv
```

---

## Performance Optimization

### 1. WebSocket Throttling
**Problem:** 100+ quotes/second causes memory issues

**Solution (server.js:1098):**
```javascript
const QUOTE_THROTTLE_MS = 100;
const quoteThrottleMap = new Map();

if (now - lastBroadcast < QUOTE_THROTTLE_MS) {
  return;  // Skip this quote
}
quoteThrottleMap.set(quote.symbol, now);
```

**Result:** Max 10 quotes/symbol/second

### 2. Batch API Requests
**Problem:** Fetching 50 option symbols = 50 API calls

**Solution (server.js:876):**
```javascript
const batchSize = 50;
for (let i = 0; i < symbols.length; i += batchSize) {
  const batch = symbols.slice(i, i + batchSize);
  const symbolsParam = batch.join(',');
  
  const response = await fetch(`/v1beta1/options/quotes/latest?symbols=${symbolsParam}`);
  // Process batch
  
  await new Promise(r => setTimeout(r, 100));  // Rate limiting
}
```

**Result:** 1 API call per 50 symbols

### 3. CSV Async Writes
**Problem:** Synchronous file writes block event loop

**Solution (server.js:56):**
```javascript
fs.appendFile(STOCK_QUOTES_CSV, row, (err) => {
  if (err) console.error('Error writing CSV:', err);
});
```

**Result:** Non-blocking I/O

### 4. Frontend Chart Updates
**Problem:** Re-rendering entire chart on every trade

**Solution (useLiveChartUpdates.ts):**
```typescript
// Direct chart update (bypasses React state)
if (chartSeriesRef.current) {
  chartSeriesRef.current.update(currentBar);
}

// Debounced state update
const debouncedUpdate = debounce(() => {
  setBars(updatedBars);
}, 500);
```

**Result:** Smooth 60fps chart updates

---

## Future Enhancements

### 1. Account & Order Management
**Endpoints to Add:**
- `POST /api/place-order` - Submit orders to Alpaca
- `POST /api/cancel-order` - Cancel pending orders
- `GET /api/account-summary` - Real-time account balance

### 2. Advanced Backtesting
**Endpoints to Add:**
- `POST /api/backtest/run` - Execute multi-day backtest
- `GET /api/backtest/results/:id` - Retrieve results
- `POST /api/backtest/optimize` - Parameter optimization

### 3. Real-time Greeks
**Enhancement:**
- WebSocket stream for live Greeks updates
- Calculate Greeks on backend (Black-Scholes)
- Reduce polling to WebSocket push

### 4. Historical Options Database
**Storage:**
- PostgreSQL tables for options bars
- Indexed by symbol, timestamp, expiry
- Faster backtesting queries

### 5. Multi-Symbol Monitoring
**Enhancement:**
- Watch multiple symbols simultaneously
- Dashboard with mini-charts
- Alert system for price movements

---

## Quick Reference

### Common API Calls

**Get current SPY price:**
```bash
curl -X POST http://localhost:3001/api/fetch-market-data \
  -H 'Content-Type: application/json' \
  -d '{"dataType":"quote","symbol":"SPY"}'
```

**Get SPY options chain:**
```bash
curl -X POST http://localhost:3001/api/fetch-market-data \
  -H 'Content-Type: application/json' \
  -d '{"dataType":"options","symbol":"SPY"}'
```

**Get options Greeks:**
```bash
curl -X POST http://localhost:3001/api/fetch-market-data \
  -H 'Content-Type: application/json' \
  -d '{"dataType":"options_greeks","symbols":"SPY251026C00580000,SPY251026P00580000"}'
```

**Test API connection:**
```bash
curl -X POST http://localhost:3001/api/test-connection \
  -H 'Content-Type: application/json' \
  -d '{"provider":"alpaca","getKeys":true}'
```

### Environment Variables
```bash
# .env.docker
ALPACA_LIVE_API_KEY=PK...
ALPACA_LIVE_API_SECRET=...
DATABASE_URL=postgresql://trader:trading123@database:5432/trading_system
PORT=3001
```

### Docker Commands
```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f trading_api

# Restart API server
docker-compose restart trading_api

# Check WebSocket connections
docker exec -it trading_api netstat -an | grep 3001
```

---

## Conclusion

This API mapping provides a complete view of data flows in the trading system:

✅ **REST APIs** - 6 endpoints for data fetching  
✅ **WebSockets** - 3 connections for real-time streaming  
✅ **CSV Storage** - Historical data persistence  
✅ **OHLCV Data** - Proper backtesting format  
✅ **0DTE/1DTE** - Specialized options handling  
✅ **Weekend Data** - Last available data display  
✅ **Error Handling** - Comprehensive edge case coverage  

**For Implementation Questions:**
- Backend: `docker/api-server/server.js`
- Frontend: `src/lib/dockerApiClient.ts`, `src/hooks/use*.ts`
- WebSocket: `src/hooks/useDockerWebSocket.ts`
- Diagnostics: `src/components/ApiDiagnostics.tsx`
