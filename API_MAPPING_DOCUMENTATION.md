# Trade Whisperer API Mapping Documentation

## System Architecture Overview

The Trade Whisperer system consists of:
- **Frontend**: React + Vite + TypeScript application (port 8080)
- **Main API Server**: Express.js with WebSocket support (port 3001)
- **Backtesting Server**: Dedicated backtesting operations (port 3002)

## API Endpoints Mapping

### Main API Server (port 3001)
Base URL: `http://localhost:3001`

#### Core Endpoints
| Method | Endpoint | Purpose | Request Body | Response |
|--------|----------|---------|--------------|----------|
| GET | `/health` | Health check | None | `{ status: 'ok', timestamp: string }` |
| GET | `/api/data-files` | CSV data file management | None | File information |
| POST | `/api/test-connection` | Test Alpaca connection | Credentials | Connection status |
| GET | `/api/keys/:provider` | API key management | None | Key configuration |
| POST | `/api/fetch-market-data` | **Primary data endpoint** | `{ dataType: string, ...params }` | Market data |
| POST | `/api/get-option-quotes` | Options quote data | `{ symbols: string[] }` | Options quotes |
| POST | `/api/get-recent-trades` | Recent trade data | Trade parameters | Trade history |

#### WebSocket Connection
- **URL**: `ws://localhost:3001`
- **Purpose**: Real-time market data streaming
- **Data Types**: Stock quotes, option quotes, trade updates
- **Throttling**: 100ms per symbol to prevent memory overflow

### Backtesting Server (port 3002)
Base URL: `http://localhost:3002`

#### Specialized Endpoints
| Method | Endpoint | Purpose | Request Body | Response |
|--------|----------|---------|--------------|----------|
| GET | `/health` | Health check | None | `{ status: 'ok', service: 'backtesting-server' }` |
| POST | `/api/fetch-current-options` | **0DTE/1DTE Optimal Options** | `{ ticker, strikeRange, strikeSpacing }` | Options data with DTE logic |
| POST | `/api/fetch-historical-data` | **Historical Backtesting Data** | `{ dataType, symbol, start, end, ...params }` | Historical data |

## Frontend-Backend Communication Patterns

### Current Configuration Issues ⚠️

1. **Port Mismatch Detected**:
   - Frontend `DOCKER_API_URL = 'http://localhost:3001/api'`
   - Backtesting server runs on port 3002
   - **Fix needed**: Route backtesting calls to correct port

2. **API Call Patterns**:
   ```typescript
   // Current frontend calls (all to port 3001)
   History.tsx: fetch("http://localhost:3001/api/fetch-market-data")
   ApiDiagnostics.tsx: fetch(`${DOCKER_API_URL}/fetch-market-data`)
   useDockerWebSocket: new WebSocket('ws://localhost:3001')
   ```

### Data Type Parameters for /api/fetch-market-data

The main endpoint accepts different `dataType` parameters:

| dataType | Purpose | Additional Parameters | Response |
|----------|---------|----------------------|----------|
| `"account"` | Account information | None | Account details, equity, buying power |
| `"quote"` | Stock quotes | `{ symbol: string }` | Real-time stock quotes |
| `"bars"` | Historical bars | `{ symbol, timeframe, start, end }` | OHLCV historical data |
| `"options"` | Options contracts | `{ symbol, expiration?, strike? }` | Options chain data |
| `"orders"` | Order history | `{ start?, end?, status? }` | Trade history |
| `"positions"` | Current positions | None | Open positions |

## Intelligent DTE Logic (Backtesting Server)

### getBestDTE() Function Logic
Smart decision-making for 0DTE vs 1DTE vs 2DTE options:

```javascript
// Market Hours: 9:30 AM - 4:00 PM ET
// Near Close Cutoff: 3:30 PM (stop 0DTE trading)

Weekend (Sat/Sun) → 1DTE (target Monday)
Weekday + Market Open + Before 3:30 PM → 0DTE (same-day expiry)
Weekday + Market Open + After 3:30 PM → 1DTE (next day safer)
Friday + After Hours → 2DTE (target Monday)
Other Weekday + After Hours → 1DTE (next trading day)
Before Market Open → 0DTE (pre-market, same day)
```

