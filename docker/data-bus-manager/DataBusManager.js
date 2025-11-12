/**
 * DataBusManager
 * Central orchestrator for all data bus operations
 */

const EventEmitter = require('eventemitter3');
const RequestDeduplicator = require('./RequestDeduplicator');
const SQLCacheLayer = require('./SQLCacheLayer');
const StockDataChannel = require('./StockDataChannel');
const OptionsDataChannel = require('./OptionsDataChannel');
const BarAggregator = require('./BarAggregator');

class DataBusManager extends EventEmitter {
  constructor(config) {
    super();

    this.config = config;
    this.subscriptions = new Map(); // channel -> Set of callbacks
    this.dataChannels = new Map();

    // Initialize core components
    this.deduplicator = new RequestDeduplicator({
      cacheTTL: config.cacheTTL || 30000,
      maxCacheSize: config.maxCacheSize || 1000
    });

    this.sqlCache = new SQLCacheLayer(config.databaseUrl, {
      poolSize: config.sqlPoolSize || 20,
      batchSize: config.sqlBatchSize || 100,
      flushInterval: config.sqlFlushInterval || 5000
    });

    // Initialize bar aggregator for OHLCV bars
    this.barAggregator = new BarAggregator(this.sqlCache);

    // Initialize data channels
    this.stockChannel = new StockDataChannel(
      this,
      config.alpacaApiKey,
      config.alpacaApiSecret
    );

    this.optionsChannel = new OptionsDataChannel(
      this,
      config.alpacaApiKey,
      config.alpacaApiSecret
    );

    // Subscribe SQL cache to all data for automatic caching
    this.on('stock.*', (channel, data) => {
      this.sqlCache.handleStockUpdate(channel, data);
      
      // If this is trade data, also send to bar aggregator
      if (channel.includes('trade') && data) {
        if (Array.isArray(data)) {
          data.forEach(trade => this.barAggregator.onTradeReceived(trade));
        } else {
          this.barAggregator.onTradeReceived(data);
        }
      }
    });

    this.on('options.*', (channel, data) => {
      // Route to appropriate handler based on data type
      if (channel.includes('snapshot')) {
        this.sqlCache.handleSnapshotUpdate(channel, data);
      } else if (channel.includes('quote')) {
        this.sqlCache.handleOptionsQuoteUpdate(channel, data);
      } else if (channel.includes('trade')) {
        this.sqlCache.handleOptionsTradeUpdate(channel, data);
      } else {
        // Legacy handler for backward compatibility
        this.sqlCache.handleOptionsUpdate(channel, data);
      }
    });

    console.log('✅ DataBusManager initialized');
  }

  /**
   * Initialize all data channels
   */
  async initialize() {
    console.log('🚀 Initializing DataBusManager...');

    try {
      // Initialize stock data channel
      await this.stockChannel.initialize();

      // Initialize options data channel with WebSocket
      console.log('🚀 Initializing options WebSocket...');
      await this.optionsChannel.initializeWebSocket();

      console.log('✅ DataBusManager fully initialized');
    } catch (error) {
      console.error('❌ Failed to initialize DataBusManager:', error.message);
      throw error;
    }
  }

  /**
   * Subscribe to a channel pattern
   */
  subscribe(channelPattern, callback) {
    if (!this.subscriptions.has(channelPattern)) {
      this.subscriptions.set(channelPattern, new Set());
    }

    this.subscriptions.get(channelPattern).add(callback);

    // Register EventEmitter listener
    this.on(channelPattern, callback);

    console.log(`📡 New subscription: ${channelPattern} (${this.subscriptions.get(channelPattern).size} subscribers)`);
  }

  /**
   * Unsubscribe from a channel pattern
   */
  unsubscribe(channelPattern, callback) {
    if (this.subscriptions.has(channelPattern)) {
      this.subscriptions.get(channelPattern).delete(callback);

      // Remove EventEmitter listener
      this.off(channelPattern, callback);

      if (this.subscriptions.get(channelPattern).size === 0) {
        this.subscriptions.delete(channelPattern);
      }

      console.log(`📡 Unsubscribed: ${channelPattern}`);
    }
  }

