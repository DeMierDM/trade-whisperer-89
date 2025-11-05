/**
 * Market Hours Utility
 * 
 * Provides market hours validation for backtesting
 * Filters out after-hours and pre-market data to ensure realistic trading simulation
 */

const moment = require('moment-timezone');

class MarketHours {
  constructor() {
    this.timezone = 'America/New_York';
    this.marketOpen = 930;   // 9:30 AM
    this.marketClose = 1600; // 4:00 PM (16:00)
  }

  /**
   * Check if a timestamp is during regular market hours
   * @param {string|Date} timestamp - UTC timestamp to check
   * @returns {boolean} True if during market hours (9:30 AM - 4:00 PM ET)
   */
  isMarketHours(timestamp) {
    const etTime = moment(timestamp).tz(this.timezone);
    const dayOfWeek = etTime.day(); // 0 = Sunday, 6 = Saturday
    
    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return false;
    }
    
    const hour = etTime.hour();
    const minute = etTime.minute();
    const currentTime = hour * 100 + minute; // HHMM format
    
    return currentTime >= this.marketOpen && currentTime < this.marketClose;
  }

  /**
   * Filter an array of bars to only include market hours
   * @param {Array} bars - Array of OHLCV bars with timestamp property (t or timestamp)
   * @returns {Array} Filtered bars during market hours only
   */
  filterMarketHoursBars(bars) {
    if (!Array.isArray(bars)) {
      return [];
    }

    const filtered = bars.filter(bar => {
      // Handle both 't' and 'timestamp' property names
      const timestamp = bar.t || bar.timestamp;
      if (!timestamp) return false;
      return this.isMarketHours(timestamp);
    });

    const original = bars.length;
    const afterFilter = filtered.length;
    const removed = original - afterFilter;

    if (removed > 0) {
      console.log(`⏰ [MARKET HOURS] Filtered ${removed} after-hours bars (${original} → ${afterFilter})`);
    }

    return filtered;
  }

  /**
   * Get readable market status for a timestamp
   * @param {string|Date} timestamp - UTC timestamp to check
   * @returns {Object} Market status information
   */
  getMarketStatus(timestamp) {
    const etTime = moment(timestamp).tz(this.timezone);
    const dayOfWeek = etTime.day();
    const hour = etTime.hour();
    const minute = etTime.minute();
    const currentTime = hour * 100 + minute;

    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return {
        isOpen: false,
        status: 'weekend',
        time: etTime.format('dddd, YYYY-MM-DD HH:mm z')
      };
    }

    if (currentTime < this.marketOpen) {
      return {
        isOpen: false,
        status: 'pre-market',
        time: etTime.format('dddd, YYYY-MM-DD HH:mm z')
      };
    }

    if (currentTime >= this.marketClose) {
      return {
        isOpen: false,
        status: 'after-hours',
        time: etTime.format('dddd, YYYY-MM-DD HH:mm z')
      };
    }

    return {
      isOpen: true,
      status: 'market-hours',
      time: etTime.format('dddd, YYYY-MM-DD HH:mm z')
    };
  }

  /**
   * Log market hours filtering activity
   * @param {Array} originalBars - Original bars before filtering
   * @param {Array} filteredBars - Bars after market hours filtering
   * @param {string} symbol - Symbol being processed
   */
  logFilteringActivity(originalBars, filteredBars, symbol = 'unknown') {
    if (!Array.isArray(originalBars) || !Array.isArray(filteredBars)) return;

    const removed = originalBars.length - filteredBars.length;
    
    if (removed === 0) {
      console.log(`⏰ [MARKET HOURS] ${symbol}: All ${originalBars.length} bars during market hours`);
      return;
    }

    console.log(`⏰ [MARKET HOURS] ${symbol}: Filtered ${removed} after-hours bars (${originalBars.length} → ${filteredBars.length})`);
    
    // Log first few removed timestamps for debugging
    if (removed > 0 && originalBars.length > filteredBars.length) {
      const removedBars = originalBars.filter(bar => {
        const originalTimestamp = bar.t || bar.timestamp;
        return !filteredBars.find(filtered => {
          const filteredTimestamp = filtered.t || filtered.timestamp;
          return filteredTimestamp === originalTimestamp;
        });
      });
      
      const sampleRemoved = removedBars.slice(0, 3);
      sampleRemoved.forEach(bar => {
        const timestamp = bar.t || bar.timestamp;
        const status = this.getMarketStatus(timestamp);
        console.log(`   ⚠️ Removed ${timestamp} (${status.status}): ${status.time}`);
      });
      
      if (removedBars.length > 3) {
        console.log(`   ... and ${removedBars.length - 3} more after-hours bars`);
      }
    }
  }
}

module.exports = MarketHours;