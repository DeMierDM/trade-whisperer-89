/**
 * SMALL ACCOUNT STRATEGY 1: RSI-VWAP Confluence (Conservative Growth)
 * 
 * Designed for: $250 bi-weekly deposits → $10,000 target
 * Risk Profile: Conservative (5-10% per trade)
 * Target Metrics: 70% win rate, 20% avg return, 15% max loss
 * 
 * Cash Account Optimizations:
 * - T+1 settlement friendly (quick rotations)
 * - GFV avoidance (never uses unsettled funds)
 * - Small position sizing for capital preservation
 * 
 * Strategy Logic:
 * - Multi-timeframe RSI for mean reversion
 * - VWAP for institutional reference level
 * - Volume confirmation for signal quality
 * - Strict time and profit management
 */

const moment = require('moment-timezone');

class SmallAccountRSIVWAPStrategy {
  constructor(parameters = {}) {
    this.name = 'Small Account RSI-VWAP Confluence';
    
    // SMALL ACCOUNT OPTIMIZED PARAMETERS
    this.accountSize = parameters.accountSize || 1000; // Current account balance
    this.maxRiskPerTrade = parameters.maxRiskPerTrade || 0.05; // 5% of account per trade
    this.maxPositionValue = parameters.maxPositionValue || 250; // Never risk more than $250
    
    // TECHNICAL PARAMETERS (Conservative)
    this.rsiPeriod = parameters.rsiPeriod || 14;
    this.rsiOversold = parameters.rsiOversold || 25; // Conservative extreme
    this.rsiOverbought = parameters.rsiOverbought || 75; // Conservative extreme
    this.rsi2Period = 2; // Micro-trend RSI
    this.rsi9Period = 9; // Filter RSI
    
    // VWAP PARAMETERS
    this.vwapPeriod = parameters.vwapPeriod || 60; // 1-hour VWAP
    this.vwapThreshold = parameters.vwapThreshold || 0.001; // 0.1% from VWAP
    this.vwapSlopeThreshold = parameters.vwapSlopeThreshold || 0.0001;
    
    // RISK MANAGEMENT (Conservative for small accounts)
    this.profitTarget = parameters.profitTarget || 0.20; // 20% profit target
    this.stopLoss = parameters.stopLoss || 0.15; // 15% stop loss
    this.maxHoldingPeriod = parameters.maxHoldingPeriod || 30; // 30 minutes max
    this.maxDailyLoss = parameters.maxDailyLoss || 0.05; // 5% daily loss limit
    this.maxPositions = parameters.maxPositions || 2; // Limit concurrent positions
    
    // OPTION SELECTION (Conservative Greeks)
    this.minDelta = parameters.minDelta || 0.15; // 0DTE optimized: allow more OTM
    this.maxDelta = parameters.maxDelta || 0.65; // 0DTE optimized: allow ATM range  
    this.maxBidAskSpread = parameters.maxBidAskSpread || 0.15; // 15% max spread
    this.minOpenInterest = parameters.minOpenInterest || 50; // Liquidity filter
    
    // TRADING HOURS (Full market day with breaks)
    this.tradingHours = {
      start: { hour: 9, minute: 30 }, // 9:30 AM (market open) - more lenient for testing  
      end: { hour: 16, minute: 0 },   // 4:00 PM (market close) - full day for testing
      lunchBreak: { // Disable lunch break for testing
        start: { hour: 25, minute: 0 }, // Invalid hour = no break
        end: { hour: 25, minute: 0 }
      }
    };
    
    // CASH ACCOUNT TRACKING
    this.settledCash = parameters.settledCash || 1000;
    this.unsettledCash = 0;
    this.gfvCount = 0; // Track Good Faith Violations
    this.maxGFV = 2; // Stay below 3 GFV limit
    
    // STATE TRACKING
    this.priceHistory = [];
    this.volumeHistory = [];
    this.vwapHistory = [];
    this.rsiHistory = [];
    this.rsi2History = [];
    this.rsi9History = [];
    this.currentPositions = [];
    this.dailyPnL = 0;
    this.dailyTrades = 0;
    
    console.log(`🏦 [SMALL ACCOUNT INIT] RSI-VWAP Strategy initialized for small account growth:`);
    console.log(`   Account Size: $${this.accountSize}`);
    console.log(`   Max Risk Per Trade: ${(this.maxRiskPerTrade * 100).toFixed(1)}%`);
    console.log(`   Max Position Value: $${this.maxPositionValue}`);
    console.log(`   Settled Cash: $${this.settledCash}`);
    console.log(`   Profit Target: ${(this.profitTarget * 100).toFixed(0)}%`);
    console.log(`   Stop Loss: ${(this.stopLoss * 100).toFixed(0)}%`);
  }

