# Alpaca Data Bus Architecture Plan
## High-Performance Pub/Sub System for Trade Whisperer

### 🎯 Objectives
- **Eliminate duplicate API calls** (currently SPY/QQQ/IWM fetched multiple times)
- **Reduce latency** through persistent connections and data pooling
- **Centralize data flow** through message bus pattern
- **Optimize SQL caching** with bus-driven updates
- **Enable real-time data sharing** across all services

---

## 🏗️ Bus Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    ALPACA DATA BUS MANAGER                      │
│                    (Central Orchestrator)                       │
│  - Single Alpaca client instance                               │
│  - Persistent WebSocket connections                             │
│  - Request deduplication                                        │
│  - Data channel management                                      │
│  - SQL cache integration                                        │
└─────────────────┬───────────────────────────┬───────────────────┘
                  │                           │
      ┌───────────▼───────────┐   ┌───────────▼───────────┐
      │   STOCK DATA CHANNEL   │   │ OPTIONS DATA CHANNEL  │
      │                        │   │                       │
      │ • SPY/QQQ/IWM streams  │   │ • Contract discovery  │
      │ • Historical bars      │   │ • Real-time quotes    │
      │ • Real-time quotes     │   │ • Greeks calculations │
      │ • VWAP calculations    │   │ • Chain updates       │
      └───────────┬───────────┘   └───────────┬───────────┘
                  │                           │
    ┌─────────────▼─────────────────────────▼─────────────┐
    │              MESSAGE BUS (Redis/EventEmitter)        │
    │                                                      │
    │  Channels:                                           │
    │  • stock.SPY.quote     • options.SPY.chain          │
    │  • stock.QQQ.bars      • options.QQQ.greeks         │
    │  • stock.IWM.trades    • options.IWM.contracts      │
    │  • indicators.SPY.vwap • cache.update               │
    └─────────────┬─────────────────────────┬─────────────┘
                  │                         │
    ┌─────────────▼─────────────┐ ┌─────────▼─────────────┐
    │      SUBSCRIBERS          │ │    SQL CACHE LAYER    │
    │                           │ │                       │
    │ • Frontend WebSocket      │ │ • Automatic updates   │
    │ • Backtesting Engine      │ │ • Query optimization  │
    │ • Optimization Service    │ │ • Historical storage  │
    │ • Risk Management         │ │ • Analytics queries   │
    │ • Live Trading            │ │ • Performance metrics │
    └───────────────────────────┘ └───────────────────────┘
```

---

## 🔧 Technical Implementation

### 1. **Data Bus Manager Core**
```javascript
class AlpacaDataBusManager {
  constructor() {
    this.alpacaClient = new AlpacaClient(); // Single instance
    this.messageBus = new EventEmitter();
    this.subscriptions = new Map();
    this.dataChannels = new Map();
    this.sqlCache = new SQLCacheLayer();
    this.requestQueue = new RequestDeduplicator();
  }

  // Core methods:
  async subscribe(channelPattern, callback)
  async unsubscribe(channelPattern, callback) 
  async publish(channel, data)
  async getHistoricalData(symbol, params)
  async subscribeToRealTime(symbols)
}
```

### 2. **Data Channels System**

#### **Stock Data Channel**
```javascript
class StockDataChannel {
  constructor(busManager) {
    this.bus = busManager;
    this.activeSymbols = new Set(['SPY', 'QQQ', 'IWM']); // Pre-defined watchlist
    this.wsConnection = null;
    this.dataBuffer = new Map();
  }

  async initialize() {
    // Single WebSocket for all stock symbols
    this.wsConnection = await this.bus.alpacaClient.connectStockWebSocket();
    
    // Subscribe to all watchlist symbols at once
    await this.wsConnection.subscribe({
      quotes: Array.from(this.activeSymbols),
      trades: Array.from(this.activeSymbols),
      bars: Array.from(this.activeSymbols)
    });
  }

  handleIncomingData(message) {
    const channel = `stock.${message.symbol}.${message.type}`;
    
    // Update SQL cache automatically
    this.bus.sqlCache.upsertStockData(message);
    
    // Broadcast to all subscribers
    this.bus.publish(channel, message);
    
    // Calculate derived indicators (VWAP, etc.)
    this.calculateIndicators(message);
  }
}
```

#### **Options Data Channel**
```javascript
class OptionsDataChannel {
  constructor(busManager) {
    this.bus = busManager;
    this.contractCache = new Map();
    this.wsConnection = null;
    this.greeksCalculator = new GreeksCalculator();
  }

