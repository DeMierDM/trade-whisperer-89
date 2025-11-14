/**
 * DatabaseManager - Manages paper trading database operations
 * Uses the existing paper trading schema from init-paper-trading.sql
 * Enhanced with retry logic, connection pooling, and health checks
 */

const { Pool } = require('pg');

class DatabaseManager {
  constructor(connectionString) {
    this.connectionString = connectionString;
    this.pool = null;
    this.connected = false;
    this.healthCheckInterval = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000; // Start with 5 seconds
  }

  /**
   * Initialize database connection with retry logic
   */
  async initialize() {
    const maxAttempts = 3;
    let attempt = 0;

    while (attempt < maxAttempts) {
      try {
        attempt++;
        console.log(`🔄 [Paper Trading] Connecting to database (attempt ${attempt}/${maxAttempts})...`);

        this.pool = new Pool({
          connectionString: this.connectionString,
          ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
          max: 20, // Maximum pool size
          min: 2, // Minimum pool size
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
          statement_timeout: 30000, // 30 second query timeout
          query_timeout: 30000,
          application_name: 'paper-trading-service'
        });

        // Handle pool errors
        this.pool.on('error', (err) => {
          console.error('❌ [Paper Trading] Unexpected pool error:', err);
          this.handlePoolError(err);
        });

        // Handle client connection errors
        this.pool.on('connect', () => {
          console.log('✅ [Paper Trading] New pool client connected');
        });

        // Test connection with timeout
        const testClient = await Promise.race([
          this.pool.connect(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout')), 5000)
          )
        ]);

        // Verify connection works
        await testClient.query('SELECT NOW()');
        testClient.release();

        this.connected = true;
        this.reconnectAttempts = 0;
        console.log('✅ [Paper Trading] Database connection established');
        
        // Ensure paper trading tables exist
        await this.ensurePaperTradingTables();

        // Start health check monitoring
        this.startHealthCheck();
        
        return; // Success, exit loop

      } catch (error) {
        console.error(`❌ [Paper Trading] Database connection failed (attempt ${attempt}/${maxAttempts}):`, error.message);
        
        if (attempt < maxAttempts) {
          const delay = attempt * 2000; // Exponential backoff: 2s, 4s
          console.log(`⏳ [Paper Trading] Retrying in ${delay/1000} seconds...`);
          await this.sleep(delay);
        } else {
          console.error('❌ [Paper Trading] Max connection attempts reached. Database unavailable.');
          throw error;
        }
      }
    }
  }

  /**
   * Start periodic health check
   */
  startHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        const client = await this.pool.connect();
        await client.query('SELECT 1');
        client.release();
        
