/**
 * BusClient - Connects to existing Data Bus Manager
 * Reuses the same pattern from API server
 * Enhanced with connection state management and heartbeat
 */

const WebSocket = require('ws');
const EventEmitter = require('eventemitter3');

// Connection states
const ConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  ERROR: 'error'
};

class BusClient extends EventEmitter {
  constructor(busUrl = 'ws://data_bus_manager:3004') {
    super();

    this.busUrl = busUrl;
    this.ws = null;
    this.subscriptions = new Set();
    this.connectionState = ConnectionState.DISCONNECTED;
    this.reconnectDelay = 5000;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectBackoffMultiplier = 1.5; // Exponential backoff
    this.maxReconnectDelay = 60000; // Max 1 minute
    
    // Heartbeat mechanism
    this.heartbeatInterval = null;
    this.heartbeatTimeout = null;
    this.heartbeatIntervalMs = 30000; // Send ping every 30s
    this.heartbeatTimeoutMs = 10000; // Expect pong within 10s
    this.lastHeartbeat = null;
    
    // CRITICAL FIX: Connect to Data Bus Manager for raw market data instead of filtered API server data
    this.stockData = new Map();
    this.optionsData = new Map();
    this.realtimeBars = new Map();

    console.log(`📡 [Paper Trading] BusClient initialized for API server: ${busUrl}`);
  }

  /**
   * Get current connection state
   */
  getConnectionState() {
    return this.connectionState;
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connectionState === ConnectionState.CONNECTED && 
           this.ws && 
           this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Connect to the data bus with enhanced connection management
   */
  async connect() {
    if (this.isConnected()) {
      console.log('⚠️ [Paper Trading] Already connected to data bus');
      return;
    }

    // Prevent multiple simultaneous connection attempts
    if (this.connectionState === ConnectionState.CONNECTING) {
      console.log('⚠️ [Paper Trading] Connection attempt already in progress');
      return;
    }

    try {
      this.connectionState = ConnectionState.CONNECTING;
      console.log(`🚀 [Paper Trading] Connecting to data bus: ${this.busUrl}`);

      this.ws = new WebSocket(this.busUrl, {
        handshakeTimeout: 10000, // 10 second connection timeout
        perMessageDeflate: false // Disable compression for lower latency
      });

      this.ws.on('open', () => {
        console.log('✅ [Paper Trading] Connected to data bus');
        this.connectionState = ConnectionState.CONNECTED;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 5000; // Reset to initial delay
        this.emit('connected');

        // Start heartbeat
        this.startHeartbeat();

        // Resubscribe to all channels
        if (this.subscriptions.size > 0) {
          this.resubscribe();
        }
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });

      this.ws.on('ping', () => {
        this.lastHeartbeat = Date.now();
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.pong();
        }
      });

      this.ws.on('pong', () => {
        this.lastHeartbeat = Date.now();
        if (this.heartbeatTimeout) {
          clearTimeout(this.heartbeatTimeout);
          this.heartbeatTimeout = null;
        }
      });

      this.ws.on('error', (error) => {
        console.error('❌ [Paper Trading] Data bus WebSocket error:', error.message);
        this.connectionState = ConnectionState.ERROR;
        this.emit('error', error);
        this.stopHeartbeat();
      });

      this.ws.on('close', (code, reason) => {
        console.log(`❌ [Paper Trading] Disconnected from data bus (code: ${code}, reason: ${reason || 'none'})`);
        const wasConnected = this.connectionState === ConnectionState.CONNECTED;
        this.connectionState = ConnectionState.DISCONNECTED;
        this.emit('disconnected', { code, reason });
        this.stopHeartbeat();

        // Only attempt reconnection if we were previously connected or in a reconnecting state
        if (wasConnected || this.reconnectAttempts > 0) {
          this.attemptReconnection();
        }
      });

    } catch (error) {
      console.error('❌ [Paper Trading] Failed to connect to data bus:', error.message);
      this.connectionState = ConnectionState.ERROR;
      this.attemptReconnection();
    }
  }

