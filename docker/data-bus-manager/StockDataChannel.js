/**
 * StockDataChannel
 * Manages stock data subscriptions and real-time streaming
 */

const WebSocket = require('ws');

class StockDataChannel {
  constructor(busManager, apiKey, apiSecret) {
    this.bus = busManager;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.activeSymbols = new Set(['SPY', 'QQQ', 'IWM']); // Core watchlist
    this.wsConnection = null;
    this.dataBuffer = new Map();
    this.reconnectDelay = 5000;
    this.isConnecting = false;
    this.heartbeatInterval = null;

    console.log('✅ StockDataChannel initialized with symbols:', Array.from(this.activeSymbols));
  }

  /**
   * Initialize WebSocket connection
   */
  async initialize() {
    if (this.isConnecting || (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN)) {
      console.log('⚠️ Already connected or connecting to stock WebSocket');
      return;
    }

    this.isConnecting = true;

    try {
      console.log('🚀 Connecting to Alpaca Stock WebSocket (IEX feed)...');

      this.wsConnection = new WebSocket('wss://stream.data.alpaca.markets/v2/iex');

      this.wsConnection.on('open', () => {
        console.log('✅ Connected to Alpaca Stock WebSocket');
        this.isConnecting = false;

        // Authenticate
        const authMessage = {
          action: 'auth',
          key: this.apiKey,
          secret: this.apiSecret
        };

        console.log('🔑 Authenticating stock WebSocket...');
        this.wsConnection.send(JSON.stringify(authMessage));

        // Set up heartbeat
        this.startHeartbeat();
      });

      this.wsConnection.on('message', (data) => {
        this.handleIncomingData(data);
      });

      this.wsConnection.on('error', (error) => {
        console.error('❌ Stock WebSocket error:', error.message);
        this.isConnecting = false;
      });

      this.wsConnection.on('close', () => {
        console.log('❌ Stock WebSocket closed, reconnecting in', this.reconnectDelay, 'ms');
        this.isConnecting = false;
        this.stopHeartbeat();

        setTimeout(() => this.initialize(), this.reconnectDelay);
      });

    } catch (error) {
      console.error('❌ Failed to initialize StockDataChannel:', error.message);
      this.isConnecting = false;
      setTimeout(() => this.initialize(), this.reconnectDelay);
    }
  }

  /**
   * Start heartbeat to keep connection alive
   */
  startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
        this.wsConnection.ping();
      }
    }, 30000); // Ping every 30 seconds
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Handle incoming WebSocket data
   */
  handleIncomingData(data) {
    try {
      const messages = JSON.parse(data);
      const messageArray = Array.isArray(messages) ? messages : [messages];

      for (const message of messageArray) {
        if (message.T === 'success' && message.msg === 'authenticated') {
          console.log('✅ Stock WebSocket authenticated');
          this.subscribeToSymbols();
        } else if (message.T === 'subscription') {
          console.log('📡 Stock subscription confirmed:', {
            quotes: message.quotes?.length || 0,
            trades: message.trades?.length || 0
          });
        } else if (message.T === 't') {
          // Stock TRADE
          this.handleTrade(message);
        } else if (message.T === 'q') {
          // Stock QUOTE
          this.handleQuote(message);
        } else if (message.T === 'error') {
          console.error('❌ Stock WebSocket error:', message.code, message.msg);
        }
      }
    } catch (error) {
      console.error('❌ Error processing stock message:', error.message);
    }
  }

  /**
   * Subscribe to all active symbols
   */
  subscribeToSymbols() {
    if (!this.wsConnection || this.wsConnection.readyState !== WebSocket.OPEN) {
      console.error('❌ Cannot subscribe - WebSocket not connected');
      return;
    }

    const symbols = Array.from(this.activeSymbols);
    const subscribeMessage = {
      action: 'subscribe',
      quotes: symbols,
      trades: symbols
    };

    console.log('📡 Subscribing to stock symbols:', symbols);
    this.wsConnection.send(JSON.stringify(subscribeMessage));
  }

  /**
   * Handle trade data
   */
  handleTrade(message) {
    const trade = {
      symbol: message.S,
      price: parseFloat(message.p) || 0,
      size: parseInt(message.s) || 0,
      timestamp: message.t,
      exchange: message.x || 'unknown',
      conditions: message.c || [],
      data_source: 'stock_trade'
    };

    // Publish to bus
    const channel = `stock.${trade.symbol}.trade`;
    this.bus.publish(channel, trade);

    // Throttled logging (1% of messages)
    if (Math.random() < 0.01) {
      console.log(`💰 Stock trade: ${trade.symbol} @ $${trade.price}`);
    }
  }

  /**
   * Handle quote data
   */
  handleQuote(message) {
    const quote = {
      symbol: message.S,
      bid: parseFloat(message.bp) || 0,
      ask: parseFloat(message.ap) || 0,
      bid_size: parseInt(message.bs) || 0,
      ask_size: parseInt(message.as) || 0,
      timestamp: message.t,
      data_source: 'stock_quote'
    };

    // Publish to bus
    const channel = `stock.${quote.symbol}.quote`;
    this.bus.publish(channel, quote);

    // Throttled logging (0.1% of messages)
    if (Math.random() < 0.001) {
      console.log(`📊 Stock quote: ${quote.symbol} bid: $${quote.bid}, ask: $${quote.ask}`);
    }
  }

  /**
   * Add a new symbol to watch
   */
  addSymbol(symbol) {
    if (this.activeSymbols.has(symbol)) {
      return;
    }

    console.log('➕ Adding symbol to watchlist:', symbol);
    this.activeSymbols.add(symbol);

    // Subscribe if connected
    if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
      const subscribeMessage = {
        action: 'subscribe',
        quotes: [symbol],
        trades: [symbol]
      };
      this.wsConnection.send(JSON.stringify(subscribeMessage));
    }
  }

  /**
   * Remove a symbol from watch
   */
  removeSymbol(symbol) {
    if (!this.activeSymbols.has(symbol)) {
      return;
    }

    console.log('➖ Removing symbol from watchlist:', symbol);
    this.activeSymbols.delete(symbol);

    // Unsubscribe if connected
    if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
      const unsubscribeMessage = {
        action: 'unsubscribe',
        quotes: [symbol],
        trades: [symbol]
      };
      this.wsConnection.send(JSON.stringify(unsubscribeMessage));
    }
  }

  /**
   * Get channel statistics
   */
  getStats() {
    return {
      activeSymbols: this.activeSymbols.size,
      connected: this.wsConnection?.readyState === WebSocket.OPEN,
      symbols: Array.from(this.activeSymbols)
    };
  }

  /**
   * Cleanup on shutdown
   */
  destroy() {
    this.stopHeartbeat();

    if (this.wsConnection) {
      this.wsConnection.removeAllListeners();
      if (this.wsConnection.readyState === WebSocket.OPEN) {
        this.wsConnection.close();
      }
    }

    console.log('🛑 StockDataChannel destroyed');
  }
}

module.exports = StockDataChannel;
