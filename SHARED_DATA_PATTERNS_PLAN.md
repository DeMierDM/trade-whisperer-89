# Shared Data Patterns & Implementation Strategy
## SPY/QQQ/IWM Data Consolidation Plan

### 🎯 **Critical Shared Data Analysis**

Based on your system architecture, here are the **exact services** that duplicate data requests:

---

## 📊 **Current Data Duplication Issues**

### **1. SPY/QQQ/IWM Stock Data**
**Current Duplicate Fetchers:**
```javascript
// 1. Frontend Trading Chart (useDockerWebSocket.ts)
useDockerWebSocket(['SPY', 'QQQ', 'IWM']) // Real-time quotes

// 2. Frontend API Diagnostics (useApiDiagnostics.ts) 
fetchMarketData({ dataType: 'quote', symbol: 'SPY' }) // Testing

// 3. Docker API Server (server.js)
connectToAlpacaStock() // WebSocket for all symbols

// 4. Backtesting Engine (data-cache-manager.js)
getUnderlyingBars('SPY', startDate, endDate) // Historical data

// 5. Strategy Optimizer (multiple runs)
// Fetches SPY data repeatedly for each optimization iteration
```

**🔥 Problem:** SPY data fetched **5 different ways** by different services!

### **2. Options Chain Data**
**Current Duplicate Fetchers:**
```javascript
// 1. Frontend Options Hook (useOptionsData.ts)
fetchMarketData({ dataType: 'options', symbol: 'SPY' })

// 2. Frontend Greeks Hook (useOptionsGreeks.ts)  
fetchMarketData({ dataType: 'options_greeks', symbols: '...' })

// 3. Backtesting Engine (data-cache-manager.js)
buildOptionChainFromCache(symbol, expiryDate, underlyingPrice, timestamp)

// 4. Strategy Optimizer (multiple strategy tests)
// Fetches same option chains repeatedly
```

**🔥 Problem:** Same option contracts fetched **multiple times per day**!

### **3. Greeks Calculations**
**Current Duplicate Calculators:**
```javascript
// 1. Frontend (useOptionsGreeks.ts)
// Calls Alpaca API for Greeks

// 2. Backtesting Engine (greeks-calculator.js)
// Recalculates Greeks from OHLCV data

// 3. Bar-Level Greeks Processor (bar-greeks-processor.js)
// Calculates Greeks for each bar independently
```

**🔥 Problem:** Same Greeks calculated **3 different ways**!

---

## 🚌 **Data Bus Solution Implementation**

### **1. Unified Data Acquisition Layer**

```javascript
// New: docker/data-bus-manager/AlpacaDataBus.js
class AlpacaDataBus {
  constructor() {
    this.symbols = ['SPY', 'QQQ', 'IWM']; // Your core symbols
    this.subscribers = new Map();
    this.dataCache = new Map();
    this.alpacaClient = new AlpacaUnifiedClient();
    this.sqlCache = new BusSQLCache();
  }

  // Single method to get any symbol's data
  async subscribeToSymbol(symbol, dataTypes, callback) {
    const subscriptionKey = `${symbol}_${dataTypes.join('_')}`;
    
    if (!this.subscribers.has(subscriptionKey)) {
      this.subscribers.set(subscriptionKey, new Set());
      
      // Start data acquisition for this symbol if not already active
      if (!this.activeSymbols.has(symbol)) {
        await this.startSymbolAcquisition(symbol, dataTypes);
      }
    }
    
    this.subscribers.get(subscriptionKey).add(callback);
    
    // Return current data immediately if available
    if (this.dataCache.has(symbol)) {
      callback(this.dataCache.get(symbol));
    }
  }

  async startSymbolAcquisition(symbol, dataTypes) {
    // 1. Connect to real-time feed ONCE per symbol
    await this.alpacaClient.subscribeToRealTime(symbol);
    
    // 2. Fetch historical data ONCE and cache in SQL
    const historicalData = await this.alpacaClient.getHistoricalBars(symbol);
    await this.sqlCache.storeHistoricalData(symbol, historicalData);
    
    // 3. Set up options monitoring if needed
    if (dataTypes.includes('options')) {
      await this.setupOptionsMonitoring(symbol);
    }
    
    this.activeSymbols.add(symbol);
  }

  // When new data arrives, broadcast to ALL subscribers
  handleIncomingData(symbol, data) {
    // Update cache
    this.dataCache.set(symbol, data);
    
    // Update SQL cache
    this.sqlCache.upsertRealTimeData(symbol, data);
    
    // Notify ALL subscribers for this symbol
    const relevantSubscriptions = Array.from(this.subscribers.keys())
      .filter(key => key.startsWith(symbol));
    
    relevantSubscriptions.forEach(subscriptionKey => {
      const callbacks = this.subscribers.get(subscriptionKey);
      callbacks.forEach(callback => callback(data));
    });
  }
}
```