  /**
   * Attempt reconnection with exponential backoff
   */
  attemptReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ [Paper Trading] Max reconnect attempts reached. Giving up.');
      this.connectionState = ConnectionState.ERROR;
      this.emit('max_reconnect_attempts_reached');
      return;
    }

    this.reconnectAttempts++;
    this.connectionState = ConnectionState.RECONNECTING;
    
    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.reconnectDelay * Math.pow(this.reconnectBackoffMultiplier, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    console.log(`🔄 [Paper Trading] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      if (this.connectionState === ConnectionState.RECONNECTING) {
        this.connect();
      }
    }, delay);
  }

  /**
   * Start heartbeat mechanism
   */
  startHeartbeat() {
    this.stopHeartbeat();
    this.lastHeartbeat = Date.now();

    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.ping();
          
          // Set timeout to detect dead connections
          this.heartbeatTimeout = setTimeout(() => {
            console.error('⚠️ [Paper Trading] Heartbeat timeout - connection may be dead');
            this.ws.terminate();
          }, this.heartbeatTimeoutMs);
        } catch (error) {
          console.error('❌ [Paper Trading] Error sending heartbeat:', error.message);
        }
      }
    }, this.heartbeatIntervalMs);
  }

  /**
   * Stop heartbeat mechanism
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  /**
   * Get heartbeat status
   */
  getHeartbeatStatus() {
    return {
      lastHeartbeat: this.lastHeartbeat,
      timeSinceLastHeartbeat: this.lastHeartbeat ? Date.now() - this.lastHeartbeat : null,
      isHealthy: this.lastHeartbeat ? (Date.now() - this.lastHeartbeat) < (this.heartbeatIntervalMs * 2) : false
    };
  }

  /**
   * Handle incoming message from API server WebSocket
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data);

      // Update heartbeat on any message received
      this.lastHeartbeat = Date.now();

      // Context7: Process real-time stock and options data
      if (message.type === 'stock_quote') {
        this.processStockQuote(message.data);
      } else if (message.type === 'stock_trade') {
        this.processStockTrade(message.data);
      } else if (message.type === 'option_quote') {
        this.processOptionQuote(message.data);
      } else if (message.type === 'option_trade') {
        // Handle option trades as option quotes for bot processing
        this.processOptionQuote(message.data);
      } else if (message.type === 'connected') {
        console.log('✅ [Paper Trading] API server WebSocket connection confirmed');
      } else if (message.type === 'error') {
        console.error('❌ [Paper Trading] API server error:', message.message);
        this.emit('error', new Error(message.message));
      }
    } catch (error) {
      console.error('❌ [Paper Trading] Error handling message:', error.message);
    }
  }

  /**
   * Context7: Process real-time stock quotes with immediate bar updates
   */
  processStockQuote(data) {
    const { symbol, bid, ask, timestamp } = data;
    console.log(`📊 [Real-time] Processing stock quote for ${symbol}: bid=${bid}, ask=${ask}`);
    const mid = (bid + ask) / 2;
    
    // Update stock data store
    if (!this.stockData.has(symbol)) {
      this.stockData.set(symbol, {
        quotes: [],
        trades: [],
        currentPrice: mid,
        lastUpdate: Date.now(),
        realtimeBar: null
      });
    }
    
    const stockInfo = this.stockData.get(symbol);
    stockInfo.quotes.push({ bid, ask, mid, timestamp });
    stockInfo.currentPrice = mid;
    stockInfo.lastUpdate = Date.now();
    
    // Keep only last 1000 quotes for memory efficiency
    if (stockInfo.quotes.length > 1000) {
      stockInfo.quotes = stockInfo.quotes.slice(-1000);
    }
    
    // Update real-time bar (Context7 pattern - don't wait for bar completion)
    this.updateRealtimeBar(symbol, mid, 'quote');
    
    // Emit for bot strategies
    this.emit('stock_quote', { symbol, bid, ask, mid, timestamp });
    this.emit(`symbol:${symbol}`, { type: 'quote', bid, ask, mid, timestamp });
  }

  /**
   * Context7: Process real-time stock trades with immediate processing
   */
  processStockTrade(data) {
    const { symbol, price, volume, timestamp } = data;
    
    if (!this.stockData.has(symbol)) {
      this.stockData.set(symbol, {
        quotes: [],
        trades: [],
        currentPrice: price,
        lastUpdate: Date.now(),
        realtimeBar: null
      });
    }
    
    const stockInfo = this.stockData.get(symbol);
    stockInfo.trades.push({ price, volume, timestamp });
    stockInfo.currentPrice = price;
    stockInfo.lastUpdate = Date.now();
    
    // Keep only last 1000 trades for memory efficiency
    if (stockInfo.trades.length > 1000) {
      stockInfo.trades = stockInfo.trades.slice(-1000);
    }
    
    // Update real-time bar with trade data (Context7 - process immediately)
    this.updateRealtimeBar(symbol, price, 'trade', volume);
    
    // Emit for bot strategies
    this.emit('stock_trade', { symbol, price, volume, timestamp });
    this.emit(`symbol:${symbol}`, { type: 'trade', price, volume, timestamp });
  }

  /**
   * Context7: Process real-time options quotes with proper bid/ask semantics
   */
  processOptionQuote(data) {
    const { symbol, bid_price, ask_price, bid_size, ask_size, timestamp, price, bid, ask } = data;
    
    // Support both new format (bid_price/ask_price) and legacy format (bid/ask)
    const effectiveBid = bid_price || bid;
    const effectiveAsk = ask_price || ask;
    
    // Only process if we have proper bid/ask data - no more estimation!
    if (!effectiveBid || !effectiveAsk) {
      console.log(`⚠️  Skipping option data for ${symbol}: missing bid/ask (bid=${effectiveBid}, ask=${effectiveAsk})`);
      return;
    }
    
    console.log(`📈 [Real-time] Processing option quote for ${symbol}: bid=$${effectiveBid}, ask=$${effectiveAsk}`);
    
    // Context7: For options, bid = price you can SELL at, ask = price you can BUY at
    const mid = (effectiveBid + effectiveAsk) / 2;
    
    if (!this.optionsData.has(symbol)) {
      this.optionsData.set(symbol, {
        quotes: [],
        currentBid: effectiveBid,
        currentAsk: effectiveAsk,
        currentMid: mid,
        lastUpdate: Date.now()
      });
    }
    
    const optionInfo = this.optionsData.get(symbol);
    optionInfo.quotes.push({ bid: effectiveBid, ask: effectiveAsk, mid, bid_size, ask_size, timestamp });
    optionInfo.currentBid = effectiveBid;  // Price you can SELL at
    optionInfo.currentAsk = effectiveAsk;  // Price you can BUY at
    optionInfo.currentMid = mid;
    optionInfo.lastUpdate = Date.now();
    
    // Keep only last 500 quotes for options (they update less frequently)
    if (optionInfo.quotes.length > 500) {
      optionInfo.quotes = optionInfo.quotes.slice(-500);
    }
    
    // Emit for bot strategies with real market data
    this.emit('option_quote', { symbol, bid: effectiveBid, ask: effectiveAsk, mid, bid_size, ask_size, timestamp });
    
    // Extract underlying symbol from option symbol (e.g., SPY251111C00680000 -> SPY)
    const underlyingSymbol = symbol.match(/^[A-Z]+/)[0];
    this.emit(`option:${underlyingSymbol}`, { type: 'option_quote', symbol, bid: effectiveBid, ask: effectiveAsk, mid, timestamp });
  }

  /**
   * Context7: Update real-time bars without waiting for completion
   */
  updateRealtimeBar(symbol, price, dataType, volume = 0) {
    const now = Date.now();
    const barMinute = Math.floor(now / 60000) * 60000; // 1-minute alignment
    
    if (!this.realtimeBars.has(symbol)) {
      this.realtimeBars.set(symbol, new Map());
    }
    
    const symbolBars = this.realtimeBars.get(symbol);
    
    if (!symbolBars.has(barMinute)) {
      symbolBars.set(barMinute, {
        timestamp: barMinute,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: volume,
        trades: 0
      });
    }
    
    const bar = symbolBars.get(barMinute);
    
    // Update OHLCV in real-time (Context7 pattern)
    bar.high = Math.max(bar.high, price);
    bar.low = Math.min(bar.low, price);
    bar.close = price; // Always update close to latest price
    
    if (dataType === 'trade') {
      bar.volume += volume;
      bar.trades += 1;
    }
    
    // Emit updated bar for strategies
    this.emit('realtime_bar', { symbol, bar: { ...bar } });
    
    // Clean old bars (keep only last 300 bars = 5 hours)
    if (symbolBars.size > 300) {
      const oldestKey = Math.min(...symbolBars.keys());
      symbolBars.delete(oldestKey);
    }
  }

  /**
   * Subscribe to stock and options data for specific symbols
   */
  subscribeToSymbols(symbols) {
    if (!Array.isArray(symbols)) {
      symbols = [symbols];
    }

    // Context7: We don't need to send subscription messages to API server
    // It automatically broadcasts all data to all connected clients
    console.log(`📡 [Paper Trading] Ready to receive live data for: ${symbols.join(', ')}`);
    console.log(`📈 [Paper Trading] Listening for stock quotes, trades, and options data...`);
  }

  /**
   * Get current stock price for a symbol
   */
  getCurrentStockPrice(symbol) {
    const stockInfo = this.stockData.get(symbol);
    return stockInfo ? stockInfo.currentPrice : null;
  }

  /**
   * Get current option bid/ask for an option symbol
   */
  getCurrentOptionQuote(optionSymbol) {
    const optionInfo = this.optionsData.get(optionSymbol);
    return optionInfo ? {
      bid: optionInfo.currentBid,    // Price you can SELL at
      ask: optionInfo.currentAsk,    // Price you can BUY at
      mid: optionInfo.currentMid
    } : null;
  }

  /**
   * Get real-time bars for a symbol (Context7 pattern)
   */
  getRealtimeBars(symbol, count = 50) {
    const symbolBars = this.realtimeBars.get(symbol);
    if (!symbolBars) return [];
    
    const bars = Array.from(symbolBars.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-count);
    
    return bars;
  }

  /**
   * Subscribe to channels
   */
  subscribe(channels) {
    if (!Array.isArray(channels)) {
      channels = [channels];
    }

    // Add to subscriptions
    channels.forEach(channel => this.subscriptions.add(channel));

    // Send subscribe message if connected
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'subscribe',
        channels
      }));

      console.log('📡 [Paper Trading] Subscribing to:', channels);
    }
  }

  /**
   * Unsubscribe from channels
   */
  unsubscribe(channels) {
    if (!Array.isArray(channels)) {
      channels = [channels];
    }

    // Remove from subscriptions
    channels.forEach(channel => this.subscriptions.delete(channel));

    // Send unsubscribe message if connected
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'unsubscribe',
        channels
      }));

      console.log('📡 [Paper Trading] Unsubscribing from:', channels);
    }
  }

  /**
   * Resubscribe to all channels after reconnection
   */
  resubscribe() {
    if (this.subscriptions.size > 0) {
      const channels = Array.from(this.subscriptions);
      this.ws.send(JSON.stringify({
        action: 'subscribe',
        channels
      }));

      console.log('📡 [Paper Trading] Resubscribed to', channels.length, 'channels');
    }
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connected && this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Disconnect from bus
   */
  disconnect() {
    if (this.ws) {
      this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnect
      this.ws.close();
      this.ws = null;
      this.connected = false;
      console.log('🛑 [Paper Trading] Disconnected from data bus');
    }
  }
}

module.exports = BusClient;