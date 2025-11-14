# Trade Whisperer Docker Architecture - Research Summary

## Executive Summary

The Trade Whisperer application is built on a sophisticated multi-container Docker architecture designed for high-frequency options trading with real-time data streaming and comprehensive backtesting capabilities.

**Total Documentation:** 2 files
- `DOCKER_ARCHITECTURE.md` - Complete 931-line technical reference
- `DOCKER_QUICK_REFERENCE.md` - Quick lookup guide with examples

---

## Key Findings

### 1. Container Structure

The application uses 4 main containers:

1. **API Server (Port 3001)**
   - Handles live market data from Alpaca
   - Manages WebSocket connections for real-time streaming
   - Logs all market data to timestamped CSV files
   - Dual feed architecture: IEX (stocks) + OPRA (options, MessagePack)

2. **Backtesting Server (Port 3002)**
   - Processes historical market data
   - Executes strategy backtests
   - Calculates options Greeks
   - Implements intelligent DTE selection logic

3. **PostgreSQL Database (Port 5433)**
   - Persists API credentials, trading data, strategies
   - Shared connection between both servers
   - Default credentials: trader/trading123

4. **Redis (Port 6379)**
   - Optional session management and caching
   - Not required for core functionality

### 2. API Architecture

**24 Primary Endpoints:**

**API Server (3001):**
- `/health` - Server status
- `/api/data-files` - List CSV logs
- `/api/fetch-market-data` - 6 data types (bars, quotes, options, greeks, etc.)
- `/api/get-option-quotes` - Batch option quotes (50 max per request)
- `/api/get-recent-trades` - Recent trade history from CSV
- `/api/test-connection` - Verify Alpaca connection

**Backtesting Server (3002):**
- `/health` - Server status
- `/api/fetch-current-options` - Real-time options with auto-DTE
- `/api/fetch-historical-data` - 4 historical data types

### 3. Data Format Specifications

All data is normalized to consistent formats:

**Stock Bars (OHLCV):**
```
t (timestamp), o, h, l, c (prices), v (volume), vw (vwap optional)
```

**Quotes:**
```
symbol, bid, ask, bid_size, ask_size, timestamp, conditions
```

**Options Contracts:**
```
Symbol format: TICKER+YYMMDD+C/P+PRICE (e.g., SPY241220C00670000)
Includes: bid, ask, bid_size, ask_size, implied_vol, greeks
```

**Greek Values:**
```
delta, gamma, vega, theta, rho (calculated via Black-Scholes)
```

### 4. Key Technical Features

**Intelligent Date Logic:**
- 0DTE: Market open before 3:30 PM ET (same-day expiry)
- 1DTE: After hours weekday (next trading day)
- 2DTE: Friday after hours (Monday expiry)
- Auto-detects market hours and selects optimal DTE

**Quote Throttling:**
- 100ms minimum between broadcasts per symbol
- Prevents memory overflow from high-frequency data
- Applies to both stock and options quotes

**Option Symbol Generation:**
- Automatic strike generation around ATM
- Configurable strike spacing (default: $5)
- Configurable strike range (default: 10 strikes each side)
- Proper formatting for Alpaca API: 5 digits dollars + 3 digits cents

**Data Persistence:**
- CSV logging: stock_quotes, stock_trades, option_quotes (timestamped daily)
- PostgreSQL: credentials, strategies, performance metrics
- Docker volumes: persist data across restarts

### 5. WebSocket Communication

**Connection:** `ws://localhost:3001`

**Subscribe Message:**
```json
{
  "action": "subscribe",
  "symbols": ["SPY", "SPY251010C00670000"]
}
```

**Broadcast Messages (4 types):**
- `stock_trade` - Actual executed transactions
- `stock_quote` - Bid/ask and size
- `option_quote` - OPRA feed data
- `connected` - Confirmation message

**Features:**
- Automatic subscription routing (stocks → IEX, options → OPRA)
- Client connection management (automatic cleanup on disconnect)
- Rate limiting to respect Alpaca WebSocket throughput

### 6. Strategy Framework

Strategies are modular JavaScript files with 5 components:

1. **Signal Detection** - Technical indicators + entry conditions
2. **Option Strategy** - Single leg or spreads, signal-based
3. **Contract Selection** - DTE preferences, ATM strike targeting, liquidity filters
4. **Risk Management** - Position sizing, profit targets, stop losses
5. **Performance Tracking** - Win rate, P&L, Sharpe ratio

**Supported Indicators:**
- RSI (multi-period)
- ROC (Rate of Change)
- VWAP (Volume Weighted Average Price)
- VWAP Slope
- MACD
- Volume Analysis
- Volatility

### 7. Environment Configuration

**Required Environment Variables:**
```
DATABASE_URL = PostgreSQL connection string
ALPACA_LIVE_API_KEY, ALPACA_LIVE_API_SECRET = Real trading
ALPACA_PAPER_API_KEY, ALPACA_PAPER_API_SECRET = Backtesting
```

**Docker Compose Integration:**
- Automatic secret injection via .env file
- Container networking via service names (database, api_server)
- Volume mounting for code and data persistence

### 8. Data Storage Locations

**CSV Files:** `/docker/api-server/data/` → mounted to `/app/data/` in container
- Format: `{type}_{symbol}_{YYYY-MM-DD}.csv`
- Auto-created if missing
- Headers: timestamp, symbol, price, size, exchange, conditions, source

**PostgreSQL:** Docker container with persistent `postgres_data` volume
- Default: trader@localhost:5432/trading_system

**Docker Volumes:**
```yaml
postgres_data           # Database persistence
./docker/api-server:/app # Code mount
./data:/app/data        # CSV persistence
```

### 9. Inter-Container Communication

