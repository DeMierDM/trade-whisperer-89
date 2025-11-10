# Data Flow Architecture Mapping
Trade Whisperer System - Live vs Historical Data Separation

## Executive Overview

This document maps the complete data flow architecture for Trade Whisperer, defining clear separation between live trading data, paper trading data, and historical backtesting data across all application tabs.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRADE WHISPERER FRONTEND                     │
│                         (Port 8080)                            │
├─────────────────────────────────────────────────────────────────┤
│  Trading Tab    │  Backtesting Tab  │  Optimizer Tab (Tuning)  │
│  (Live Data)    │  (Live + Historical) │  (Historical Only)    │
└─────────────────────────────────────────────────────────────────┘
               │                │                   │
               ▼                ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DATA ROUTING LAYER                          │
│                   (API Configuration)                          │
└─────────────────────────────────────────────────────────────────┘
               │                │                   │
               ▼                ▼                   ▼
┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐
│   Main API       │  │  Backtesting     │  │ Options Data    │
│   Server         │  │  Server          │  │ Service         │
│   (Port 3001)    │  │  (Port 3002)     │  │ (Port 3003)     │
│                  │  │                  │  │                 │
│ • Live WebSocket │  │ • Historical API │  │ • Cached Options│
│ • Real-time Data │  │ • Backtest Exec  │  │ • Chain Data    │
│ • Paper Trading  │  │ • Performance    │  │ • Greeks Calc   │
└──────────────────┘  └──────────────────┘  └─────────────────┘
               │                │                   │
               ▼                ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ALPACA APIs                               │
│                                                                 │
│  Live Data Stream     Paper Trading API    Historical Data API │
│  (WebSocket)          (REST)               (REST)              │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow by Application Tab

### 1. Trading Tab - Live Data Only

**Purpose**: Real-time trading with live market data
**Data Types**: Live quotes, real-time options data, market status
**Update Frequency**: Real-time (WebSocket)

#### Data Sources:
```javascript
// Primary Data Flow
Trading Tab → Main API Server (3001) → Alpaca Live WebSocket

// Data Types:
- Stock Quotes (real-time)
- Options Quotes (real-time) 
- Market Status (live)
- Paper Trading Positions (live)
- Order Status (real-time)
```

#### Implementation Details:
```typescript
// Trading.tsx Data Flow
const {
  quotes,           // Live stock quotes via WebSocket
  recentTrades,     // Live trade executions
  connected,        // WebSocket connection status
  lastError        // Real-time error handling
} = useDockerWebSocket(selectedSymbol);

// Live chart updates
const chartApiRef = useRef<ChartUpdateAPI | null>(null);
useLiveChartUpdates(quotes, chartApiRef);
```