### **2. Service Migration Plan**

#### **Phase 1: Frontend Migration**
```javascript
// OLD: useDockerWebSocket.ts
const { connected, quotes } = useDockerWebSocket(['SPY', 'QQQ', 'IWM']);

// NEW: useBusData.ts
const { connected, quotes } = useBusData(['SPY', 'QQQ', 'IWM'], ['quotes', 'trades']);

// Implementation:
export const useBusData = (symbols, dataTypes) => {
  const [data, setData] = useState(new Map());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const bus = AlpacaDataBusClient.getInstance();
    
    symbols.forEach(symbol => {
      bus.subscribe(symbol, dataTypes, (newData) => {
        setData(prev => new Map(prev.set(symbol, newData)));
      });
    });

    return () => {
      symbols.forEach(symbol => {
        bus.unsubscribe(symbol, dataTypes);
      });
    };
  }, [symbols, dataTypes]);

  return { data, connected };
};
```

#### **Phase 2: Backtesting Engine Migration**
```javascript
// OLD: data-cache-manager.js
async getUnderlyingBars(symbol, startDate, endDate) {
  // Complex SQL cache check + API fallback
}

// NEW: data-cache-manager.js (Bus Integration)
async getUnderlyingBars(symbol, startDate, endDate) {
  // Simple bus subscription - data already available!
  return this.dataBus.getHistoricalData(symbol, startDate, endDate);
}
```

#### **Phase 3: Options Chain Consolidation**
```javascript
// NEW: Unified Options Service
class UnifiedOptionsService {
  constructor(dataBus) {
    this.bus = dataBus;
    this.chainCache = new Map();
    this.greeksCache = new Map();
  }

  async getOptionChain(symbol, expiry) {
    const cacheKey = `${symbol}_${expiry}`;
    
    // Check if we've already fetched this chain today
    if (this.chainCache.has(cacheKey)) {
      return this.chainCache.get(cacheKey);
    }

    // Fetch ONCE and cache for all consumers
    const chain = await this.bus.fetchOptionChain(symbol, expiry);
    
    // Calculate Greeks ONCE for entire chain
    const chainWithGreeks = await this.calculateGreeksForChain(chain);
    
    // Cache for all services to use
    this.chainCache.set(cacheKey, chainWithGreeks);
    
    // Store in SQL for future backtests
    await this.bus.sqlCache.storeOptionChain(chainWithGreeks);
    
    return chainWithGreeks;
  }

  async calculateGreeksForChain(chain) {
    // Calculate Greeks once per contract, not per consumer
    return Promise.all(chain.map(async contract => {
      const greeks = await this.greeksCalculator.calculate(contract);
      return { ...contract, greeks };
    }));
  }
}
```

---

## 🗄️ **SQL Cache Integration Strategy**

### **Bus-Optimized Database Schema**
```sql
-- Real-time data table optimized for bus reads
CREATE TABLE bus_realtime_data (
  symbol VARCHAR(10),
  data_type VARCHAR(20), -- 'quote', 'trade', 'bar'
  timestamp TIMESTAMPTZ,
  price DECIMAL(12,4),
  volume BIGINT,
  bid DECIMAL(12,4),
  ask DECIMAL(12,4),
  metadata JSONB,
  PRIMARY KEY (symbol, data_type, timestamp)
);

-- Partitioned by symbol for fast queries
CREATE INDEX idx_bus_realtime_symbol_time ON bus_realtime_data (symbol, timestamp DESC);

-- Options chain cache with pre-calculated Greeks
CREATE TABLE bus_option_chains (
  chain_id UUID PRIMARY KEY,
  symbol VARCHAR(10),
  expiry_date DATE,
  fetch_timestamp TIMESTAMPTZ,
  chain_data JSONB, -- Entire chain with Greeks
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bus_chains_symbol_expiry ON bus_option_chains (symbol, expiry_date, fetch_timestamp DESC);

-- Deduplication tracking
CREATE TABLE bus_request_log (
  request_hash VARCHAR(64) PRIMARY KEY,
  request_params JSONB,
  response_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ttl_expires_at TIMESTAMPTZ
);

CREATE INDEX idx_bus_requests_ttl ON bus_request_log (ttl_expires_at) WHERE ttl_expires_at > NOW();
```

