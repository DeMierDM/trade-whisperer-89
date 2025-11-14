/**
 * DatabaseManager - Manages paper trading database operations
 * Uses the existing paper trading schema from init-paper-trading.sql
 */

const { Pool } = require('pg');

class DatabaseManager {
  constructor(connectionString) {
    this.connectionString = connectionString;
    this.pool = null;
    this.connected = false;
  }

  /**
   * Initialize database connection
   */
  async initialize() {
    try {
      this.pool = new Pool({
        connectionString: this.connectionString,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // Test connection
      const client = await this.pool.connect();
      client.release();

      this.connected = true;
      console.log('✅ [Paper Trading] Database connection established');
      
      // Ensure paper trading tables exist
      await this.ensurePaperTradingTables();
      
    } catch (error) {
      console.error('❌ [Paper Trading] Database connection failed:', error);
      throw error;
    }
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
   * Close a position
   */
  async closePosition(positionId, exitPrice, exitReason) {
    try {
      const client = await this.pool.connect();
      
      await client.query(`
        UPDATE paper_positions 
        SET current_price = $1, status = 'closed',
            unrealized_pnl = ($1 - entry_price) * quantity,
            updated_at = NOW()
        WHERE id = $3
      `, [exitPrice, exitReason, positionId]);

      client.release();
      
      console.log(`✅ [Paper Trading] Position ${positionId} closed: ${exitReason}`);
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