  /**
   * Calculate position size based on account balance and risk management
   */
  calculatePositionSize(accountBalance, signalStrength = 1.0) {
    // Base position size from account percentage
    const baseSize = accountBalance * this.maxRiskPerTrade * signalStrength;
    
    // Cap at maximum position value for small accounts
    const cappedSize = Math.min(baseSize, this.maxPositionValue);
    
    // Ensure we have settled cash available
    const availableSize = Math.min(cappedSize, this.settledCash * 0.8); // Leave 20% buffer
    
    return Math.max(availableSize, 50); // Minimum $50 position
  }

  /**
   * Check if we can trade (cash account rules)
   */
  canTrade(positionValue) {
    // Check settled cash availability
    if (positionValue > this.settledCash) {
      console.log(`❌ [CASH CHECK] Insufficient settled cash: Need $${positionValue}, Have $${this.settledCash}`);
      return false;
    }
    
    // Check GFV limit
    if (this.gfvCount >= this.maxGFV) {
      console.log(`❌ [GFV CHECK] Too many GFVs: ${this.gfvCount}/${this.maxGFV}`);
      return false;
    }
    
    // Check daily loss limit
    if (this.dailyPnL < -this.accountSize * this.maxDailyLoss) {
      console.log(`❌ [DAILY LOSS] Hit daily loss limit: ${this.dailyPnL}`);
      return false;
    }
    
    // Check maximum positions
    if (this.currentPositions.length >= this.maxPositions) {
      console.log(`❌ [POSITION LIMIT] Max positions reached: ${this.currentPositions.length}/${this.maxPositions}`);
      return false;
    }
    
    return true;
  }

  /**
   * Calculate Multi-timeframe RSI
   */
  calculateMultiRSI(prices) {
    const rsi14 = this.calculateRSI(prices, this.rsiPeriod);
    const rsi2 = this.calculateRSI(prices, this.rsi2Period);
    const rsi9 = this.calculateRSI(prices, this.rsi9Period);
    
    return {
      rsi14: rsi14[rsi14.length - 1] || 50,
      rsi2: rsi2[rsi2.length - 1] || 50,
      rsi9: rsi9[rsi9.length - 1] || 50
    };
  }

  /**
   * Calculate RSI
   */
  calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return [];
    