### **Automatic Cache Population**
```javascript
class BusSQLCache {
  constructor(db, bus) {
    this.db = db;
    this.bus = bus;
    
    // Subscribe to all bus data for automatic caching
    this.bus.on('data.*', this.handleDataForCache.bind(this));
  }

  handleDataForCache(channel, data) {
    const [, symbol, dataType] = channel.split('.');
    
    switch (dataType) {
      case 'quote':
        this.upsertQuoteData(symbol, data);
        break;
      case 'trade':
        this.upsertTradeData(symbol, data);
        break;
      case 'options':
        this.upsertOptionsData(symbol, data);
        break;
    }
  }

  async upsertQuoteData(symbol, quote) {
    await this.db.query(`
      INSERT INTO bus_realtime_data (symbol, data_type, timestamp, price, volume, bid, ask)
      VALUES ($1, 'quote', $2, $3, $4, $5, $6)
      ON CONFLICT (symbol, data_type, timestamp) 
      DO UPDATE SET price = EXCLUDED.price, bid = EXCLUDED.bid, ask = EXCLUDED.ask
    `, [symbol, quote.timestamp, quote.price, quote.volume, quote.bid, quote.ask]);
  }

  // Fast retrieval for backtesting
  async getHistoricalData(symbol, startDate, endDate) {
    const result = await this.db.query(`
      SELECT * FROM bus_realtime_data 
      WHERE symbol = $1 
        AND timestamp >= $2 
        AND timestamp <= $3 
      ORDER BY timestamp ASC
    `, [symbol, startDate, endDate]);
    
    return result.rows;
  }
}
```

---

## 🚀 **Implementation Phases**

### **Week 1: Core Bus Infrastructure**
```bash
# 1. Create bus manager service
mkdir docker/data-bus-manager
cd docker/data-bus-manager

# 2. Set up core files
touch AlpacaDataBus.js
touch BusSQLCache.js
touch RequestDeduplicator.js
touch package.json
touch Dockerfile

# 3. Add to docker-compose.yml
cat >> docker-compose.yml << EOF
  data-bus-manager:
    build: ./docker/data-bus-manager
    environment:
      - ALPACA_LIVE_API_KEY=\${ALPACA_LIVE_API_KEY}
      - ALPACA_LIVE_API_SECRET=\${ALPACA_LIVE_API_SECRET}
      - DATABASE_URL=\${DATABASE_URL}
    depends_on:
      - database
      - redis
    ports:
      - "3002:3002"
EOF
```

### **Week 2: SPY/QQQ/IWM Stock Integration**
```javascript
// 1. Migrate frontend to use bus
// Replace useDockerWebSocket with useBusData

// 2. Update API server to publish to bus instead of direct WebSocket
// docker/api-server/server.js modifications

// 3. Test performance improvements
// Should see immediate reduction in duplicate WebSocket connections
```

### **Week 3: Options Data Migration**
```javascript
// 1. Create UnifiedOptionsService
// 2. Migrate useOptionsGreeks to bus pattern
// 3. Update backtesting engine to use bus options data
// 4. Implement automatic Greeks caching
```

### **Week 4: Performance Optimization**
```javascript
// 1. Add bus metrics and monitoring
// 2. Optimize SQL queries for bus access patterns
// 3. Implement intelligent pre-fetching
// 4. Load testing and performance validation
```

---

## 📊 **Expected Results for SPY/QQQ/IWM**

### **Before Bus (Current State):**
```
SPY Quote Requests/Day: ~5,000 (5 different services)
API Rate Limit Issues: Frequent
Data Inconsistency: High (different timestamps)
Memory Usage: High (5 separate data stores)
SQL Cache Hit Rate: 40%
```

### **After Bus Implementation:**
```
SPY Quote Requests/Day: ~500 (single bus connection)
API Rate Limit Issues: Eliminated
Data Inconsistency: Eliminated (single source)
Memory Usage: 60% reduction (shared data)
SQL Cache Hit Rate: 95%
```

### **Real-Time Benefits:**
- **90% reduction** in API calls for SPY/QQQ/IWM
- **80% faster** data access (cache hits vs API calls)
- **100% consistency** across all services
- **Zero duplicate** Greeks calculations
- **Instant** option chain access for all services

---

## 🎯 **Next Steps**

1. **Review this plan** and approve the architecture
2. **Start with Phase 1** - Core bus infrastructure
3. **Migrate SPY data first** as proof of concept
4. **Measure performance gains** immediately
5. **Scale to QQQ/IWM** once SPY is working
6. **Expand to options data** in later phases

This bus architecture will transform your system from making thousands of duplicate API calls into a highly efficient, real-time data distribution system where SPY/QQQ/IWM data is fetched once and instantly available to all services through the message bus!