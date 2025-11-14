/**
 * Hourly-Anchored VWAP (HAVWAP) Options Strategy
 * 
 * Strategy Logic:
 * - Calculates VWAP that resets every hour
 * - Generates signals based on price vs VWAP and VWAP slope
 * - Selects option contracts based on target delta
 * - Manages positions with profit target, stop loss, and time stops
 * 
 * Entry Signals:
 * - BUY CALL: Price below VWAP with positive slope (bullish reversal)
 * - BUY PUT: Price above VWAP with negative slope (bearish reversal)
 * 
 * Exit Conditions:
 * - Profit target reached
 * - Stop loss hit
 * - Max holding period exceeded
 * - 0DTE auto-close at 3:50 PM ET
 */

const moment = require('moment-timezone');

class HAVWAPOptionsStrategy {
  constructor(params = {}) {
    this.name = 'HAVWAP Options';
    
    // VWAP Parameters - RELAXED THRESHOLDS for more frequent signals
    this.vwapPeriod = params.vwapPeriod || 60; // Minutes for VWAP calculation
    this.slopeThreshold = params.slopeThreshold || 0.00001; // RELAXED: Much smaller slope requirement
    this.slopeLookback = params.slopeLookback || 10; // Bars to calculate slope
    this.priceVwapThreshold = params.priceVwapThreshold || 0.0005; // RELAXED: 0.05% distance (was 0.2%)
    
    // Option Selection Parameters - 🔧 FIXED: Use ATM delta instead of OTM 30-delta
    this.deltaTarget = params.deltaTarget || 0.50; // Target 50-delta (ATM) for better sensitivity
    this.minVolume = 1; // Min volume (contracts) - very permissive for 0DTE
    this.maxSpreadPct = params.maxSpreadPct || 15; // Max 15% spread (live mode)
    this.preferredDTE = params.preferredDTE || 0; // 0 = 0DTE
    
    // Exit Parameters
    this.profitTarget = params.profitTarget || 0.30; // 30% profit target
    this.stopLoss = params.stopLoss || 0.50; // 50% stop loss
    this.maxHoldingPeriod = params.maxHoldingPeriod || 60; // Max 60 minutes
    this.zeroDTECloseTime = params.zeroDTECloseTime || '15:50'; // 3:50 PM ET
    
    // Position Sizing
    this.maxPositions = params.maxPositions || 1; // Max concurrent positions
    this.contractsPerTrade = params.contractsPerTrade || 1; // Contracts per position
    
    console.log(`📊 [STRATEGY INIT] HAVWAP Options Strategy initialized with:`);
    console.log(`   maxPositions: ${this.maxPositions}`);
    console.log(`   deltaTarget: ${this.deltaTarget}`);
    console.log(`   priceVwapThreshold: ${this.priceVwapThreshold}`);
    console.log(`   slopeThreshold: ${this.slopeThreshold}`);
    
    // State
    this.vwapData = [];
    this.currentPositions = [];
  }

  /**
   * Calculate Hourly-Anchored VWAP
   * Resets VWAP calculation at the start of each hour
   * @param {Array} bars - OHLCV bars
   * @returns {Array} VWAP data points
   */
  calculateHAVWAP(bars) {
    const hourlyVWAPs = [];
    let currentHour = null;
    let cumulativePV = 0;
    let cumulativeVolume = 0;

    bars.forEach((bar, index) => {
      const barTime = new Date(bar.t);
      // CRITICAL: Use ET timezone for hourly reset, not UTC
      const barTimeET = moment(barTime).tz('America/New_York');
      const barHour = barTimeET.hours(); // Get hour in ET timezone

      // Reset on new hour (in ET timezone)
      if (barHour !== currentHour) {
        currentHour = barHour;
        cumulativePV = 0;
        cumulativeVolume = 0;
        
        // Debug log for hour transitions
        if (index > 0) {
          console.log(`   🕐 HAVWAP Reset: Hour ${currentHour}:00 ET (${barTimeET.format('YYYY-MM-DD HH:mm:ss')})`);
        }
      }

      // Calculate typical price
      const typical = (parseFloat(bar.h) + parseFloat(bar.l) + parseFloat(bar.c)) / 3;
      const volume = parseFloat(bar.v);

      cumulativePV += typical * volume;
      cumulativeVolume += volume;

      const vwap = cumulativeVolume > 0 ? cumulativePV / cumulativeVolume : typical;

      hourlyVWAPs.push({
        timestamp: bar.t,
        price: parseFloat(bar.c),
        high: parseFloat(bar.h),
        low: parseFloat(bar.l),
        open: parseFloat(bar.o),
        vwap: vwap,
        volume: volume,
        typical: typical
      });
    });

    return hourlyVWAPs;
  }