        if (!this.connected) {
          console.log('✅ [Paper Trading] Database connection restored');
          this.connected = true;
          this.reconnectAttempts = 0;
        }
      } catch (error) {
        console.error('⚠️ [Paper Trading] Health check failed:', error.message);
        this.connected = false;
        
        // Attempt reconnection
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`🔄 [Paper Trading] Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
          await this.reconnect();
        }
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Handle pool errors and attempt reconnection
   */
  async handlePoolError(error) {
    console.error('❌ [Paper Trading] Pool error detected:', error.message);
    this.connected = false;

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 60000);
      console.log(`🔄 [Paper Trading] Reconnecting in ${delay/1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      await this.sleep(delay);
      await this.reconnect();
    } else {
      console.error('❌ [Paper Trading] Max reconnection attempts reached. Manual intervention required.');
    }
  }

  /**
   * Reconnect to database
   */
  async reconnect() {
    try {
      // Close existing pool
      if (this.pool) {
        await this.pool.end();
      }

      // Reinitialize
      await this.initialize();
    } catch (error) {
      console.error('❌ [Paper Trading] Reconnection failed:', error.message);
    }
  }

  /**
   * Execute query with retry logic
   */
  async query(text, params, maxRetries = 2) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (!this.connected) {
          throw new Error('Database not connected');
        }

        const client = await this.pool.connect();
        try {
          const result = await client.query(text, params);
          return result;
        } finally {
          client.release();
        }
      } catch (error) {
        lastError = error;
        console.error(`⚠️ [Paper Trading] Query failed (attempt ${attempt + 1}/${maxRetries + 1}):`, error.message);
        
        if (attempt < maxRetries) {
          await this.sleep(1000 * (attempt + 1)); // 1s, 2s
        }
      }
    }

    throw lastError;
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Ensure paper trading tables exist
   */
  async ensurePaperTradingTables() {
    try {
      const client = await this.pool.connect();
      
      // Check if paper_bots table exists
      const result = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'paper_bots'
        );
      `);

      if (!result.rows[0].exists) {
        console.log('🔧 [Paper Trading] Paper trading tables not found, they should be created by init-paper-trading.sql');
      } else {
        console.log('✅ [Paper Trading] Paper trading tables found');
      }

      client.release();
    } catch (error) {
      console.error('❌ [Paper Trading] Error checking tables:', error);
      throw error;
    }
  }

  /**
   * Create a new paper trading bot
   */
  async createBot(botData) {
    try {
      const client = await this.pool.connect();
      
      const result = await client.query(`
        INSERT INTO paper_bots (
          name, strategy_name, symbol, parameters, status, created_at
        ) VALUES ($1, $2, $3, $4, 'stopped', NOW())
        RETURNING id
      `, [
        botData.name,
        botData.strategyName,
        botData.symbol,
        JSON.stringify(botData.parameters)
      ]);

      client.release();
      
      const botId = result.rows[0].id;
      console.log(`✅ [Paper Trading] Created bot ${botId}: ${botData.name}`);
      
      return botId;
    } catch (error) {
      console.error('❌ [Paper Trading] Error creating bot:', error);
      throw error;
    }
  }

  /**
   * Update bot status
   */
  async updateBotStatus(botId, status) {
    try {
      const client = await this.pool.connect();
      
      const updateQuery = status === 'running' 
        ? 'UPDATE paper_bots SET status = $1, started_at = NOW() WHERE id = $2'
        : 'UPDATE paper_bots SET status = $1, stopped_at = NOW() WHERE id = $2';
        
      await client.query(updateQuery, [status, botId]);
      
      client.release();
      
      console.log(`✅ [Paper Trading] Bot ${botId} status updated to: ${status}`);
    } catch (error) {
      console.error('❌ [Paper Trading] Error updating bot status:', error);
      throw error;
    }
  }

  /**
   * Get active bots
   */
  async getActiveBots() {
    try {
      const client = await this.pool.connect();
      
      const result = await client.query(`
        SELECT 
          id as bot_id, name, strategy_name, symbol, parameters, 
          status, created_at, started_at, stopped_at,
          current_capital, initial_capital, max_positions
        FROM paper_bots 
        ORDER BY created_at DESC
      `);

      client.release();
      
      return result.rows;
    } catch (error) {
      console.error('❌ [Paper Trading] Error fetching bots:', error);
      throw error;
    }
  }

  /**
   * Get bot by ID
   */
  async getBotById(botId) {
    try {
      const client = await this.pool.connect();
      
      const result = await client.query(`
        SELECT *, id as bot_id FROM paper_bots WHERE id = $1
      `, [botId]);

      client.release();
      
      return result.rows[0] || null;
    } catch (error) {
      console.error('❌ [Paper Trading] Error fetching bot:', error);
      throw error;
    }
  }

  /**
   * Record a new signal
   */
  async recordSignal(signalData) {
    try {
      const client = await this.pool.connect();
      
      const result = await client.query(`
        INSERT INTO paper_signals (
          bot_id, underlying_symbol, signal_type, signal_strength, 
          underlying_price, signal_reason, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [
        signalData.botId,
        signalData.symbol,
        signalData.signalType,
        signalData.signalStrength,
        signalData.underlyingPrice,
        signalData.signalReason,
        signalData.timestamp || new Date()
      ]);

      client.release();
      
      return result.rows[0].id;
    } catch (error) {
      console.error('❌ [Paper Trading] Error recording signal:', error);
      throw error;
    }
  }

  /**
   * Open a new position
   */
  async openPosition(positionData) {
    try {
      const client = await this.pool.connect();
      
      const result = await client.query(`
        INSERT INTO paper_positions (
          bot_id, contract_symbol, underlying_symbol, 
          option_type, strike_price, expiry_date, quantity, entry_price, 
          entry_time, entry_signal_type, signal_strength, signal_reason,
          underlying_price_at_entry, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'open')
        RETURNING id
      `, [
        positionData.botId,
        positionData.optionSymbol,
        positionData.symbol,
        positionData.positionType,
        positionData.strikePrice,
        positionData.expiryDate,
        positionData.quantity,
        positionData.entryPrice,
        positionData.entryTime || new Date(),
        positionData.signalType,
        positionData.signalStrength,
        positionData.signalReason,
        positionData.underlyingPrice
      ]);

      client.release();
      
      return result.rows[0].id;
    } catch (error) {
      console.error('❌ [Paper Trading] Error opening position:', error);
      throw error;
    }
  }

  /**
   * Close a position and create trade record
   */
  async closePosition(positionId, exitPrice, exitReason) {
    try {
      const client = await this.pool.connect();
      
      // First get the position details before closing
      const positionResult = await client.query(`
        SELECT * FROM paper_positions WHERE id = $1
      `, [positionId]);
      
      if (positionResult.rows.length === 0) {
        throw new Error(`Position not found: ${positionId}`);
      }
      
      const position = positionResult.rows[0];
      const entryTime = new Date(position.entry_time);
      const exitTime = new Date();
      const durationMinutes = Math.round((exitTime - entryTime) / (1000 * 60));
      
      // Calculate P&L
      const grossPnL = (exitPrice - position.entry_price) * position.quantity;
      const commission = Math.abs(position.quantity) * 0.65 * 2; // Entry + exit
      const netPnL = grossPnL - commission;
      const returnPct = (grossPnL / (position.entry_price * Math.abs(position.quantity))) * 100;
      
      // Update position as closed
      await client.query(`
        UPDATE paper_positions 
        SET current_price = $1, status = 'closed',
            unrealized_pnl = $2,
            updated_at = NOW()
        WHERE id = $3
      `, [exitPrice, grossPnL, positionId]);
      
      // Create trade record
      const tradeResult = await client.query(`
        INSERT INTO paper_trades (
          bot_id, position_id, contract_symbol, underlying_symbol,
          option_type, strike_price, expiry_date, quantity,
          entry_price, exit_price, entry_time, exit_time,
          entry_signal_type, signal_strength, signal_reason,
          exit_reason, gross_pnl, commission, net_pnl, return_pct,
          underlying_price_entry, underlying_price_exit,
          duration_minutes, dte_at_entry
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 
          $17, $18, $19, $20, $21, $22, $23, $24
        ) RETURNING id
      `, [
        position.bot_id,
        positionId,
        position.contract_symbol,
        position.underlying_symbol,
        position.option_type,
        position.strike_price,
        position.expiry_date,
        position.quantity,
        position.entry_price,
        exitPrice,
        entryTime,
        exitTime,
        position.entry_signal_type,
        position.signal_strength,
        position.signal_reason,
        exitReason,
        grossPnL,
        commission,
        netPnL,
        returnPct,
        position.underlying_price_at_entry,
        null, // underlying_price_exit - would need current underlying price
        durationMinutes,
        0 // dte_at_entry - would need to calculate from entry date
      ]);
      
      client.release();
      
      const tradeId = tradeResult.rows[0].id;
      
      console.log(`✅ [Paper Trading] Position ${positionId} closed: ${exitReason}, Trade ${tradeId} created, P&L: $${netPnL.toFixed(2)}`);
      
      // Return trade details for broadcasting
      return {
        tradeId,
        positionId,
        botId: position.bot_id,
        contractSymbol: position.contract_symbol,
        side: position.quantity > 0 ? 'sell' : 'buy', // Closing position is opposite of entry
        quantity: Math.abs(position.quantity),
        fillPrice: exitPrice,
        pnl: netPnL,
        exitReason
      };
      
    } catch (error) {
      console.error('❌ [Paper Trading] Error closing position:', error);
      throw error;
    }
  }

  /**
   * Get bot positions
   */
  async getBotPositions(botId, status = null) {
    try {
      const client = await this.pool.connect();
      
      let query = `
        SELECT p.*
        FROM paper_positions p
        WHERE p.bot_id = $1
      `;
      
      const params = [botId];
      
      if (status) {
        query += ' AND p.status = $2';
        params.push(status);
      }
      
      query += ' ORDER BY p.entry_time DESC';
      
      const result = await client.query(query, params);

      client.release();
      
      return result.rows;
    } catch (error) {
      console.error('❌ [Paper Trading] Error fetching positions:', error);
      throw error;
    }
  }

  /**
   * Get bot trades
   */
  async getBotTrades(botId, limit = 50) {
    try {
      const client = await this.pool.connect();
      
      const result = await client.query(`
        SELECT * FROM paper_trades
        WHERE bot_id = $1
        ORDER BY exit_time DESC
        LIMIT $2
      `, [botId, limit]);

      client.release();
      
      return result.rows;
    } catch (error) {
      console.error('❌ [Paper Trading] Error fetching trades:', error);
      throw error;
    }
  }

  /**
   * Get bot trades (closed positions)
   */
  async getBotTrades(botId, limit = 50) {
    try {
      const client = await this.pool.connect();
      
      const result = await client.query(`
        SELECT *
        FROM paper_trades
        WHERE bot_id = $1
        ORDER BY exit_time DESC
        LIMIT $2
      `, [botId, limit]);

      client.release();
      
      return result.rows;
    } catch (error) {
      console.error('❌ [Paper Trading] Error fetching trades:', error);
      throw error;
    }
  }

  /**
   * Get bot performance metrics
   */
  async getBotPerformance(botId) {
    try {
      const client = await this.pool.connect();
      
      const result = await client.query(`
        SELECT 
          COUNT(*) as total_trades,
          COUNT(*) FILTER (WHERE net_pnl > 0) as winning_trades,
          COUNT(*) FILTER (WHERE net_pnl < 0) as losing_trades,
          COALESCE(SUM(net_pnl), 0) as total_pnl,
          COALESCE(AVG(net_pnl), 0) as avg_pnl,
          COALESCE(MAX(net_pnl), 0) as best_trade,
          COALESCE(MIN(net_pnl), 0) as worst_trade
        FROM paper_trades 
        WHERE bot_id = $1
      `, [botId]);

      const openPositions = await client.query(`
        SELECT COUNT(*) as open_positions
        FROM paper_positions 
        WHERE bot_id = $1 AND status = 'open'
      `, [botId]);

      client.release();
      
      const stats = result.rows[0];
      const positions = openPositions.rows[0];
      
      // Calculate additional metrics
      const winRate = stats.total_trades > 0 
        ? (stats.winning_trades / stats.total_trades * 100).toFixed(2)
        : 0;

      return {
        ...stats,
        win_rate: parseFloat(winRate),
        total_trades: parseInt(stats.total_trades),
        winning_trades: parseInt(stats.winning_trades),
        losing_trades: parseInt(stats.losing_trades),
        total_pnl: parseFloat(stats.total_pnl),
        avg_pnl: parseFloat(stats.avg_pnl),
        best_trade: parseFloat(stats.best_trade),
        worst_trade: parseFloat(stats.worst_trade),
        open_positions: parseInt(positions.open_positions)
      };
    } catch (error) {
      console.error('❌ [Paper Trading] Error fetching performance:', error);
      throw error;
    }
  }

  /**
   * Get recent signals
   */
  async getRecentSignals(symbol = null, limit = 20) {
    try {
      const client = await this.pool.connect();
      
      let query = `
        SELECT s.*, b.name as bot_name
        FROM paper_signals s
        LEFT JOIN paper_bots b ON s.bot_id = b.id
      `;
      
      const params = [];
      
      if (symbol) {
        query += ' WHERE s.underlying_symbol = $1';
        params.push(symbol);
      }
      
      query += ` ORDER BY s.timestamp DESC LIMIT $${params.length + 1}`;
      params.push(limit);
      
      const result = await client.query(query, params);

      client.release();
      
      return result.rows;
    } catch (error) {
      console.error('❌ [Paper Trading] Error fetching signals:', error);
      throw error;
    }
  }

  /**
   * Update bot metrics (called periodically)
   */
  async updateBotMetrics(botId) {
    try {
      const client = await this.pool.connect();
      
      // Get performance stats
      const performance = await this.getBotPerformance(botId);
      
      // Update bot record  
      await client.query(`
        UPDATE paper_bots 
        SET current_capital = initial_capital + $1, last_heartbeat = NOW()
        WHERE id = $2
      `, [
        performance.total_pnl,
        botId
      ]);

      client.release();
      
    } catch (error) {
      console.error('❌ [Paper Trading] Error updating bot metrics:', error);
      throw error;
    }
  }

  /**
   * Generic query method for compatibility with MultiBotManager
   */
  async query(sql, params = []) {
    try {
      const client = await this.pool.connect();
      const result = await client.query(sql, params);
      client.release();
      return result;
    } catch (error) {
      console.error('❌ [Database] Query error:', error);
      throw error;
    }
  }

  /**
   * Get all positions for live chart
   */
  async getAllPositions() {
    try {
      const client = await this.pool.connect();
      const result = await client.query(`
        SELECT * FROM paper_positions 
        WHERE status = 'open'
        ORDER BY entry_time DESC
      `);
      client.release();
      return result.rows;
    } catch (error) {
      console.error('❌ [Paper Trading] Error fetching all positions:', error);
      throw error;
    }
  }

  /**
   * Get all trades for live chart
   */
  async getAllTrades(limit = 100) {
    try {
      const client = await this.pool.connect();
      const result = await client.query(`
        SELECT * FROM paper_trades 
        ORDER BY created_at DESC
        LIMIT $1
      `, [limit]);
      client.release();
      return result.rows;
    } catch (error) {
      console.error('❌ [Paper Trading] Error fetching all trades:', error);
      throw error;
    }
  }

  /**
   * Get all bot metrics for live chart
   */
  async getAllBotMetrics() {
    try {
      const client = await this.pool.connect();
      const result = await client.query(`
        SELECT m.*, b.name, b.status, b.symbol 
        FROM paper_bot_metrics m
        JOIN paper_bots b ON m.bot_id = b.id
        ORDER BY m.updated_at DESC
      `);
      client.release();
      return result.rows;
    } catch (error) {
      console.error('❌ [Paper Trading] Error fetching all bot metrics:', error);
      throw error;
    }
  }

  /**
   * Get historical aggregated bars from data bus cache
   */
  async getHistoricalBars(symbol, timeframe, startDate, endDate, limit = 400) {
    try {
      const client = await this.pool.connect();
      const result = await client.query(`
        SELECT 
          bar_timestamp as timestamp,
          open,
          high,
          low,
          close,
          volume,
          trade_count,
          vwap
        FROM bus_stock_bars
        WHERE symbol = $1 
          AND timeframe = $2
          AND bar_timestamp >= $3
          AND bar_timestamp <= $4
        ORDER BY bar_timestamp ASC
        LIMIT $5
      `, [symbol, timeframe, startDate, endDate, limit]);
      client.release();
      
      console.log(`📊 Found ${result.rows.length} aggregated bars for ${symbol} (${timeframe})`);
      return result.rows;
    } catch (error) {
      console.error('❌ [Database] Error fetching historical bars:', error);
      return [];
    }
  }

  /**
   * Get raw historical stock data from WebSocket cache
   */
  async getHistoricalStockData(symbol, startDate, endDate) {
    try {
      const client = await this.pool.connect();
      const result = await client.query(`
        SELECT 
          timestamp,
          price,
          volume,
          bid,
          ask,
          data_type
        FROM bus_stock_data
        WHERE symbol = $1 
          AND timestamp >= $2
          AND timestamp <= $3
          AND data_type IN ('trade', 'quote')
        ORDER BY timestamp ASC
      `, [symbol, startDate, endDate]);
      client.release();
      
      console.log(`📊 Found ${result.rows.length} raw data points for ${symbol}`);
      return result.rows;
    } catch (error) {
      console.error('❌ [Database] Error fetching raw stock data:', error);
      return [];
    }
  }

  /**
   * Build minute bars from raw trade/quote data
   */
  async buildBarsFromRawData(rawData, timeframe = '1m') {
    if (!rawData || rawData.length === 0) {
      console.log('📊 No raw data to build bars from');
      return [];
    }

    const bars = new Map();
    
    for (const dataPoint of rawData) {
      if (dataPoint.data_type !== 'trade' || !dataPoint.price) continue;
      
      const timestamp = new Date(dataPoint.timestamp);
      const barTime = this.getBarTimestamp(timestamp, timeframe);
      const barKey = barTime.getTime();
      
      if (!bars.has(barKey)) {
        bars.set(barKey, {
          timestamp: barTime.toISOString(),
          open: dataPoint.price,
          high: dataPoint.price,
          low: dataPoint.price,
          close: dataPoint.price,
          volume: dataPoint.volume || 0
        });
      } else {
        const bar = bars.get(barKey);
        bar.high = Math.max(bar.high, dataPoint.price);
        bar.low = Math.min(bar.low, dataPoint.price);
        bar.close = dataPoint.price;
        bar.volume += (dataPoint.volume || 0);
      }
    }
    
    const result = Array.from(bars.values()).sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    console.log(`📊 Built ${result.length} bars from ${rawData.length} raw data points`);
    return result;
  }

  /**
   * Get bar timestamp aligned to timeframe boundary (helper method)
   */
  getBarTimestamp(timestamp, timeframe) {
    const date = new Date(timestamp);
    
    switch (timeframe) {
      case '1m':
        date.setSeconds(0, 0);
        break;
      case '5m':
        const minutes5 = Math.floor(date.getMinutes() / 5) * 5;
        date.setMinutes(minutes5, 0, 0);
        break;
      case '15m':
        const minutes15 = Math.floor(date.getMinutes() / 15) * 15;
        date.setMinutes(minutes15, 0, 0);
        break;
      case '30m':
        const minutes30 = Math.floor(date.getMinutes() / 30) * 30;
        date.setMinutes(minutes30, 0, 0);
        break;
      case '1h':
        date.setMinutes(0, 0, 0);
        break;
    }
    
    return date;
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connected && this.pool;
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.connected = false;
      console.log('🛑 [Paper Trading] Database connection closed');
    }
  }
}

module.exports = DatabaseManager;