  /**
   * Publish data to a channel
   */
  publish(channel, data) {
    // Emit to EventEmitter (handles wildcard patterns)
    this.emit(channel, channel, data);

    // Also emit wildcard pattern for SQL cache
    const parts = channel.split('.');
    if (parts.length >= 2) {
      this.emit(`${parts[0]}.*`, channel, data);
    }
  }

  /**
   * Get option chain (delegates to OptionsDataChannel)
   */
  async getOptionChain(symbol, expiryDate, strikeRange, strikeSpacing) {
    return this.optionsChannel.getOptionChain(symbol, expiryDate, strikeRange, strikeSpacing);
  }

  /**
   * Get historical options bars (delegates to OptionsDataChannel)
   */
  async getHistoricalOptionsBars(symbols, startDate, endDate, timeframe) {
    return this.optionsChannel.getHistoricalOptionsBars(symbols, startDate, endDate, timeframe);
  }

  /**
   * Get historical stock data (from SQL cache)
   */
  async getHistoricalStockData(symbol, startDate, endDate) {
    return this.sqlCache.getHistoricalData(symbol, startDate, endDate);
  }

  /**
   * Get historical options data (from SQL cache)
   */
  async getHistoricalOptionsData(symbol, startDate, endDate) {
    return this.sqlCache.getHistoricalOptions(symbol, startDate, endDate);
  }

  /**
   * Get option snapshots with Greeks (delegates to OptionsDataChannel)
   */
  async getOptionSnapshots(symbols) {
    return this.optionsChannel.getOptionSnapshots(symbols);
  }

  /**
   * Start polling Greeks for active contracts
   */
  startGreeksPolling(symbols, intervalMs = 60000) {
    return this.optionsChannel.startGreeksPolling(symbols, intervalMs);
  }

  /**
   * Stop Greeks polling
   */
  stopGreeksPolling() {
    return this.optionsChannel.stopGreeksPolling();
  }

  /**
   * Get historical aggregated bars (OHLCV)
   */
  async getHistoricalBars(symbol, timeframe, startDate, endDate) {
    return this.sqlCache.getHistoricalBars(symbol, timeframe, startDate, endDate);
  }

  /**
   * Add a symbol to stock watchlist
   */
  addStockSymbol(symbol) {
    this.stockChannel.addSymbol(symbol);
  }

  /**
   * Remove a symbol from stock watchlist
   */
  removeStockSymbol(symbol) {
    this.stockChannel.removeSymbol(symbol);
  }

  /**
   * Get comprehensive statistics
   */
  async getStats() {
    const sqlStats = await this.sqlCache.getStats();
    const deduplicatorStats = this.deduplicator.getStats();
    const stockStats = this.stockChannel.getStats();
    const optionsStats = this.optionsChannel.getStats();

    return {
      bus: {
        subscriptions: this.subscriptions.size,
        totalSubscribers: Array.from(this.subscriptions.values())
          .reduce((sum, set) => sum + set.size, 0)
      },
      deduplicator: deduplicatorStats,
      sqlCache: sqlStats,
      stockChannel: stockStats,
      optionsChannel: optionsStats
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const stats = await this.getStats();

      return {
        healthy: true,
        timestamp: new Date().toISOString(),
        stats
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Cleanup on shutdown
   */
  async destroy() {
    console.log('🛑 Shutting down DataBusManager...');

    // Destroy all components
    this.stockChannel.destroy();
    this.optionsChannel.destroy();
    this.deduplicator.destroy();
    await this.sqlCache.destroy();

    // Clear subscriptions
    this.subscriptions.clear();
    this.removeAllListeners();

    console.log('✅ DataBusManager shut down complete');
  }
}

module.exports = DataBusManager;