    const gains = [];
    const losses = [];
    
    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      gains.push(Math.max(change, 0));
      losses.push(Math.max(-change, 0));
    }
    
    const rsi = [];
    let avgGain = gains.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
    
    for (let i = period; i < gains.length; i++) {
      if (avgLoss === 0) {
        rsi.push(100);
      } else {
        const rs = avgGain / avgLoss;
        rsi.push(100 - (100 / (1 + rs)));
      }
      
      // Update averages
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    }
    
    return rsi;
  }

  /**
   * Calculate VWAP and slope
   */
  calculateVWAP(prices, volumes) {
    if (prices.length === 0) return { vwap: 0, slope: 0 };
    
    // Calculate VWAP
    let totalPV = 0;
    let totalVolume = 0;
    
    const lookback = Math.min(this.vwapPeriod, prices.length);
    const startIndex = Math.max(0, prices.length - lookback);
    
    for (let i = startIndex; i < prices.length; i++) {
      const typicalPrice = prices[i];
      const volume = volumes[i] || 1;
      totalPV += typicalPrice * volume;
      totalVolume += volume;
    }
    
    const vwap = totalVolume > 0 ? totalPV / totalVolume : prices[prices.length - 1];
    
    // Calculate VWAP slope (last 5 periods)
    this.vwapHistory.push(vwap);
    if (this.vwapHistory.length > 50) this.vwapHistory.shift();
    
    let slope = 0;
    if (this.vwapHistory.length >= 5) {
      const recent = this.vwapHistory.slice(-5);
      const x = [0, 1, 2, 3, 4];
      const n = 5;
      const sumX = x.reduce((a, b) => a + b, 0);
      const sumY = recent.reduce((a, b) => a + b, 0);
      const sumXY = x.reduce((sum, xi, i) => sum + xi * recent[i], 0);
      const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
      
      slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    }
    
    return { vwap, slope };
  }

  /**
   * Check if time is within trading hours
   */
  isWithinTradingHours(timestamp) {
    const time = moment(timestamp).tz('America/New_York');
    const hour = time.hour();
    const minute = time.minute();
    
    // Before market open
    if (hour < this.tradingHours.start.hour || 
        (hour === this.tradingHours.start.hour && minute < this.tradingHours.start.minute)) {
      return false;
    }
    
    // After market close  
    if (hour > this.tradingHours.end.hour ||
        (hour === this.tradingHours.end.hour && minute >= this.tradingHours.end.minute)) {
      return false;
    }
    
    // During lunch break (optional)
    if (hour >= this.tradingHours.lunchBreak.start.hour && 
        hour < this.tradingHours.lunchBreak.end.hour) {
      return false;
    }
    
    return true;
  }

  /**
   * Generate trading signals
   */
  generateSignals(underlyingBars) {
    console.log(`📊 [RSI-VWAP] generateSignals called with ${underlyingBars?.length || 0} bars`);
    const signals = [];
    
    underlyingBars.forEach((bar, index) => {
      if (index === 0) return; // Skip first bar
      
      // Update price and volume history
      const currentPrice = parseFloat(bar.c || bar.close);
      const currentVolume = parseFloat(bar.v || bar.volume || 1);
      
      this.priceHistory.push(currentPrice);
      this.volumeHistory.push(currentVolume);
      
      // Limit history size
      if (this.priceHistory.length > 200) this.priceHistory.shift();
      if (this.volumeHistory.length > 200) this.volumeHistory.shift();
      
      // Need minimum history for indicators
      if (this.priceHistory.length < 15) return; // Reduced from 30 to 15 for faster signal generation
      
      // Check trading hours
      if (!this.isWithinTradingHours(bar.t)) return;
      
      // Calculate indicators
      const rsiData = this.calculateMultiRSI(this.priceHistory);
      const vwapData = this.calculateVWAP(this.priceHistory, this.volumeHistory);
      
      const { rsi14, rsi2, rsi9 } = rsiData;
      const { vwap, slope: vwapSlope } = vwapData;
      
      // Calculate additional metrics
      const vwapDeviation = (currentPrice - vwap) / vwap;
      const volumeRatio = this.volumeHistory.length >= 20 ? 
        currentVolume / (this.volumeHistory.slice(-20).reduce((a, b) => a + b, 0) / 20) : 1;
      
      // Signal strength calculation (0.5 to 1.5)
      let signalStrength = 1.0;
      
      // ==================== CALL SIGNALS ====================
      
      // PRIMARY: RSI Oversold + VWAP Support
      const rsiOversoldCall = rsi2 <= this.rsiOversold && rsi9 > 40 && rsi14 < 40;
      const vwapSupportCall = Math.abs(vwapDeviation) < this.vwapThreshold && vwapSlope > this.vwapSlopeThreshold;
      const volumeConfirmationCall = volumeRatio > 1.2;
      
      if (rsiOversoldCall && vwapSupportCall && volumeConfirmationCall) {
        // Calculate position size
        signalStrength += Math.min((this.rsiOversold - rsi2) / 10, 0.5); // More oversold = stronger signal
        const positionSize = this.calculatePositionSize(this.accountSize, signalStrength);
        
        if (this.canTrade(positionSize)) {
          signals.push({
            timestamp: bar.t,
            signal_type: 'BUY_CALL',
            underlying_price: currentPrice,
            vwap: vwap,
            rsi14: rsi14,
            rsi2: rsi2,
            rsi9: rsi9,
            vwap_deviation: vwapDeviation,
            vwap_slope: vwapSlope,
            volume_ratio: volumeRatio,
            signal_strength: signalStrength,
            position_size: positionSize,
            signal_reason: 'RSI_OVERSOLD_VWAP_SUPPORT',
            target_delta: 0.45,
            option_type: 'call'
          });
          
          console.log(`📈 [CALL SIGNAL] RSI Oversold + VWAP Support at $${currentPrice.toFixed(2)}`);
          console.log(`   RSI(2): ${rsi2.toFixed(1)}, RSI(9): ${rsi9.toFixed(1)}, RSI(14): ${rsi14.toFixed(1)}`);
          console.log(`   VWAP: $${vwap.toFixed(2)}, Deviation: ${(vwapDeviation * 100).toFixed(2)}%`);
          console.log(`   Position Size: $${positionSize.toFixed(0)}, Strength: ${signalStrength.toFixed(2)}`);
        }
      }
      
      // ==================== PUT SIGNALS ====================
      
      // PRIMARY: RSI Overbought + VWAP Resistance  
      const rsiOverboughtPut = rsi2 >= this.rsiOverbought && rsi9 < 60 && rsi14 > 60;
      const vwapResistancePut = Math.abs(vwapDeviation) < this.vwapThreshold && vwapSlope < -this.vwapSlopeThreshold;
      const volumeConfirmationPut = volumeRatio > 1.2;
      
      if (rsiOverboughtPut && vwapResistancePut && volumeConfirmationPut) {
        // Calculate position size
        signalStrength += Math.min((rsi2 - this.rsiOverbought) / 10, 0.5); // More overbought = stronger signal
        const positionSize = this.calculatePositionSize(this.accountSize, signalStrength);
        
        if (this.canTrade(positionSize)) {
          signals.push({
            timestamp: bar.t,
            signal_type: 'BUY_PUT',
            underlying_price: currentPrice,
            vwap: vwap,
            rsi14: rsi14,
            rsi2: rsi2,
            rsi9: rsi9,
            vwap_deviation: vwapDeviation,
            vwap_slope: vwapSlope,
            volume_ratio: volumeRatio,
            signal_strength: signalStrength,
            position_size: positionSize,
            signal_reason: 'RSI_OVERBOUGHT_VWAP_RESISTANCE',
            target_delta: -0.45,
            option_type: 'put'
          });
          
          console.log(`📉 [PUT SIGNAL] RSI Overbought + VWAP Resistance at $${currentPrice.toFixed(2)}`);
          console.log(`   RSI(2): ${rsi2.toFixed(1)}, RSI(9): ${rsi9.toFixed(1)}, RSI(14): ${rsi14.toFixed(1)}`);
          console.log(`   VWAP: $${vwap.toFixed(2)}, Deviation: ${(vwapDeviation * 100).toFixed(2)}%`);
          console.log(`   Position Size: $${positionSize.toFixed(0)}, Strength: ${signalStrength.toFixed(2)}`);
        }
      }
    });
    
    return signals;
  }

  /**
   * Position exit logic
   */
  shouldExit(position, currentPrice, currentTime) {
    const entryPrice = position.entry_price;
    const entryTime = new Date(position.entry_timestamp || position.entry_time);
    const current = new Date(currentTime);
    const holdingTime = (current - entryTime) / 1000; // seconds
    
    // P&L calculation
    const currentValue = currentPrice * 100 * position.quantity;
    const entryValue = entryPrice * 100 * position.quantity;
    const pnl = currentValue - entryValue;
    const pnlPercent = pnl / entryValue;
    
    const timeHeld = holdingTime / 60; // minutes
    
    // Profit target hit
    if (pnlPercent >= this.profitTarget) {
      return { shouldExit: true, reason: 'PROFIT_TARGET', pnl, pnlPercent };
    }
    
    // Stop loss hit
    if (pnlPercent <= -this.stopLoss) {
      return { shouldExit: true, reason: 'STOP_LOSS', pnl, pnlPercent };
    }
    
    // Time stop
    if (timeHeld >= this.maxHoldingPeriod) {
      return { shouldExit: true, reason: 'TIME_STOP', pnl, pnlPercent };
    }
    
    // 0DTE close before market close (3:45 PM)
    const time = moment(currentTime).tz('America/New_York');
    if (time.hour() >= 15 && time.minute() >= 45) {
      return { shouldExit: true, reason: 'EOD_CLOSE', pnl, pnlPercent };
    }
    
    return { shouldExit: false };
  }

  /**
   * Check if new position can be opened
   */
  canOpenPosition() {
    const openPositions = this.currentPositions.filter(p => p.status === 'OPEN');
    return openPositions.length < this.maxPositions;
  }

  /**
   * Update settled cash after trade settlement (T+1)
   */
  updateSettledCash(tradeAmount, settlementDate) {
    // In real implementation, this would track T+1 settlement
    this.settledCash += tradeAmount;
    console.log(`💰 [SETTLEMENT] Updated settled cash: $${this.settledCash.toFixed(2)}`);
  }

  /**
   * Get contract selection criteria
   */
  getContractCriteria(signal) {
    return {
      optionType: signal.option_type,
      minDelta: this.minDelta,
      maxDelta: this.maxDelta,
      maxBidAskSpread: this.maxBidAskSpread,
      minOpenInterest: this.minOpenInterest,
      targetDelta: Math.abs(signal.target_delta || 0.45),
      maxPositionValue: signal.position_size
    };
  }

  /**
   * Get strategy parameters for optimization
   */
  getParameters() {
    return {
      strategy: 'small-account-rsi-vwap',
      accountSize: this.accountSize,
      maxRiskPerTrade: this.maxRiskPerTrade,
      maxPositionValue: this.maxPositionValue,
      rsiOversold: this.rsiOversold,
      rsiOverbought: this.rsiOverbought,
      vwapThreshold: this.vwapThreshold,
      profitTarget: this.profitTarget,
      stopLoss: this.stopLoss,
      maxHoldingPeriod: this.maxHoldingPeriod,
      maxDailyLoss: this.maxDailyLoss,
      maxPositions: this.maxPositions,
      minDelta: this.minDelta,
      maxDelta: this.maxDelta,
      maxBidAskSpread: this.maxBidAskSpread
    };
  }

  /**
   * Reset for new trading day
   */
  reset() {
    this.dailyPnL = 0;
    this.dailyTrades = 0;
    this.currentPositions = [];
    console.log(`🔄 [RESET] Strategy reset for new trading day`);
  }

  /**
   * Update account size (for progressive scaling)
   */
  updateAccountSize(newSize) {
    this.accountSize = newSize;
    this.settledCash = newSize * 0.95; // Assume 95% is settled cash
    console.log(`📊 [ACCOUNT UPDATE] New account size: $${newSize}, Settled: $${this.settledCash.toFixed(2)}`);
  }
}

module.exports = SmallAccountRSIVWAPStrategy;