### Expiration Date Calculation
- **0DTE**: Same day if trading day, else next Monday
- **1DTE**: Next trading day (skip weekends)
- **2DTE**: Two trading days out (for Friday after hours)

## Data Logging and CSV Storage

### CSV Files (stored in `/app/data/`)
- `stock_quotes_YYYY-MM-DD.csv`: Real-time stock quotes
- `stock_trades_YYYY-MM-DD.csv`: Stock trade executions
- `option_quotes_YYYY-MM-DD.csv`: Options quote data

### Headers Structure
```csv
# Stock Quotes
timestamp,symbol,bid,ask,bid_size,ask_size,exchange,conditions,data_source

# Stock Trades  
timestamp,symbol,price,size,exchange,conditions,data_source

# Option Quotes
timestamp,symbol,bid,ask,bid_size,ask_size,timestamp_alpaca,data_source
```

## WebSocket Data Flow

### Connection Management
```typescript
// Frontend WebSocket Hook
const ws = new WebSocket('ws://localhost:3001');

// Throttling: 100ms per symbol
const quoteThrottleMap = new Map();
const QUOTE_THROTTLE_MS = 100;
```

### Message Types
- Stock quotes with bid/ask/size data
- Option quotes with Greeks calculations  
- Trade executions and updates
- Connection status and heartbeat

## Database Integration

### PostgreSQL Connection
```javascript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
```

### Current Status
- ✅ Connection established
- ⚠️ Database warnings present but functional
- 📊 Used for historical data storage and retrieval

## Options Data Handling Specifics

### OHLCV vs Bid/Ask Strategy
Based on Lambda Class research for 0-1 DTE trading:

1. **Historical Backtesting**: Uses OHLCV bars data
2. **Real-time Trading**: Uses bid/ask for execution
3. **Options Data**: Alpaca v1beta1 options bars API
4. **Strike Selection**: Dynamic around ATM with configurable range

### Contract Symbol Format
```
Alpaca Format: {TICKER}{YYMMDD}{C|P}{5-digit-dollars}{3-digit-cents}
Example: SPY251128C00600000 (SPY Nov 28, 2025 $600 Call)
```

## Required Fixes and Improvements

### 1. Port Routing Fix
```typescript
// Create router to handle backtesting calls
const backtestingApiUrl = 'http://localhost:3002/api';
const mainApiUrl = 'http://localhost:3001/api';

// Route based on endpoint type
function getApiUrl(endpoint: string) {
  const backtestingEndpoints = [
    'fetch-current-options',
    'fetch-historical-data'
  ];
  
  return backtestingEndpoints.some(ep => endpoint.includes(ep)) 
    ? backtestingApiUrl 
    : mainApiUrl;
}
```

### 2. Weekend Data Handling
```typescript
// Ensure 7-day historical data retention
// Show last available bid/ask for options
// Display data freshness indicators
```

### 3. Visual Testing Integration
```typescript
// Cypress, Playwright, Selenium setup needed
// Screenshot-based validation workflows
// Automated regression testing
```

## Environment Variables Required

```bash
# Alpaca API Keys
ALPACA_PAPER_API_KEY=
ALPACA_PAPER_API_SECRET=
ALPACA_LIVE_API_KEY=
ALPACA_LIVE_API_SECRET=

# Database
DATABASE_URL=postgresql://user:pass@host:port/db

# Server Ports
PORT=3001  # Main API Server
# Backtesting server uses 3002
```

## Next Steps for Implementation

1. **Fix port routing** for backtesting endpoints
2. **Set up visual testing** with Cypress/Playwright/Selenium
3. **Verify 0-1 DTE logic** with real market data
4. **Test WebSocket reliability** during market hours and weekends
5. **Implement Lambda Class insights** for options backtesting
6. **Create screenshot-based audit workflows**
7. **Optimize weekend data display** and freshness indicators

---

*Last Updated: $(date)*
*Generated by API Mapping Agent*