  /**
   * Calculate VWAP slope using linear regression
   * @param {Array} vwapData - VWAP data points
   * @param {number} lookback - Number of bars to look back
   * @returns {number} Slope value
   */
  calculateSlope(vwapData, lookback = 10) {
    if (vwapData.length < lookback) {
      return 0;
    }

    const recent = vwapData.slice(-lookback);
    const n = recent.length;

    // Calculate linear regression slope
    const sumX = recent.reduce((sum, _, i) => sum + i, 0);
    const sumY = recent.reduce((sum, d) => sum + d.vwap, 0);
    const sumXY = recent.reduce((sum, d, i) => sum + i * d.vwap, 0);
    const sumX2 = recent.reduce((sum, _, i) => sum + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    return slope;
  }

  /**
   * Generate trading signals from underlying price action
   * @param {Array} underlyingBars - Historical bars for underlying
   * @returns {Array} Trading signals
   */
  generateSignals(underlyingBars) {
    const vwapData = this.calculateHAVWAP(underlyingBars);
    this.vwapData = vwapData; // Store for later use
    const signals = [];

    console.log(`\n📊 HAVWAP Signal Generation Debug:`);
    console.log(`   Total bars: ${underlyingBars.length}`);
    console.log(`   VWAP period: ${this.vwapPeriod}`);
    console.log(`   Bars to process: ${vwapData.length - this.vwapPeriod}`);
    console.log(`   Price threshold: ${this.priceVwapThreshold} (${(this.priceVwapThreshold * 100).toFixed(2)}%)`);
    console.log(`   Slope threshold: ${this.slopeThreshold}`);

    let sampleCount = 0;
    let callOpportunities = 0;
    let putOpportunities = 0;

    vwapData.forEach((data, index) => {
      // Need enough history for slope calculation
      if (index < this.vwapPeriod) {
        return;
      }

      const slope = this.calculateSlope(vwapData.slice(0, index + 1), this.slopeLookback);
      const priceVsVWAP = data.price - data.vwap;
      const priceVsVWAPPct = priceVsVWAP / data.vwap;

      // Debug sample (every 50 bars)
      if (sampleCount < 5 && index % 50 === 0) {
        console.log(`\n   [Bar ${index}] Price: $${data.price.toFixed(2)}, VWAP: $${data.vwap.toFixed(2)}`);
        console.log(`   Distance: ${(priceVsVWAPPct * 100).toFixed(3)}%, Slope: ${slope.toFixed(6)}`);
        sampleCount++;
      }

      // CALL SIGNAL: Price below VWAP (mean reversion - NO SLOPE REQUIREMENT)
      // Strategy: When price drops below VWAP, expect mean reversion back up
      if (priceVsVWAPPct < -this.priceVwapThreshold) {
        signals.push({
          timestamp: data.timestamp,
          signal_type: 'BUY_CALL',
          underlying_price: data.price,
          vwap: data.vwap,
          slope: slope,
          priceVsVWAPPct: priceVsVWAPPct,
          indicator_values: {
            vwap: data.vwap,
            slope: slope,
            priceDistance: priceVsVWAPPct,
            slopeThreshold: this.slopeThreshold,
            priceThreshold: this.priceVwapThreshold
          },
          target_delta: this.deltaTarget,
          option_type: 'CALL'
        });
        callOpportunities++;
      }

      // PUT SIGNAL: Price above VWAP (mean reversion - NO SLOPE REQUIREMENT)
      // Strategy: When price rises above VWAP, expect mean reversion back down
      if (priceVsVWAPPct > this.priceVwapThreshold) {
        signals.push({
          timestamp: data.timestamp,
          signal_type: 'BUY_PUT',
          underlying_price: data.price,
          vwap: data.vwap,
          slope: slope,
          priceVsVWAPPct: priceVsVWAPPct,
          indicator_values: {
            vwap: data.vwap,
            slope: slope,
            priceDistance: priceVsVWAPPct,
            slopeThreshold: this.slopeThreshold,
            priceThreshold: this.priceVwapThreshold
          },
          target_delta: -this.deltaTarget, // Negative for puts
          option_type: 'PUT'
        });
        putOpportunities++;
      }
    });

    console.log(`\n   📈 Signal Summary:`);
    console.log(`   Call signals (price < VWAP): ${callOpportunities}`);
    console.log(`   Put signals (price > VWAP): ${putOpportunities}`);
    console.log(`   Total signals generated: ${signals.length}`);

    return signals;
  }

  /**
   * Check if position should be exited
   * @param {Object} position - Current position
   * @param {number} currentPrice - Current option price
   * @param {string} currentTime - Current timestamp
   * @returns {Object} Exit decision { shouldExit, reason, pnlPct }
   */
  shouldExit(position, currentPrice, currentTime) {
    const entryTime = new Date(position.entry_timestamp);
    const current = new Date(currentTime);
    const holdingMinutes = (current - entryTime) / (1000 * 60);

    const currentValue = currentPrice * position.quantity * 100; // Contract multiplier
    const entryValue = position.entry_price * position.quantity * 100;
    const pnlPct = (currentValue - entryValue) / entryValue;

    // DEBUG: Log holding time vs max
    if (holdingMinutes >= this.maxHoldingPeriod - 1) {
      console.log(`   ⏱️  [EXIT DEBUG] ${position.contract_symbol}: holdingMinutes=${holdingMinutes.toFixed(1)}, maxHoldingPeriod=${this.maxHoldingPeriod}, pnlPct=${(pnlPct*100).toFixed(1)}%`);
    }

    // PRIORITY 1: Profit target (exit winners ASAP)
    if (pnlPct >= this.profitTarget) {
      return { 
        shouldExit: true, 
        reason: 'PROFIT_TARGET', 
        pnlPct: pnlPct 
      };
    }

    // PRIORITY 2: Stop loss (cut losers)
    if (pnlPct <= -this.stopLoss) {
      return { 
        shouldExit: true, 
        reason: 'STOP_LOSS', 
        pnlPct: pnlPct 
      };
    }

    // PRIORITY 3: Time stop (respect max holding period)
    if (holdingMinutes >= this.maxHoldingPeriod) {
      return { 
        shouldExit: true, 
        reason: 'TIME_STOP', 
        pnlPct: pnlPct 
      };
    }

    // PRIORITY 4: 0DTE auto-close (only at end of day 3:50 PM ET)
    if (position.expiry_date) {
      const expiryDate = new Date(position.expiry_date);
      const today = new Date(currentTime);
      
      // If 0DTE (same day expiry)
      if (expiryDate.toDateString() === today.toDateString()) {
        // Convert current time to ET for proper market hours comparison
        const currentET = moment(current).tz('America/New_York');
        const currentHourET = currentET.hours();
        const currentMinuteET = currentET.minutes();
        const currentTimeStr = `${currentHourET.toString().padStart(2, '0')}:${currentMinuteET.toString().padStart(2, '0')}`;
        
        // Close at 3:50 PM ET (15:50)
        if (currentTimeStr >= this.zeroDTECloseTime) {
          return { 
            shouldExit: true, 
            reason: 'ZERO_DTE_TIME_STOP', 
            pnlPct: pnlPct 
          };
        }
      }
    }

    return { 
      shouldExit: false, 
      pnlPct: pnlPct 
    };
  }

  /**
   * Check if new position can be opened
   * @returns {boolean} True if can open new position
   */
  canOpenPosition() {
    const openPositions = this.currentPositions.filter(p => p.status === 'OPEN');
    return openPositions.length < this.maxPositions;
  }

  /**
   * Get contract selection criteria for signal
   * @param {Object} signal - Trading signal
   * @param {string} mode - 'backtest' or 'live'
   * @returns {Object} Contract selection criteria
   */
  getContractCriteria(signal, mode = 'backtest') {
    return {
      targetDelta: signal.target_delta || this.deltaTarget,
      optionType: signal.option_type || 'CALL',
      maxSpreadPct: this.maxSpreadPct,
      minVolume: this.minVolume,
      preferredDTE: this.preferredDTE,
      underlyingPrice: signal.underlying_price,
      mode: mode
    };
  }

  /**
   * Get strategy parameters as object
   * @returns {Object} All strategy parameters
   */
  getParameters() {
    return {
      vwapPeriod: this.vwapPeriod,
      slopeThreshold: this.slopeThreshold,
      slopeLookback: this.slopeLookback,
      priceVwapThreshold: this.priceVwapThreshold,
      deltaTarget: this.deltaTarget,
      minVolume: this.minVolume,
      maxSpreadPct: this.maxSpreadPct,
      preferredDTE: this.preferredDTE,
      profitTarget: this.profitTarget,
      stopLoss: this.stopLoss,
      maxHoldingPeriod: this.maxHoldingPeriod,
      zeroDTECloseTime: this.zeroDTECloseTime,
      maxPositions: this.maxPositions,
      contractsPerTrade: this.contractsPerTrade
    };
  }

  /**
   * Update strategy parameters
   * @param {Object} params - New parameters
   */
  updateParameters(params) {
    Object.assign(this, params);
  }

  /**
   * Get VWAP value at specific timestamp
   * @param {string} timestamp - ISO timestamp
   * @returns {number|null} VWAP value or null if not found
   */
  getVWAPAtTime(timestamp) {
    const data = this.vwapData.find(d => d.timestamp === timestamp);
    return data ? data.vwap : null;
  }

  /**
   * Get strategy statistics
   * @returns {Object} Strategy statistics
   */
  getStatistics() {
    return {
      name: this.name,
      totalSignals: this.vwapData.length,
      parameters: this.getParameters()
    };
  }

  /**
   * Reset strategy state
   */
  reset() {
    this.vwapData = [];
    this.currentPositions = [];
  }
}

module.exports = HAVWAPOptionsStrategy;