**API Server → Backtesting Server:**
- HTTP POST to `http://backtesting-server:3002/...`
- Docker DNS resolves service names automatically

**API Server → PostgreSQL:**
- Connection string: `postgresql://trader:trading123@database:5432/trading_system`
- Connection pooling via pg library

**External Connections:**
- Alpaca Data API: `https://data.alpaca.markets` (REST)
- Alpaca Broker API: `https://api.alpaca.markets` (REST)
- Alpaca WebSocket: `wss://stream.data.alpaca.markets/v2/iex` (IEX feed)
- Alpaca WebSocket: `wss://stream.data.alpaca.markets/v1beta1/opra` (Options, MessagePack)

### 10. Performance Characteristics

**Throughput:**
- Handles 100ms throttled quotes per symbol
- Supports up to 50 symbols per API batch request
- Pagination for large datasets (1000 items per page)

**Data Volume:**
- Stock quotes: Typically 2-5KB per day per symbol
- Options quotes: 5-10KB per day (highly variable)
- CSV retention: Daily files, manual archival recommended

**API Rate Limits:**
- Subject to Alpaca rate limits (varies by subscription)
- Batch processing implemented to respect limits
- Pagination support for large datasets

### 11. Market Coverage

**Data Availability:**
- Stock data: Real-time during market hours (IEX feed)
- Options data: Real-time during market hours (OPRA feed)
- Historical: Available back to March 2024 (Alpaca limitation)
- Coverage: All NYSE/NASDAQ listed stocks and their options

**Time Coverage:**
- Regular hours: 4 AM - 8 PM ET (IEX feed)
- Overnight: 8 PM - 4 AM ET (requires separate subscription)
- Market-aware: Automatic feed switching at session transitions

---

## Critical Implementation Details

### 1. Option Symbol Decoding

```
SPY241220C00670000
├─ SPY: Ticker
├─ 24: Year (2024)
├─ 12: Month (December)
├─ 20: Day (20th)
├─ C: Call (P for Put)
└─ 00670000: Strike ($670.00)
   ├─ 00670: Dollars (padded to 5 digits)
   └─ 000: Cents (padded to 3 digits)
```

### 2. Black-Scholes Greeks Calculation

Options auditor uses Black-Scholes with:
- IV inversion via Brent's method (tolerance: 0.0001)
- Standard normal CDF approximation
- Proper delta conventions (calls: positive, puts: negative)
- Time-decay theta calculation (daily)

### 3. CSV Data Schema

**Consistency across 3 file types:**
- All timestamps in ISO 8601 format
- Conditions stored as pipe-separated values
- Data source tracked for audit trail
- Headers preserved for reference

### 4. WebSocket Message Flow

```
Frontend
    ↓
    └─→ [/health] TCP health check
    ├─→ [ws://localhost:3001] WebSocket upgrade
    │   ├─→ {action: 'subscribe'} Subscribe message
    │   ├─→ ← {type: 'connected'} Connection confirmation
    │   ├─→ ← {type: 'stock_trade'} Real-time trades
    │   ├─→ ← {type: 'stock_quote'} Real-time quotes
    │   └─→ ← {type: 'option_quote'} Real-time option quotes
```

### 5. DTE Auto-Selection Algorithm

```javascript
const now = moment().tz('America/New_York');
const hour = now.hour();
const day = now.day();

if (weekend) return '1DTE';           // Monday expiry
else if (friday && afterHours) return '2DTE';  // Monday expiry
else if (weekday && afterHours) return '1DTE'; // Next day
else if (marketOpen && beforeClose) {
  if (before3:30PM) return '0DTE';    // Same day
  else return '1DTE';                 // Too late for same-day
}
```

---

## Documentation Files Created

### File 1: DOCKER_ARCHITECTURE.md (931 lines)

**Contents:**
- Complete architecture overview with ASCII diagram
- All 24 API endpoints with request/response schemas
- Detailed data format specifications (8 formats documented)
- CSV logging specifications
- WebSocket communication protocol
- Environment configuration
- Database schema overview
- Container communication patterns
- Strategy framework documentation
- Performance monitoring details
- Deployment checklist
- Troubleshooting guide

### File 2: DOCKER_QUICK_REFERENCE.md (280+ lines)

**Contents:**
- Quick-lookup tables (containers, modules)
- Copy-paste ready curl commands
- JavaScript code examples
- CSV format samples
- Option symbol encoding examples
- DTE logic table
- Environment variable reference
- Common tasks with commands
- Troubleshooting checklist
- Performance notes

---

## Key Insights

1. **Elegant Separation of Concerns:** API server handles real-time streaming, backtesting server handles historical analysis - they share only the database layer

2. **Robust Data Validation:** Options auditor provides independent Greeks calculation for validation against Alpaca data

3. **Market-Aware Intelligence:** DTE auto-selection respects market hours and trading day conventions

4. **Scalable Architecture:** Batch processing (50 symbols), pagination (1000 items), and throttling prevent resource exhaustion

5. **Production-Ready Logging:** All market data persisted to CSV for compliance and analysis

6. **Flexible Strategy Framework:** Modular strategy files with configurable indicators and risk management

---

## Usage Recommendations

1. **For Development:** Use quick reference guide with curl examples
2. **For Integration:** Reference architecture doc for detailed endpoint specs
3. **For Troubleshooting:** Check performance notes and common issues section
4. **For Modifications:** Study strategy framework section for adding new features

---

## Files Generated

- `/DOCKER_ARCHITECTURE.md` - Complete technical reference (931 lines)
- `/DOCKER_QUICK_REFERENCE.md` - Quick lookup guide with examples
- `/RESEARCH_SUMMARY.md` - This file (overview and index)

All files are in project root: `/Users/demierminor/Desktop/trade-whisperer-89/`

