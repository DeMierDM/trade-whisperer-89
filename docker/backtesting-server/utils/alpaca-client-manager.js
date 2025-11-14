/**
 * Alpaca Client Manager - Singleton Pattern
 * 
 * TIER 0.2: Per-request AlpacaClient instantiation prevention
 * TIER 0.3: Uses UnifiedAlpacaClient (merged 3 duplicate clients)
 * 
 * PROBLEMS SOLVED:
 * - Memory leaks from per-request instantiation
 * - Connection pool exhaustion
 * - Rate limiting issues
 * - Code duplication (3 separate client implementations merged)
 * 
 * SOLUTION: Single UnifiedAlpacaClient instance per mode (BACKTEST/LIVE/MOCK)
 * 
 * From ARCHITECTURAL_AUDIT_BRUTAL_HONEST.md TIER 0 Issues #2 & #3
 */

const UnifiedAlpacaClient = require('../../shared/UnifiedAlpacaClient');

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

    console.log('🔧 [ALPACA CLIENT MANAGER] Initializing UnifiedAlpacaClient singleton...');

    try {
      // Create BACKTEST mode client
      this.clients.backtest = new UnifiedAlpacaClient({
        mode: 'BACKTEST',
        apiKey: config.paperKeyId || process.env.ALPACA_PAPER_API_KEY,
        apiSecret: config.paperSecretKey || process.env.ALPACA_PAPER_API_SECRET
      });
      await this.clients.backtest.initialize();

      // Create LIVE mode client (paper trading)
      this.clients.live = new UnifiedAlpacaClient({
        mode: 'LIVE',
        apiKey: config.liveKeyId || process.env.ALPACA_LIVE_API_KEY || process.env.ALPACA_PAPER_API_KEY,
        apiSecret: config.liveSecretKey || process.env.ALPACA_LIVE_API_SECRET || process.env.ALPACA_PAPER_API_SECRET,
        paper: true
      });
      await this.clients.live.initialize();

      // Create MOCK mode client for testing
      this.clients.mock = new UnifiedAlpacaClient({
        mode: 'MOCK'
      });
      await this.clients.mock.initialize();

      this.initialized = true;
      console.log('✅ [ALPACA CLIENT MANAGER] All UnifiedAlpacaClient instances initialized');

      // Add health check monitoring
      this.startHealthMonitoring();
    } catch (error) {
      console.error('❌ [ALPACA CLIENT MANAGER] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Get appropriate UnifiedAlpacaClient for the request context
   * @param {string} mode - 'backtest', 'live', 'paper', or 'mock'
   * @returns {UnifiedAlpacaClient} Singleton client instance
   */
  getClient(mode = 'backtest') {
    if (!this.initialized) {
      throw new Error('AlpacaClientManager not initialized. Call initialize() at server startup.');
    }

    // Map 'paper' to 'live' for backwards compatibility
    const clientMode = mode === 'paper' ? 'live' : mode;

    const client = this.clients[clientMode];
    if (!client) {
      throw new Error(`Unknown client mode: ${mode}. Valid modes: backtest, live, paper, mock`);
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
          // Health check - testConnection for BACKTEST, isConnected for LIVE/MOCK
          if (mode === 'backtest') {
            await client.testConnection();
          } else {
            if (!client.isConnected()) {
              console.warn(`⚠️ [ALPACA CLIENT MANAGER] ${mode} client disconnected`);
            }
          }
        } catch (error) {
          console.error(`⚠️ [ALPACA CLIENT MANAGER] ${mode} client unhealthy:`, error.message);
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