  async getOptionChain(symbol, expiry) {
    const cacheKey = `${symbol}_${expiry}`;
    
    // Check if we're already fetching this
    if (this.requestQueue.isPending(cacheKey)) {
      return this.requestQueue.waitFor(cacheKey);
    }

    // Deduplicate request
    return this.requestQueue.execute(cacheKey, async () => {
      // Check SQL cache first
      let chain = await this.bus.sqlCache.getOptionChain(symbol, expiry);
      
      if (!chain) {
        // Fetch from API only if not cached
        chain = await this.bus.alpacaClient.fetchOptionChain(symbol, expiry);
        await this.bus.sqlCache.storeOptionChain(chain);
      }

      // Broadcast to subscribers
      this.bus.publish(`options.${symbol}.chain`, chain);
      
      return chain;
    });
  }
}
```

### 3. **Request Deduplication Layer**
```javascript
class RequestDeduplicator {
  constructor() {
    this.pendingRequests = new Map();
    this.cache = new Map();
    this.cacheTTL = 30000; // 30 seconds
  }

  async execute(key, requestFn) {
    // Return cached result if available
    if (this.cache.has(key)) {
      const cached = this.cache.get(key);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.data;
      }
    }

    // Return existing promise if request is pending
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key);
    }

    // Execute new request
    const promise = requestFn()
      .then(result => {
        this.cache.set(key, { data: result, timestamp: Date.now() });
        return result;
      })
      .finally(() => {
        this.pendingRequests.delete(key);
      });

    this.pendingRequests.set(key, promise);
    return promise;
  }
}
```

---

## 📈 **Shared Data Patterns Analysis**

### **Critical Shared Data Identified:**

1. **SPY/QQQ/IWM Stock Data**
   - **Current**: Fetched separately by frontend, backtesting, live trading
   - **Optimized**: Single WebSocket subscription, broadcast to all consumers
   - **Frequency**: Real-time (every trade/quote)

2. **Options Chains**
   - **Current**: Fetched per request from each service
   - **Optimized**: Cache in SQL, update incrementally
   - **Frequency**: Once per day at market open, updates on demand

3. **Greeks Calculations**
   - **Current**: Calculated separately in backtesting engine
   - **Optimized**: Calculated once, cached with contract data
   - **Frequency**: Real-time with price updates

4. **VWAP/Technical Indicators**
   - **Current**: Calculated in multiple services
   - **Optimized**: Calculated once in data bus, published to subscribers
   - **Frequency**: Every bar update

### **Data Consolidation Plan:**

```javascript
// Example: Multiple services need SPY data
const dataConsolidationMap = {
  'SPY_stock_data': {
    consumers: [
      'frontend_trading_chart',
      'backtesting_engine', 
      'live_trading_signals',
      'risk_management',
      'vwap_calculator'
    ],
    source: 'stock_data_channel',
    updateFrequency: 'real-time',
    caching: 'sql + memory'
  },
  
  'SPY_option_chain': {
    consumers: [
      'options_backtesting',
      'live_options_trading',
      'greeks_calculator',
      'strategy_optimizer'
    ],
    source: 'options_data_channel',
    updateFrequency: 'on-demand',
    caching: 'sql + 30min memory'
  }
};
```

---

## 🗄️ **SQL Integration Strategy**

### **Bus-Driven Cache Updates**
```sql
-- Optimized tables for bus integration
CREATE TABLE bus_stock_data (
  symbol VARCHAR(10),
  timestamp TIMESTAMPTZ,
  price DECIMAL(10,4),
  volume BIGINT,
  channel VARCHAR(50),
  PRIMARY KEY (symbol, timestamp)
);

CREATE INDEX idx_bus_stock_realtime ON bus_stock_data (symbol, timestamp DESC);

-- Options data optimized for bus queries
CREATE TABLE bus_option_chains (
  symbol VARCHAR(10),
  expiry_date DATE,
  strike_price DECIMAL(10,4),
  option_type VARCHAR(4),
  last_updated TIMESTAMPTZ,
  contract_data JSONB,
  PRIMARY KEY (symbol, expiry_date, strike_price, option_type)
);

CREATE INDEX idx_bus_options_lookup ON bus_option_chains (symbol, expiry_date, last_updated DESC);
```

### **Real-Time Cache Sync**
```javascript
class SQLCacheLayer {
  constructor(busManager) {
    this.bus = busManager;
    this.db = new PostgreSQLConnection();
    this.writeBuffer = [];
    this.batchSize = 100;
    
    // Subscribe to all data channels for automatic caching
    this.bus.subscribe('stock.*', this.handleStockUpdate.bind(this));
    this.bus.subscribe('options.*', this.handleOptionsUpdate.bind(this));
  }

