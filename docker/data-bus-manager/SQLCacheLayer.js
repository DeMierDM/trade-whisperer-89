/**
 * SQLCacheLayer
 * Handles automatic database caching for bus data
 */

const { Pool } = require('pg');

class SQLCacheLayer {
  constructor(databaseUrl, options = {}) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: options.poolSize || 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    this.writeBuffer = [];
    this.batchSize = options.batchSize || 100;
    this.flushInterval = options.flushInterval || 5000; // 5 seconds

    // Start periodic flush
    this.flushTimer = setInterval(() => this.flushBuffer(), this.flushInterval);

    console.log('✅ SQLCacheLayer initialized');
    this.initializeTables();
  }

  /**
   * Initialize database tables for bus caching
   */
  async initializeTables() {
    try {
      // Stock data table
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS bus_stock_data (
          symbol VARCHAR(10) NOT NULL,
          data_type VARCHAR(20) NOT NULL,
          timestamp TIMESTAMPTZ NOT NULL,
          price DECIMAL(12,4),
          volume BIGINT,
          bid DECIMAL(12,4),
          ask DECIMAL(12,4),
          metadata JSONB,
          PRIMARY KEY (symbol, data_type, timestamp)
        )
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_bus_stock_symbol_time
        ON bus_stock_data (symbol, timestamp DESC)
      `);

      // Options data table
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS bus_option_data (
          symbol VARCHAR(50) NOT NULL,
          timestamp TIMESTAMPTZ NOT NULL,
          bid DECIMAL(12,4),
          ask DECIMAL(12,4),
          bid_size INTEGER,
          ask_size INTEGER,
          data_source VARCHAR(50),
          metadata JSONB,
          PRIMARY KEY (symbol, timestamp)
        )
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_bus_option_symbol_time
        ON bus_option_data (symbol, timestamp DESC)
      `);

      // Request deduplication log
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS bus_request_log (
          request_hash VARCHAR(64) PRIMARY KEY,
          request_params JSONB,
          response_data JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          ttl_expires_at TIMESTAMPTZ
        )
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_bus_requests_ttl
        ON bus_request_log (ttl_expires_at)
      `);

      console.log('✅ SQLCacheLayer tables initialized');
    } catch (error) {
      console.error('❌ Failed to initialize tables:', error.message);
    }
  }

  /**
   * Handle stock data update
   */
  handleStockUpdate(channel, data) {
    const [, symbol, dataType] = channel.split('.');

    this.writeBuffer.push({
      table: 'bus_stock_data',
      data: {
        symbol: symbol || data.symbol,
        data_type: dataType,
        timestamp: data.timestamp || new Date().toISOString(),
        price: data.price,
        volume: data.volume || data.size,
        bid: data.bid,
        ask: data.ask,
        metadata: JSON.stringify(data)
      }
    });

    if (this.writeBuffer.length >= this.batchSize) {
      this.flushBuffer();
    }
  }

  /**
   * Handle options data update
   */
  handleOptionsUpdate(channel, data) {
    // Skip if data is an array (option chain) - these aren't individual quotes
    if (Array.isArray(data)) {
      return;
    }

    // Extract symbol from channel or data
    const [, symbol] = channel.split('.');
    const optionSymbol = data.symbol || symbol;

    // Skip if we don't have a valid symbol
    if (!optionSymbol) {
      console.warn('⚠️ Skipping options data without symbol:', channel, data);
      return;
    }

    this.writeBuffer.push({
      table: 'bus_option_data',
      data: {
        symbol: optionSymbol,
        timestamp: data.timestamp || new Date().toISOString(),
        bid: data.bid,
        ask: data.ask,
        bid_size: data.bid_size,
        ask_size: data.ask_size,
        data_source: data.data_source || 'indicative_feed',
        metadata: JSON.stringify(data)
      }
    });

    if (this.writeBuffer.length >= this.batchSize) {
      this.flushBuffer();
    }
  }

  /**
   * Flush write buffer to database
   */
  async flushBuffer() {
    if (this.writeBuffer.length === 0) return;

    const batch = this.writeBuffer.splice(0, this.batchSize);
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const item of batch) {
        if (item.table === 'bus_stock_data') {
          await client.query(`
            INSERT INTO bus_stock_data (symbol, data_type, timestamp, price, volume, bid, ask, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (symbol, data_type, timestamp) DO UPDATE
            SET price = EXCLUDED.price, volume = EXCLUDED.volume,
                bid = EXCLUDED.bid, ask = EXCLUDED.ask, metadata = EXCLUDED.metadata
          `, [
            item.data.symbol,
            item.data.data_type,
            item.data.timestamp,
            item.data.price,
            item.data.volume,
            item.data.bid,
            item.data.ask,
            item.data.metadata
          ]);
        } else if (item.table === 'bus_option_data') {
          await client.query(`
            INSERT INTO bus_option_data (symbol, timestamp, bid, ask, bid_size, ask_size, data_source, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (symbol, timestamp) DO UPDATE
            SET bid = EXCLUDED.bid, ask = EXCLUDED.ask,
                bid_size = EXCLUDED.bid_size, ask_size = EXCLUDED.ask_size,
                data_source = EXCLUDED.data_source, metadata = EXCLUDED.metadata
          `, [
            item.data.symbol,
            item.data.timestamp,
            item.data.bid,
            item.data.ask,
            item.data.bid_size,
            item.data.ask_size,
            item.data.data_source,
            item.data.metadata
          ]);
        }
      }

      await client.query('COMMIT');
      console.log(`💾 Flushed ${batch.length} records to database`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Failed to flush buffer:', error.message);
    } finally {
      client.release();
    }
  }

  /**
   * Get historical stock data
   */
  async getHistoricalData(symbol, startDate, endDate) {
    try {
      const result = await this.pool.query(`
        SELECT * FROM bus_stock_data
        WHERE symbol = $1
          AND timestamp >= $2
          AND timestamp <= $3
        ORDER BY timestamp ASC
      `, [symbol, startDate, endDate]);

      return result.rows;
    } catch (error) {
      console.error('❌ Failed to get historical data:', error.message);
      return [];
    }
  }

  /**
   * Get historical options data
   */
  async getHistoricalOptions(symbol, startDate, endDate) {
    try {
      const result = await this.pool.query(`
        SELECT * FROM bus_option_data
        WHERE symbol = $1
          AND timestamp >= $2
          AND timestamp <= $3
        ORDER BY timestamp ASC
      `, [symbol, startDate, endDate]);

      return result.rows;
    } catch (error) {
      console.error('❌ Failed to get historical options:', error.message);
      return [];
    }
  }

  /**
   * Store aggregated OHLCV bars
   */
  async storeBars(bars) {
    if (!bars || bars.length === 0) return;

    try {
      const values = bars.map(bar => [
        bar.symbol,
        bar.timeframe,
        bar.bar_timestamp,
        bar.open,
        bar.high,
        bar.low,
        bar.close,
        bar.volume,
        bar.trade_count,
        bar.vwap
      ]);

      const placeholders = values.map((_, index) => {
        const start = index * 10;
        return `($${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 5}, $${start + 6}, $${start + 7}, $${start + 8}, $${start + 9}, $${start + 10})`;
      }).join(', ');

      const flatValues = values.flat();

      await this.pool.query(`
        INSERT INTO bus_stock_bars (
          symbol, timeframe, bar_timestamp, open, high, low, close, volume, trade_count, vwap
        ) VALUES ${placeholders}
        ON CONFLICT (symbol, timeframe, bar_timestamp) 
        DO UPDATE SET
          high = GREATEST(bus_stock_bars.high, EXCLUDED.high),
          low = LEAST(bus_stock_bars.low, EXCLUDED.low),
          close = EXCLUDED.close,
          volume = bus_stock_bars.volume + EXCLUDED.volume,
          trade_count = bus_stock_bars.trade_count + EXCLUDED.trade_count,
          vwap = EXCLUDED.vwap
      `, flatValues);

      console.log(`📊 Stored ${bars.length} aggregated bars`);
      
    } catch (error) {
      console.error('❌ Failed to store bars:', error.message);
      throw error;
    }
  }

  /**
   * Get historical aggregated bars
   */
  async getHistoricalBars(symbol, timeframe, startDate, endDate) {
    try {
      const result = await this.pool.query(`
        SELECT symbol, timeframe, bar_timestamp, open, high, low, close, volume, trade_count, vwap
        FROM bus_stock_bars
        WHERE symbol = $1 
          AND timeframe = $2
          AND bar_timestamp >= $3
          AND bar_timestamp <= $4
        ORDER BY bar_timestamp ASC
      `, [symbol, timeframe, startDate, endDate]);

      return result.rows;
    } catch (error) {
      console.error('❌ Failed to get historical bars:', error.message);
      return [];
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    try {
      const stockCount = await this.pool.query('SELECT COUNT(*) FROM bus_stock_data');
      const optionCount = await this.pool.query('SELECT COUNT(*) FROM bus_option_data');

      return {
        stockRecords: parseInt(stockCount.rows[0].count),
        optionRecords: parseInt(optionCount.rows[0].count),
        bufferSize: this.writeBuffer.length
      };
    } catch (error) {
      console.error('❌ Failed to get stats:', error.message);
      return { stockRecords: 0, optionRecords: 0, bufferSize: 0 };
    }
  }

  /**
   * Cleanup on shutdown
   */
  async destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Flush remaining buffer
    await this.flushBuffer();

    // Close pool
    await this.pool.end();
    console.log('🛑 SQLCacheLayer destroyed');
  }
}

module.exports = SQLCacheLayer;
