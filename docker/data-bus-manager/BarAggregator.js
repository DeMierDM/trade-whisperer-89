/**
 * BarAggregator
 * Real-time OHLCV bar aggregation from trade data
 */

class BarAggregator {
  constructor(sqlCache) {
    this.sqlCache = sqlCache;
    this.activeIntervals = ['1m']; // Start with 1-minute, expand later
    this.pendingBars = new Map(); // barKey -> current bar data
    this.flushTimeouts = new Map(); // barKey -> timeout handle
    
    console.log('📊 BarAggregator initialized with intervals:', this.activeIntervals);
  }

  /**
   * Process incoming trade and update all active timeframe bars
   */
  onTradeReceived(tradeData) {
    try {
      const trade = {
        symbol: tradeData.symbol,
        price: parseFloat(tradeData.price),
        size: parseInt(tradeData.volume || tradeData.size || 1),
        timestamp: new Date(tradeData.timestamp)
      };

      if (!trade.symbol || !trade.price || isNaN(trade.price)) {
        console.warn('📊 Invalid trade data:', tradeData);
        return;
      }

      // Process trade for all active intervals
      this.activeIntervals.forEach(interval => {
        this.updateBar(interval, trade);
      });

    } catch (error) {
      console.error('📊 Error processing trade:', error, tradeData);
    }
  }

  /**
   * Update OHLCV bar for specific timeframe
   */
  updateBar(interval, trade) {
    const barTimestamp = this.getBarTimestamp(trade.timestamp, interval);
    const barKey = `${trade.symbol}:${interval}:${barTimestamp.getTime()}`;
    
    let currentBar = this.pendingBars.get(barKey);
    
    if (!currentBar) {
      // Create new bar
      currentBar = {
        symbol: trade.symbol,
        timeframe: interval,
        bar_timestamp: barTimestamp,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: trade.size,
        trade_count: 1,
        vwap_sum: trade.price * trade.size,
        vwap_volume: trade.size
      };
      
      console.log(`📊 New ${interval} bar started for ${trade.symbol} at ${barTimestamp.toISOString()}`);
      
      // Schedule bar completion based on timeframe
      this.scheduleBarFlush(barKey, interval, barTimestamp);
    } else {
      // Update existing bar
      currentBar.high = Math.max(currentBar.high, trade.price);
      currentBar.low = Math.min(currentBar.low, trade.price);
      currentBar.close = trade.price;
      currentBar.volume += trade.size;
      currentBar.trade_count += 1;
      currentBar.vwap_sum += (trade.price * trade.size);
      currentBar.vwap_volume += trade.size;
    }
    
    this.pendingBars.set(barKey, currentBar);
  }

  /**
   * Get bar timestamp aligned to timeframe boundary
   */
  getBarTimestamp(timestamp, interval, preserveSeconds = false) {
    const date = new Date(timestamp);
    
    switch (interval) {
      case '1m':
        // 🔧 FIX: Preserve seconds for options data to avoid duplicate timestamps
        if (!preserveSeconds) {
          date.setSeconds(0, 0); // Round down to minute boundary for aggregated data
        }
        // Otherwise keep full timestamp precision for individual bars
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
      default:
        // For seconds-based intervals like '5s', '15s', '30s'
        if (interval.endsWith('s')) {
          const seconds = parseInt(interval);
          const alignedSeconds = Math.floor(date.getSeconds() / seconds) * seconds;
          date.setSeconds(alignedSeconds, 0);
        }
    }
    
    return date;
  }

  /**
   * Schedule automatic bar flush when timeframe completes
   */
  scheduleBarFlush(barKey, interval, barTimestamp) {
    // Calculate when this bar should be flushed
    const nextBarTime = this.getNextBarTime(barTimestamp, interval);
    const flushDelay = Math.max(1000, nextBarTime.getTime() - Date.now() + 1000); // +1s buffer
    
    const timeoutId = setTimeout(() => {
      this.flushBar(barKey);
    }, flushDelay);
    
    this.flushTimeouts.set(barKey, timeoutId);
  }

  /**
   * Get the timestamp when next bar should start (current bar ends)
   */
  getNextBarTime(barTimestamp, interval) {
    const nextTime = new Date(barTimestamp);
    
    switch (interval) {
      case '1m':
        nextTime.setMinutes(nextTime.getMinutes() + 1);
        break;
      case '5m':
        nextTime.setMinutes(nextTime.getMinutes() + 5);
        break;
      case '15m':
        nextTime.setMinutes(nextTime.getMinutes() + 15);
        break;
      case '30m':
        nextTime.setMinutes(nextTime.getMinutes() + 30);
        break;
      case '1h':
        nextTime.setHours(nextTime.getHours() + 1);
        break;
      default:
        if (interval.endsWith('s')) {
          const seconds = parseInt(interval);
          nextTime.setSeconds(nextTime.getSeconds() + seconds);
        }
    }
    
    return nextTime;
  }

  /**
   * Flush completed bar to database
   */
  async flushBar(barKey) {
    try {
      const bar = this.pendingBars.get(barKey);
      if (!bar) return;

      // Calculate VWAP
      bar.vwap = bar.vwap_volume > 0 ? bar.vwap_sum / bar.vwap_volume : bar.close;

      // Remove temporary VWAP calculation fields
      delete bar.vwap_sum;
      delete bar.vwap_volume;

      // Store in database
      await this.sqlCache.storeBars([bar]);

      console.log(`📊 Flushed ${bar.timeframe} bar for ${bar.symbol}: O:${bar.open} H:${bar.high} L:${bar.low} C:${bar.close} V:${bar.volume} (${bar.trade_count} trades)`);

      // Cleanup
      this.pendingBars.delete(barKey);
      
      const timeoutId = this.flushTimeouts.get(barKey);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this.flushTimeouts.delete(barKey);
      }

    } catch (error) {
      console.error('📊 Error flushing bar:', barKey, error);
    }
  }

  /**
   * Force flush all pending bars (for shutdown)
   */
  async flushAllPendingBars() {
    console.log('📊 Flushing all pending bars...');
    const flushPromises = Array.from(this.pendingBars.keys()).map(barKey => 
      this.flushBar(barKey)
    );
    
    await Promise.all(flushPromises);
    console.log('📊 All pending bars flushed');
  }

  /**
   * Add new timeframe for aggregation
   */
  addTimeframe(interval) {
    if (!this.activeIntervals.includes(interval)) {
      this.activeIntervals.push(interval);
      console.log('📊 Added timeframe:', interval);
    }
  }

  /**
   * Get statistics about current aggregation state
   */
  getStats() {
    const stats = {
      activeIntervals: this.activeIntervals,
      pendingBars: this.pendingBars.size,
      scheduledFlushes: this.flushTimeouts.size
    };

    // Group by timeframe
    const byTimeframe = {};
    for (const barKey of this.pendingBars.keys()) {
      const [symbol, timeframe] = barKey.split(':');
      if (!byTimeframe[timeframe]) byTimeframe[timeframe] = 0;
      byTimeframe[timeframe]++;
    }
    stats.barsByTimeframe = byTimeframe;

    return stats;
  }
}

module.exports = BarAggregator;