  handleStockUpdate(channel, data) {
    this.writeBuffer.push({
      table: 'bus_stock_data',
      data: {
        symbol: data.symbol,
        timestamp: data.timestamp,
        price: data.price,
        volume: data.volume,
        channel: channel
      }
    });

    if (this.writeBuffer.length >= this.batchSize) {
      this.flushBuffer();
    }
  }

  async flushBuffer() {
    if (this.writeBuffer.length === 0) return;
    
    const batch = this.writeBuffer.splice(0, this.batchSize);
    await this.db.batchInsert(batch);
  }
}
```

---

## 🚀 **Implementation Roadmap**

### **Phase 1: Core Bus Infrastructure (Week 1)**
- [ ] Create DataBusManager class
- [ ] Implement EventEmitter message bus
- [ ] Create request deduplication layer
- [ ] Set up basic SQL cache integration
- [ ] Add health monitoring and metrics

### **Phase 2: Stock Data Channel (Week 1-2)**
- [ ] Migrate stock WebSocket to bus manager
- [ ] Implement SPY/QQQ/IWM persistent subscriptions
- [ ] Add real-time VWAP calculation
- [ ] Create subscriber interface for frontend
- [ ] Performance testing and optimization

### **Phase 3: Options Data Channel (Week 2-3)**
- [ ] Migrate options WebSocket to bus manager
- [ ] Implement option chain caching
- [ ] Add Greeks calculation pipeline
- [ ] Create contract discovery service
- [ ] Integrate with backtesting engine

### **Phase 4: Service Migration (Week 3-4)**
- [ ] Migrate frontend hooks to bus subscribers
- [ ] Update backtesting engine to use bus
- [ ] Migrate optimization service
- [ ] Update live trading to use bus
- [ ] Performance validation and tuning

### **Phase 5: Advanced Features (Week 4+)**
- [ ] Add intelligent pre-fetching
- [ ] Implement data quality monitoring
- [ ] Add bus analytics and metrics
- [ ] Create data replay capabilities
- [ ] Optimize for multi-asset support

---

## 📊 **Expected Performance Improvements**

| Metric | Before Bus | After Bus | Improvement |
|--------|------------|-----------|-------------|
| API Calls/Day | ~50,000 | ~5,000 | **90% reduction** |
| Latency (stock data) | 200-500ms | 10-50ms | **80% reduction** |
| SQL Query Load | High | Low | **70% reduction** |
| Memory Usage | High (duplicates) | Medium (shared) | **40% reduction** |
| Data Consistency | Variable | High | **99.9% accuracy** |

---

## 🔧 **Configuration & Deployment**

### **Environment Variables**
```env
# Data Bus Configuration
DATA_BUS_ENABLED=true
DATA_BUS_REDIS_URL=redis://localhost:6379
DATA_BUS_SQL_POOL_SIZE=20
DATA_BUS_CACHE_TTL=300
DATA_BUS_BATCH_SIZE=100

# Alpaca Integration
ALPACA_DATA_BUS_SYMBOLS=SPY,QQQ,IWM,AAPL,TSLA
ALPACA_WS_RECONNECT_DELAY=5000
ALPACA_REQUEST_DEDUP_TTL=30000
```

### **Docker Compose Integration**
```yaml
services:
  data-bus-manager:
    build: ./docker/data-bus-manager
    environment:
      - DATA_BUS_ENABLED=true
      - ALPACA_LIVE_API_KEY=${ALPACA_LIVE_API_KEY}
      - ALPACA_LIVE_API_SECRET=${ALPACA_LIVE_API_SECRET}
    depends_on:
      - redis
      - database
    ports:
      - "3002:3002"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

---

## 🧪 **Testing Strategy**

### **Load Testing**
- Simulate 1000+ concurrent subscribers
- Test deduplication under high load
- Validate SQL cache performance
- Measure end-to-end latency

### **Integration Testing**
- Test frontend → bus → API flow
- Validate backtesting integration
- Test WebSocket resilience
- Cache consistency testing

### **Performance Monitoring**
```javascript
class BusMetrics {
  static metrics = {
    apiCallsAvoided: 0,
    avgLatency: 0,
    cacheHitRate: 0,
    activeSubscribers: 0,
    dataVolume: 0
  };
  
  static logPerformanceGains() {
    console.log(`🎯 Bus Performance:
      API Calls Avoided: ${this.metrics.apiCallsAvoided}
      Avg Latency: ${this.metrics.avgLatency}ms
      Cache Hit Rate: ${this.metrics.cacheHitRate}%
      Active Subscribers: ${this.metrics.activeSubscribers}
    `);
  }
}
```

This architecture will transform your system from making redundant API calls to a highly efficient, real-time data distribution system. The bus pattern ensures that SPY/QQQ/IWM data is fetched once and shared across all services, dramatically reducing latency and API usage while improving data consistency.