/**
 * Alpaca Client Manager - Singleton Pattern
 * 
 * PROBLEM SOLVED: Per-request AlpacaClient instantiation causing:
 * - Memory leaks
 * - Connection pool exhaustion
 * - Rate limiting issues
 * - Performance degradation
 * 
 * SOLUTION: Single client instance reused across all requests
 * 
 * From ARCHITECTURAL_AUDIT_BRUTAL_HONEST.md TIER 0 Issue #2
 */

const AlpacaClient = require('./alpaca-client');

class AlpacaClientManager {
  constructor() {
    this.clients = {
      backtest: null,
      live: null,
      paper: null
    };
    this.initialized = false;
  }

  /**
   * Initialize all client instances at server startup
   * Call this ONCE when server starts, before handling any requests
   */
  async initialize(config = {}) {
    if (this.initialized) {
      console.log('⚠️ [ALPACA CLIENT MANAGER] Already initialized, skipping');
      return;
    }

    console.log('🔧 [ALPACA CLIENT MANAGER] Initializing singleton clients...');

    try {
      // Create backtest client (uses paper trading keys but in backtest mode)
      this.clients.backtest = new AlpacaClient({
        keyId: config.paperKeyId || process.env.ALPACA_PAPER_API_KEY,
        secretKey: config.paperSecretKey || process.env.ALPACA_PAPER_API_SECRET,
        mode: 'backtest'
      });

      // Create live trading client
      this.clients.live = new AlpacaClient({
        keyId: config.liveKeyId || process.env.ALPACA_LIVE_API_KEY,
        secretKey: config.liveSecretKey || process.env.ALPACA_LIVE_API_SECRET,
        mode: 'live'
      });

      // Create paper trading client
      this.clients.paper = new AlpacaClient({
        keyId: config.paperKeyId || process.env.ALPACA_PAPER_API_KEY,
        secretKey: config.paperSecretKey || process.env.ALPACA_PAPER_API_SECRET,
        mode: 'paper'
      });

      this.initialized = true;
      console.log('✅ [ALPACA CLIENT MANAGER] All clients initialized successfully');

      // Add health check monitoring
      this.startHealthMonitoring();
    } catch (error) {
      console.error('❌ [ALPACA CLIENT MANAGER] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Get appropriate client for the request context
   * @param {string} mode - 'backtest', 'live', or 'paper'
   * @returns {AlpacaClient} Singleton client instance
   */
  getClient(mode = 'backtest') {
    if (!this.initialized) {
      throw new Error('AlpacaClientManager not initialized. Call initialize() at server startup.');
    }

    const client = this.clients[mode];
    if (!client) {
      throw new Error(`Unknown client mode: ${mode}. Valid modes: backtest, live, paper`);
    }

    return client;
  }

  /**
   * Health monitoring to detect dead connections
   */
  startHealthMonitoring() {
    setInterval(async () => {
      for (const [mode, client] of Object.entries(this.clients)) {
        if (!client) continue;

        try {
          // Simple health check - attempt to get account info
          // This will fail if connection is dead
          await client.getAccount();
        } catch (error) {
          console.error(`⚠️ [ALPACA CLIENT MANAGER] ${mode} client unhealthy:`, error.message);
          // In production, might want to attempt reconnection here
        }
      }
    }, 60000); // Check every 60 seconds
  }

  /**
   * Get connection statistics for monitoring
   */
  getStats() {
    return {
      initialized: this.initialized,
      clients: Object.keys(this.clients).reduce((stats, mode) => {
        stats[mode] = {
          exists: !!this.clients[mode],
          healthy: true // Would be determined by health checks
        };
        return stats;
      }, {})
    };
  }

  /**
   * Graceful shutdown - close all connections
   */
  async shutdown() {
    console.log('🔄 [ALPACA CLIENT MANAGER] Shutting down clients...');
    
    for (const [mode, client] of Object.entries(this.clients)) {
      if (client && client.close) {
        try {
          await client.close();
          console.log(`✅ [ALPACA CLIENT MANAGER] ${mode} client closed`);
        } catch (error) {
          console.error(`❌ [ALPACA CLIENT MANAGER] Error closing ${mode} client:`, error);
        }
      }
    }

    this.initialized = false;
    console.log('✅ [ALPACA CLIENT MANAGER] Shutdown complete');
  }
}

// Export singleton instance
const clientManager = new AlpacaClientManager();

module.exports = clientManager;