#### API Endpoints Used:
- `ENDPOINTS.WEBSOCKET` (ws://localhost:3001/ws)
- `ENDPOINTS.MARKET_DATA` (live quotes)
- `ENDPOINTS.ACCOUNT_INFO` (paper trading balance)

### 2. Backtesting Tab - Live + Historical Data

**Purpose**: Strategy backtesting with historical data + live paper trading
**Data Types**: Historical OHLCV, live paper trading, backtest results
**Update Frequency**: Historical (on-demand), Live paper trading (real-time)

#### Data Sources:
```javascript
// Dual Data Flow Architecture
Backtesting Tab → {
  // Historical Data Path
  Backtesting Server (3002) → Alpaca Historical API
  
  // Live Paper Trading Path  
  Main API Server (3001) → Alpaca Paper Trading API
}

// Data Separation:
- Historical: OHLCV bars, options history, market data
- Live: Paper trading positions, live option quotes for validation
```

#### Implementation Details:
```typescript
// Backtesting.tsx Data Flow
const { 
  loading,
  results,
  runBacktest     // Historical backtest execution
} = useBacktest();

const { 
  loading: dataLoading,
  data: historicalData,
  fetchHistoricalData  // Historical data fetching
} = useBacktestingData();

// Live paper trading WebSocket (for validation/monitoring)
const { 
  quotes: liveQuotes,
  connected: liveConnected 
} = useDockerWebSocket(selectedSymbol);
```

#### API Endpoints Used:
- `ENDPOINTS.BACKTEST` (historical strategy execution)
- `ENDPOINTS.HISTORICAL_DATA` (historical OHLCV + options)
- `ENDPOINTS.WEBSOCKET` (live paper trading validation)
- `ENDPOINTS.PERFORMANCE_METRICS` (backtest analytics)

### 3. Optimizer Tab (Tuning) - Historical Data Only

**Purpose**: Strategy parameter optimization using historical data
**Data Types**: Historical market data, optimization results, parameter studies
**Update Frequency**: Batch processing (on-demand)

#### Data Sources:
```javascript
// Historical Data Only Path
Optimizer Tab → Backtesting Server (3002) → {
  Historical OHLCV Data
  Options Historical Data
  Walk-Forward Analysis Data
}

// No Live Data Dependencies
```

#### Implementation Details:
```typescript
// Tuning.tsx Data Flow
const { 
  loading,
  results,        // Optimization results
  progress,       // Study progress tracking
  startOptimization  // Historical optimization only
} = useOptimizer();

// Configuration for historical-only processing
const config = {
  strategy: 'HAVWAP-Rev-v2',
  startDate: '2024-01-01',  // Historical range
  endDate: '2024-03-28',    // Historical range
  walkForwardFolds: 4,      // Historical validation
  trialBudget: 50
};
```

#### API Endpoints Used:
- `ENDPOINTS.OPTIMIZE` (parameter optimization)
- `ENDPOINTS.HISTORICAL_DATA` (bulk historical data)
- `ENDPOINTS.PERFORMANCE_METRICS` (optimization analytics)

## Data Type Classification

### Live Data (Real-time)
- **Source**: Alpaca Live WebSocket
- **Latency**: < 100ms
- **Used By**: Trading Tab
- **Characteristics**: 
  - Real-time stock quotes
  - Live options prices
  - Market status updates
  - Paper trading positions

### Paper Trading Data (Live)
- **Source**: Alpaca Paper Trading API
- **Latency**: < 1 second (REST API)
- **Used By**: Trading Tab, Backtesting Tab (validation)
- **Characteristics**:
  - Simulated positions
  - Paper account balance
  - Order status tracking
  - Risk management alerts

### Historical Data (Batch)
- **Source**: Alpaca Historical Data API
- **Latency**: 1-10 seconds (depending on range)
- **Used By**: Backtesting Tab, Optimizer Tab
- **Characteristics**:
  - OHLCV bars (1min to daily)
  - Historical options data
  - Corporate actions
  - Dividend adjustments

## Service Responsibilities

### Main API Server (Port 3001)

**Primary Role**: Live data aggregation and WebSocket management

```javascript
// Live Data Responsibilities
- WebSocket connection to Alpaca
- Real-time quote broadcasting
- Paper trading API integration
- Market status monitoring
- Live options data streaming

// Endpoints Provided:
- GET /health
- WS /ws (live data stream)
- GET /api/fetch-market-data
- GET /api/account
- GET /api/get-recent-trades
```

### Backtesting Server (Port 3002)

**Primary Role**: Historical data processing and strategy execution

```javascript
// Historical Data Responsibilities
- Historical OHLCV data fetching
- Strategy backtesting execution
- Options historical data processing
- Performance metrics calculation
- Walk-forward analysis

// Endpoints Provided:
- GET /health
- POST /api/backtest
- GET /api/fetch-historical-data
- POST /api/optimize
- GET /api/performance-metrics
```

### Options Data Service (Port 3003)

**Primary Role**: Dedicated options data management

```javascript
// Options Data Responsibilities
- Options chain data caching
- Greeks calculations
- Strike price filtering
- Options historical data
- Bulk options data processing

// Endpoints Provided:
- GET /health
- GET /api/options/chain/{ticker}
- GET /api/options/bars/{ticker}
- GET /api/options/quotes/{ticker}
- POST /api/options/bulk
```

## Data Caching Strategy

### Redis Caching Architecture

```javascript
// Cache Hierarchy by Data Type
const CACHE_STRATEGY = {
  // Live Data - No Caching (real-time)
  liveQuotes: { cache: false, reason: 'Real-time required' },
  liveMarketStatus: { cache: false, reason: 'Real-time required' },
  
  // Options Data - Short-term Caching
  optionsChain: { ttl: 300, reason: 'Chain changes infrequently' },
  optionsQuotes: { ttl: 60, reason: 'Prices change rapidly' },
  
  // Historical Data - Long-term Caching
  historicalBars: { ttl: 3600, reason: 'Historical data is immutable' },
  optionsHistory: { ttl: 3600, reason: 'Historical data is immutable' },
  
  // Performance Data - Medium-term Caching
  backtestResults: { ttl: 1800, reason: 'Compute-intensive results' },
  optimizationResults: { ttl: 3600, reason: 'Very compute-intensive' }
};
```

### Cache Implementation:

```javascript
// Options Data Service Caching
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

async function getCachedData(key, fetchFunction, ttl) {
  const cached = await redisClient.get(key);
  if (cached) {
    return JSON.parse(cached);
  }
  
  const data = await fetchFunction();
  await redisClient.setEx(key, ttl, JSON.stringify(data));
  return data;
}
```

## Chart Data Integration

### TradingView Chart Data Sources

```typescript
// Chart Data Flow by Tab
const CHART_DATA_SOURCES = {
  Trading: {
    dataSource: 'live',
    updateMethod: 'websocket',
    chartRef: 'tradingChartRef',
    dataTypes: ['live_quotes', 'live_bars']
  },
  
  Backtesting: {
    dataSource: 'historical',
    updateMethod: 'batch',
    chartRef: 'backtestChartRef', 
    dataTypes: ['historical_bars', 'backtest_signals']
  },
  
  Optimizer: {
    dataSource: 'results',
    updateMethod: 'batch',
    chartRef: 'optimizationChartRef',
    dataTypes: ['performance_metrics', 'parameter_studies']
  }
};
```

### Chart Update Mechanisms:

```typescript
// Live Chart Updates (Trading Tab)
const useLiveChartUpdates = (quotes: any, chartRef: any) => {
  useEffect(() => {
    if (quotes && chartRef.current) {
      chartRef.current.updateQuote(quotes);
    }
  }, [quotes, chartRef]);
};

// Historical Chart Updates (Backtesting Tab)
const useHistoricalChartData = (historicalData: any, chartRef: any) => {
  useEffect(() => {
    if (historicalData && chartRef.current) {
      chartRef.current.setHistoricalData(historicalData);
    }
  }, [historicalData, chartRef]);
};
```

## Error Handling & Failover

### Data Source Failover Strategy

```javascript
// Failover Hierarchy
const FAILOVER_STRATEGY = {
  live_data: {
    primary: 'alpaca_websocket',
    secondary: 'alpaca_rest_polling',
    fallback: 'cached_last_known'
  },
  
  historical_data: {
    primary: 'alpaca_historical_api',
    secondary: 'cached_historical_data',
    fallback: 'sample_data'
  },
  
  options_data: {
    primary: 'options_data_service',
    secondary: 'main_api_server',
    fallback: 'cached_options_data'
  }
};
```

### Error Handling Implementation:

```typescript
// Centralized Error Handling
const handleDataSourceError = (source: string, error: Error) => {
  console.error(`Data source error [${source}]:`, error);
  
  // Implement failover logic
  switch(source) {
    case 'websocket':
      // Fall back to REST polling
      return switchToRestPolling();
    case 'historical_api':
      // Use cached data
      return loadCachedHistoricalData();
    default:
      // Show user-friendly error
      toast.error(`Data temporarily unavailable: ${source}`);
  }
};
```

## Performance Optimization

### Data Loading Optimization

```typescript
// Parallel Data Loading
const loadPageData = async (tab: string) => {
  switch(tab) {
    case 'trading':
      return Promise.all([
        loadLiveQuotes(),
        loadMarketStatus(),
        loadAccountInfo()
      ]);
      
    case 'backtesting':
      return Promise.all([
        loadHistoricalData(),
        loadBacktestResults(),
        initializeLivePaperTrading()
      ]);
      
    case 'optimizer':
      return Promise.all([
        loadOptimizationHistory(),
        loadParameterDefaults()
      ]);
  }
};
```

### Memory Management

```javascript
// Data Cleanup Strategy
const DATA_CLEANUP = {
  live_data: {
    maxAge: 30000, // 30 seconds
    cleanupInterval: 5000 // 5 seconds
  },
  
  historical_data: {
    maxMemoryMB: 100,
    compressionEnabled: true
  },
  
  chart_data: {
    maxPoints: 5000,
    downsamplingEnabled: true
  }
};
```

## Security & Compliance

### Data Access Control

```typescript
// API Access Control by Data Type
const ACCESS_CONTROL = {
  live_data: {
    requiresAuth: true,
    rateLimit: '100/minute',
    allowedSources: ['trading_tab']
  },
  
  historical_data: {
    requiresAuth: true,
    rateLimit: '50/minute',
    allowedSources: ['backtesting_tab', 'optimizer_tab']
  },
  
  paper_trading: {
    requiresAuth: true,
    rateLimit: '200/minute',
    allowedSources: ['trading_tab', 'backtesting_tab']
  }
};
```

### Data Privacy

```javascript
// Sensitive Data Handling
const SENSITIVE_DATA_RULES = {
  api_keys: 'environment_variables_only',
  account_balance: 'encrypted_transmission',
  trading_history: 'local_storage_encrypted',
  optimization_results: 'cache_with_ttl'
};
```

## Implementation Status & Next Steps

### ✅ Completed
- Docker hot reload implementation
- Alpaca API compliance verification
- Centralized API configuration
- Basic data flow separation

### 🔄 In Progress
- Data flow architecture mapping (this document)

### 📋 Next Steps
1. **TradingView Chart Restoration**
   - Implement separate chart instances per tab
   - Configure data source routing per chart
   - Add chart data synchronization

2. **Options Data Infrastructure**
   - Complete options data service implementation
   - Add bulk data processing endpoints
   - Implement advanced caching strategies

3. **Integration Testing**
   - Test data flow separation
   - Validate performance under load
   - Verify error handling and failover

## Configuration Examples

### Environment Variables by Service

```bash
# Main API Server (.env.docker)
ALPACA_API_KEY=AKTL8AR39NTFB1N7LCZO
ALPACA_SECRET_KEY=kPO2bEqUOdCfFTpnPKtclAd0JrUW2ii8q868Mhvf
ALPACA_BASE_URL=https://paper-api.alpaca.markets
WEBSOCKET_PORT=3001
REDIS_URL=redis://redis:6379

# Backtesting Server 
DATABASE_URL=postgresql://trader:trading123@database:5432/trading_system
HISTORICAL_DATA_CACHE_TTL=3600
BACKTEST_WORKERS=4

# Options Data Service
REDIS_URL=redis://redis:6379
OPTIONS_CACHE_TTL=300
RATE_LIMIT_PER_MINUTE=200
```

### API Configuration Updates

```typescript
// Updated apiConfig.ts for data flow separation
export const DATA_FLOW_CONFIG = {
  TRADING_TAB: {
    primary_source: 'MAIN_API',
    data_types: ['live_quotes', 'market_status', 'paper_positions'],
    update_method: 'websocket',
    fallback: 'rest_polling'
  },
  
  BACKTESTING_TAB: {
    primary_source: 'BACKTESTING_SERVER',
    data_types: ['historical_bars', 'backtest_results'],
    update_method: 'batch_processing',
    live_validation: 'MAIN_API'
  },
  
  OPTIMIZER_TAB: {
    primary_source: 'BACKTESTING_SERVER',
    data_types: ['historical_data_only'],
    update_method: 'batch_processing',
    live_data: 'disabled'
  }
};
```

---

**Document Status**: ✅ Complete
**Last Updated**: 2025-10-26T16:50:00.000Z
**Next Review**: When implementing TradingView chart restoration

This comprehensive data flow architecture ensures clear separation of concerns, optimal performance, and maintainable code structure across all application components.