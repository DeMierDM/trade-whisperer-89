/**
 * Expiration Manager - Automatic 0DTE Position Closing
 * 
 * PROBLEM SOLVED: 0DTE positions held to expiration causing $500-$2000 daily losses
 * 
 * SOLUTION:
 * - Identifies 0DTE (same-day expiration) positions
 * - Sends warning at 3:40 PM ET
 * - Force closes all 0DTE positions at 3:50 PM ET
 * - Logs all closes with expiration reason
 * 
 * From ARCHITECTURAL_AUDIT_BRUTAL_HONEST.md TIER 1 Issue #1
 */

const moment = require('moment-timezone');

class ExpirationManager {
  constructor(bot, logger) {
    this.bot = bot;
    this.logger = logger || console;
    this.warningTime = '15:40'; // 3:40 PM ET
    this.closeTime = '15:50'; // 3:50 PM ET
    this.marketCloseTime = '16:00'; // 4:00 PM ET
    this.timezone = 'America/New_York';
    this.warningInterval = null;
    this.closeInterval = null;
    this.hasWarnedToday = false;
    this.hasClosedToday = false;
  }

  /**
   * Start monitoring for 0DTE positions
   */
  start() {
    this.logger.log('📅 [EXPIRATION MANAGER] Starting 0DTE monitoring');
    
    // Check every minute for warning and close times
    this.warningInterval = setInterval(() => {
      this.checkWarningTime();
    }, 60000); // Every 60 seconds

    this.closeInterval = setInterval(() => {
      this.checkCloseTime();
    }, 60000); // Every 60 seconds

    // Reset flags at market open
    this.resetDailyFlags();
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.warningInterval) {
      clearInterval(this.warningInterval);
      this.warningInterval = null;
    }
    if (this.closeInterval) {
      clearInterval(this.closeInterval);
      this.closeInterval = null;
    }
    this.logger.log('⏹️ [EXPIRATION MANAGER] Stopped 0DTE monitoring');
  }

  /**
   * Check if it's time to send warning (3:40 PM ET)
   */
  async checkWarningTime() {
    const now = moment().tz(this.timezone);
    const currentTime = now.format('HH:mm');

    if (currentTime === this.warningTime && !this.hasWarnedToday) {
      await this.sendExpirationWarning();
      this.hasWarnedToday = true;
    }
  }

  /**
   * Check if it's time to force close (3:50 PM ET)
   */
  async checkCloseTime() {
    const now = moment().tz(this.timezone);
    const currentTime = now.format('HH:mm');

    if (currentTime === this.closeTime && !this.hasClosedToday) {
      await this.forceClose0DTEPositions();
      this.hasClosedToday = true;
    }
  }

  /**
   * Send warning about upcoming 0DTE position closes
   */
  async sendExpirationWarning() {
    try {
      const odtePositions = await this.get0DTEPositions();
      
      if (odtePositions.length === 0) {
        this.logger.log('✅ [EXPIRATION MANAGER] No 0DTE positions to warn about');
        return;
      }

      this.logger.log(`⚠️ [EXPIRATION MANAGER] WARNING: ${odtePositions.length} 0DTE positions will be closed in 10 minutes`);
      
      for (const position of odtePositions) {
        this.logger.log(`   ⏰ ${position.symbol} - ${position.qty} contracts expiring today`);
      }

      // Emit warning event for WebSocket notification
      if (this.bot.emit) {
        this.bot.emit('expiration_warning', {
          timestamp: new Date(),
          positions: odtePositions,
          closeTime: this.closeTime,
          minutesUntilClose: 10
        });
      }
    } catch (error) {
      this.logger.error('❌ [EXPIRATION MANAGER] Error sending warning:', error);
    }
  }

  /**
   * Force close all 0DTE positions at 3:50 PM ET
   */
  async forceClose0DTEPositions() {
    try {
      const odtePositions = await this.get0DTEPositions();
      
      if (odtePositions.length === 0) {
        this.logger.log('✅ [EXPIRATION MANAGER] No 0DTE positions to close');
        return;
      }

      this.logger.log(`🚨 [EXPIRATION MANAGER] FORCE CLOSING ${odtePositions.length} 0DTE POSITIONS`);
      
      const closeResults = [];

      for (const position of odtePositions) {
        try {
          const result = await this.closePosition(position);
          closeResults.push({
            symbol: position.symbol,
            success: true,
            result
          });
          
          this.logger.log(`✅ [0DTE CLOSE] ${position.symbol} closed successfully`);
        } catch (error) {
          this.logger.error(`❌ [0DTE CLOSE] Failed to close ${position.symbol}:`, error.message);
          closeResults.push({
            symbol: position.symbol,
            success: false,
            error: error.message
          });
        }
      }

      // Emit close event for WebSocket notification
      if (this.bot.emit) {
        this.bot.emit('0dte_close_complete', {
          timestamp: new Date(),
          closedCount: closeResults.filter(r => r.success).length,
          failedCount: closeResults.filter(r => !r.success).length,
          results: closeResults
        });
      }

      this.logger.log(`📊 [EXPIRATION MANAGER] 0DTE Close Summary: ${closeResults.filter(r => r.success).length} successful, ${closeResults.filter(r => !r.success).length} failed`);
      
    } catch (error) {
      this.logger.error('❌ [EXPIRATION MANAGER] Error force closing 0DTE positions:', error);
    }
  }

  /**
   * Get all 0DTE (same-day expiration) positions
   */
  async get0DTEPositions() {
    try {
      // Get all open positions from bot
      const positions = await this.bot.getOpenPositions();
      const today = moment().tz(this.timezone).format('YYYY-MM-DD');
      
      // Filter for positions expiring today
      const odtePositions = positions.filter(position => {
        if (!position.symbol || !position.symbol.includes('C') && !position.symbol.includes('P')) {
          return false; // Not an option
        }
        
        const expiration = this.extractExpirationDate(position.symbol);
        return expiration === today;
      });

      return odtePositions;
    } catch (error) {
      this.logger.error('❌ [EXPIRATION MANAGER] Error getting 0DTE positions:', error);
      return [];
    }
  }

  /**
   * Close a position with expiration reason
   */
  async closePosition(position) {
    // Create close order
    const order = {
      symbol: position.symbol,
      qty: Math.abs(position.qty),
      side: position.qty > 0 ? 'sell' : 'buy', // Close long or short
      type: 'market',
      time_in_force: 'day',
      client_order_id: `0DTE_CLOSE_${Date.now()}`,
      order_class: 'simple'
    };

    // Submit order through bot's trading interface
    const result = await this.bot.submitOrder(order);

    // Log close with expiration reason
    await this.logExpirationClose(position, result);

    return result;
  }

  /**
   * Log the expiration close to database
   */
  async logExpirationClose(position, orderResult) {
    try {
      const logEntry = {
        bot_id: this.bot.id,
        position_symbol: position.symbol,
        position_qty: position.qty,
        close_reason: '0DTE_EXPIRATION',
        close_time: new Date(),
        close_price: orderResult.filled_avg_price || orderResult.limit_price,
        order_id: orderResult.id,
        forced: true
      };

      // Insert to database if available
      if (this.bot.db && this.bot.db.query) {
        await this.bot.db.query(
          `INSERT INTO paper_bot_position_closes 
           (bot_id, position_symbol, position_qty, close_reason, close_time, close_price, order_id, forced)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            logEntry.bot_id,
            logEntry.position_symbol,
            logEntry.position_qty,
            logEntry.close_reason,
            logEntry.close_time,
            logEntry.close_price,
            logEntry.order_id,
            logEntry.forced
          ]
        );
      }

      this.logger.log(`📝 [EXPIRATION MANAGER] Logged 0DTE close: ${position.symbol}`);
    } catch (error) {
      this.logger.error('❌ [EXPIRATION MANAGER] Error logging close:', error);
    }
  }

  /**
   * Extract expiration date from option symbol
   * Format: SPY251220C00500000 → 2025-12-20
   */
  extractExpirationDate(symbol) {
    try {
      // OCC format: ROOT[YY][MM][DD][C/P]
      const match = symbol.match(/([A-Z]+)(\d{6})([CP])(\d{8})/);
      if (!match) return null;

      const dateStr = match[2]; // YYMMDD
      const year = '20' + dateStr.substring(0, 2);
      const month = dateStr.substring(2, 4);
      const day = dateStr.substring(4, 6);

      return `${year}-${month}-${day}`;
    } catch (error) {
      this.logger.error('❌ [EXPIRATION MANAGER] Error parsing symbol:', symbol, error);
      return null;
    }
  }

  /**
   * Reset daily flags at market open (9:30 AM ET)
   */
  resetDailyFlags() {
    const now = moment().tz(this.timezone);
    const marketOpen = moment().tz(this.timezone).hour(9).minute(30).second(0);
    
    // Calculate milliseconds until next market open
    let msUntilOpen;
    if (now.isBefore(marketOpen)) {
      msUntilOpen = marketOpen.diff(now);
    } else {
      // Tomorrow's market open
      const tomorrowOpen = marketOpen.add(1, 'day');
      msUntilOpen = tomorrowOpen.diff(now);
    }

    // Schedule flag reset
    setTimeout(() => {
      this.hasWarnedToday = false;
      this.hasClosedToday = false;
      this.logger.log('🔄 [EXPIRATION MANAGER] Daily flags reset for new trading day');
      
      // Schedule next reset (24 hours later)
      this.resetDailyFlags();
    }, msUntilOpen);
  }

  /**
   * Get minutes until market close
   */
  getMinutesUntilMarketClose() {
    const now = moment().tz(this.timezone);
    const close = moment().tz(this.timezone);
    const [hour, minute] = this.marketCloseTime.split(':');
    close.hour(parseInt(hour)).minute(parseInt(minute)).second(0);

    if (now.isAfter(close)) {
      return 0;
    }

    return close.diff(now, 'minutes');
  }

  /**
   * Get status for monitoring
   */
  getStatus() {
    return {
      monitoring: !!this.warningInterval && !!this.closeInterval,
      hasWarnedToday: this.hasWarnedToday,
      hasClosedToday: this.hasClosedToday,
      warningTime: this.warningTime,
      closeTime: this.closeTime,
      marketCloseTime: this.marketCloseTime,
      minutesUntilClose: this.getMinutesUntilMarketClose()
    };
  }
}

module.exports = ExpirationManager;
