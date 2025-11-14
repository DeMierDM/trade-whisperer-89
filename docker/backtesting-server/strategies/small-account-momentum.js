/**
 * SMALL ACCOUNT STRATEGY 2: Momentum Breakout (Aggressive Growth)
 * 
 * Designed for: Rapid account growth with controlled risk
 * Risk Profile: Medium-High (3-5% per trade)
 * Target Metrics: 50% win rate, 60% avg return, 25% max loss
 * 
 * Cash Account Optimizations:
 * - Quick momentum trades (5-15 minute holds)
 * - Higher return targets to compound faster
 * - Volume and momentum confirmation
 * 
 * Strategy Logic:
 * - ROC momentum + CCI extreme readings
 * - Williams %R for timing entries
 * - VWAP breakout confirmation
 * - ATR-based volatility filtering
 */

const moment = require('moment-timezone');

class SmallAccountMomentumStrategy {
  constructor(parameters = {}) {
    this.name = 'Small Account Momentum Breakout';
    
    // SMALL ACCOUNT PARAMETERS
    this.accountSize = parameters.accountSize || 1000;
    this.maxRiskPerTrade = parameters.maxRiskPerTrade || 0.03; // 3% per trade (more aggressive)
    this.maxPositionValue = parameters.maxPositionValue || 200; // Smaller positions for more trades
    
    // MOMENTUM INDICATORS
    this.rocPeriod3 = parameters.rocPeriod3 || 3; // Short-term momentum
    this.rocPeriod5 = parameters.rocPeriod5 || 5; // Medium-term momentum
    this.rocThresholdStrong = parameters.rocThresholdStrong || 0.005; // 0.5% strong momentum
    this.rocThresholdExtreme = parameters.rocThresholdExtreme || 0.01; // 1.0% extreme momentum
    
    // CCI PARAMETERS (Cyclical extremes)
    this.cciPeriod = parameters.cciPeriod || 20;
    this.cciOverbought = parameters.cciOverbought || 100;
    this.cciOversold = parameters.cciOversold || -100;
    this.cciExtreme = parameters.cciExtreme || 150; // More extreme for stronger signals
    
    // WILLIAMS %R PARAMETERS
    this.willrPeriod = parameters.willrPeriod || 14;
    this.willrOverbought = parameters.willrOverbought || -20;
    this.willrOversold = parameters.willrOversold || -80;
    
    // VWAP BREAKOUT PARAMETERS
    this.vwapPeriod = parameters.vwapPeriod || 30; // Shorter VWAP for momentum
    this.vwapBreakoutThreshold = parameters.vwapBreakoutThreshold || 0.002; // 0.2% breakout
    
    // ATR VOLATILITY FILTER
    this.atrPeriod = parameters.atrPeriod || 14;
    this.maxATRMultiple = parameters.maxATRMultiple || 2.0; // Avoid overly volatile conditions
    this.minATRMultiple = parameters.minATRMultiple || 0.5; // Avoid too quiet conditions
    
    // AGGRESSIVE RISK MANAGEMENT
    this.profitTarget = parameters.profitTarget || 0.50; // 50% profit target
    this.stopLoss = parameters.stopLoss || 0.25; // 25% stop loss
    this.maxHoldingPeriod = parameters.maxHoldingPeriod || 15; // 15 minutes max (quick trades)
    this.trailingStopTrigger = parameters.trailingStopTrigger || 0.30; // Start trailing at 30%
    this.trailingStopDistance = parameters.trailingStopDistance || 0.15; // 15% trailing stop
    
    // POSITION MANAGEMENT
    this.maxPositions = parameters.maxPositions || 1; // Focus on one good trade
    this.maxDailyTrades = parameters.maxDailyTrades || 5; // Limit overtrading
    this.maxDailyLoss = parameters.maxDailyLoss || 0.08; // 8% daily loss limit
    this.minSignalStrength = parameters.minSignalStrength || 1.2; // Higher signal threshold
    
    // OPTION SELECTION (More aggressive Greeks)
    this.minDelta = parameters.minDelta || 0.15; // 0DTE optimized: allow more OTM  
    this.maxDelta = parameters.maxDelta || 0.65; // 0DTE optimized: align with ATM range
    this.maxBidAskSpread = parameters.maxBidAskSpread || 0.12; // 12% max spread
    this.minVolume = parameters.minVolume || 10; // Higher volume requirement
    
    // TRADING HOURS (Peak momentum periods)
    this.tradingHours = {
      morning: { start: { hour: 9, minute: 30 }, end: { hour: 11, minute: 0 } },
      afternoon: { start: { hour: 14, minute: 0 }, end: { hour: 15, minute: 45 } }
    };
    
    // CASH ACCOUNT TRACKING
    this.settledCash = parameters.settledCash || 1000;
    this.gfvCount = 0;
    this.maxGFV = 2;
    
    // STATE TRACKING
    this.priceHistory = [];
    this.volumeHistory = [];
    this.highHistory = [];
    this.lowHistory = [];
    this.vwapHistory = [];
    this.rocHistory = [];
    this.cciHistory = [];
    this.willrHistory = [];
    this.atrHistory = [];
    this.currentPositions = [];
    this.dailyPnL = 0;
    this.dailyTrades = 0;
    this.averageATR = 0;
    
    console.log(`🚀 [MOMENTUM INIT] Momentum Breakout Strategy initialized:`);
    console.log(`   Max Risk Per Trade: ${(this.maxRiskPerTrade * 100).toFixed(1)}%`);
    console.log(`   Profit Target: ${(this.profitTarget * 100).toFixed(0)}%`);
    console.log(`   Stop Loss: ${(this.stopLoss * 100).toFixed(0)}%`);
    console.log(`   Max Hold: ${this.maxHoldingPeriod} minutes`);
  }

  /**
   * Calculate Rate of Change (ROC)
   */
  calculateROC(prices, period) {
    if (prices.length <= period) return [];
    
    const roc = [];
    for (let i = period; i < prices.length; i++) {
      const change = (prices[i] - prices[i - period]) / prices[i - period];
      roc.push(change);
    }
    return roc;
  }

  /**
   * Calculate Commodity Channel Index (CCI)
   */
  calculateCCI(highs, lows, closes, period = 20) {
    if (closes.length < period) return [];
    
    const cci = [];
    const constant = 0.015;
    
    for (let i = period - 1; i < closes.length; i++) {
      // Calculate typical prices for the period
      const typicalPrices = [];
      for (let j = i - period + 1; j <= i; j++) {
        typicalPrices.push((highs[j] + lows[j] + closes[j]) / 3);
      }
      
      // Simple moving average of typical prices
      const sma = typicalPrices.reduce((sum, val) => sum + val, 0) / period;
      
      // Mean deviation
      const meanDev = typicalPrices.reduce((sum, val) => sum + Math.abs(val - sma), 0) / period;
      
      // Current typical price
      const currentTP = (highs[i] + lows[i] + closes[i]) / 3;
      
      // CCI calculation
      const cciValue = meanDev !== 0 ? (currentTP - sma) / (constant * meanDev) : 0;
      cci.push(cciValue);
    }
    
    return cci;
  }

  /**
   * Calculate Williams %R
   */
  calculateWilliamsR(highs, lows, closes, period = 14) {
    if (closes.length < period) return [];
    
    const willr = [];
    
    for (let i = period - 1; i < closes.length; i++) {
      const periodHighs = highs.slice(i - period + 1, i + 1);
      const periodLows = lows.slice(i - period + 1, i + 1);
      
      const highestHigh = Math.max(...periodHighs);
      const lowestLow = Math.min(...periodLows);
      
      const willrValue = ((highestHigh - closes[i]) / (highestHigh - lowestLow)) * -100;
      willr.push(willrValue);
    }
    
    return willr;
  }

  /**
   * Calculate Average True Range (ATR)
   */
  calculateATR(highs, lows, closes, period = 14) {
    if (closes.length < 2) return [];
    
    const trueRanges = [];
    
    for (let i = 1; i < closes.length; i++) {
      const tr1 = highs[i] - lows[i];
      const tr2 = Math.abs(highs[i] - closes[i - 1]);
      const tr3 = Math.abs(lows[i] - closes[i - 1]);
      
      trueRanges.push(Math.max(tr1, tr2, tr3));
    }
    
    if (trueRanges.length < period) return [];
    
    const atr = [];
    let currentATR = trueRanges.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
    atr.push(currentATR);
    
    for (let i = period; i < trueRanges.length; i++) {
      currentATR = (currentATR * (period - 1) + trueRanges[i]) / period;
      atr.push(currentATR);
    }
    
    return atr;
  }

  /**
   * Calculate VWAP
   */
  calculateVWAP(prices, volumes, highs, lows) {
    if (prices.length === 0) return 0;
    
    let totalPV = 0;
    let totalVolume = 0;
    
    const lookback = Math.min(this.vwapPeriod, prices.length);
    const startIndex = Math.max(0, prices.length - lookback);
    
    for (let i = startIndex; i < prices.length; i++) {
      const typicalPrice = (highs[i] + lows[i] + prices[i]) / 3;
      const volume = volumes[i] || 1;
      totalPV += typicalPrice * volume;
      totalVolume += volume;
    }
    
    return totalVolume > 0 ? totalPV / totalVolume : prices[prices.length - 1];
  }

  /**
   * Check if within trading hours (momentum periods only)
   */
  isWithinTradingHours(timestamp) {
    const time = moment(timestamp).tz('America/New_York');
    const hour = time.hour();
    const minute = time.minute();
    
    // Morning momentum session (9:30 - 11:00 AM)
    if (hour >= this.tradingHours.morning.start.hour && hour < this.tradingHours.morning.end.hour) {
      if (hour === 9 && minute < 30) return false; // Wait for 9:30
      return true;
    }
    
    // Afternoon momentum session (2:00 - 3:45 PM)  
    if (hour >= this.tradingHours.afternoon.start.hour && hour < this.tradingHours.afternoon.end.hour) {
      return true;
    }
    
    // Final momentum before close (3:45 - 3:50 PM)
    if (hour === 15 && minute >= 45 && minute < 50) {
      return true;
    }
    
    return false;
  }

  /**
   * Calculate signal strength based on indicator confluence
   */
  calculateSignalStrength(rocData, cci, willr, vwapBreakout, volumeRatio) {
    let strength = 1.0;
    
    // ROC momentum strength
    if (Math.abs(rocData.roc3) > this.rocThresholdExtreme) strength += 0.5;
    else if (Math.abs(rocData.roc3) > this.rocThresholdStrong) strength += 0.3;
    
    // CCI extreme readings
    if (Math.abs(cci) > this.cciExtreme) strength += 0.4;
    else if (Math.abs(cci) > this.cciOverbought) strength += 0.2;
    
    // Williams %R confirmation
    if (Math.abs(willr) > 80) strength += 0.3; // Extreme readings
    
    // VWAP breakout strength
    if (Math.abs(vwapBreakout) > this.vwapBreakoutThreshold * 2) strength += 0.4;
    else if (Math.abs(vwapBreakout) > this.vwapBreakoutThreshold) strength += 0.2;
    
    // Volume confirmation
    if (volumeRatio > 2.0) strength += 0.3;
    else if (volumeRatio > 1.5) strength += 0.2;
    
    return Math.min(strength, 2.0); // Cap at 2.0
  }

  /**
   * Generate momentum breakout signals
   */
  generateSignals(underlyingBars) {
    const signals = [];
    
    underlyingBars.forEach((bar, index) => {
      if (index === 0) return;
      
      // Update OHLCV history
      const currentPrice = parseFloat(bar.c || bar.close);
      const currentHigh = parseFloat(bar.h || bar.high || currentPrice);
      const currentLow = parseFloat(bar.l || bar.low || currentPrice);
      const currentVolume = parseFloat(bar.v || bar.volume || 1);
      
      this.priceHistory.push(currentPrice);
      this.highHistory.push(currentHigh);
      this.lowHistory.push(currentLow);
      this.volumeHistory.push(currentVolume);
      
      // Limit history size
      const maxHistory = 100;
      if (this.priceHistory.length > maxHistory) {
        this.priceHistory.shift();
        this.highHistory.shift();
        this.lowHistory.shift();
        this.volumeHistory.shift();
      }
      
      // Need minimum history
      if (this.priceHistory.length < 30) return;
      
      // Check trading hours
      if (!this.isWithinTradingHours(bar.t)) return;
      
      // Check daily trade limits
      if (this.dailyTrades >= this.maxDailyTrades) return;
      
      // Calculate indicators
      const roc3Array = this.calculateROC(this.priceHistory, this.rocPeriod3);
      const roc5Array = this.calculateROC(this.priceHistory, this.rocPeriod5);
      const cciArray = this.calculateCCI(this.highHistory, this.lowHistory, this.priceHistory, this.cciPeriod);
      const willrArray = this.calculateWilliamsR(this.highHistory, this.lowHistory, this.priceHistory, this.willrPeriod);
      const atrArray = this.calculateATR(this.highHistory, this.lowHistory, this.priceHistory, this.atrPeriod);
      
      if (roc3Array.length === 0 || cciArray.length === 0 || willrArray.length === 0 || atrArray.length === 0) {
        return;
      }
      
      const rocData = {
        roc3: roc3Array[roc3Array.length - 1],
        roc5: roc5Array[roc5Array.length - 1] || 0
      };
      const cci = cciArray[cciArray.length - 1];
      const willr = willrArray[willrArray.length - 1];
      const currentATR = atrArray[atrArray.length - 1];
      
      // Update average ATR
      this.atrHistory.push(currentATR);
      if (this.atrHistory.length > 20) this.atrHistory.shift();
      this.averageATR = this.atrHistory.reduce((sum, val) => sum + val, 0) / this.atrHistory.length;
      
      // ATR volatility filter
      const atrRatio = currentATR / this.averageATR;
      if (atrRatio > this.maxATRMultiple || atrRatio < this.minATRMultiple) {
        return; // Skip if volatility is too high or too low
      }
      
      // Calculate VWAP and breakout
      const vwap = this.calculateVWAP(this.priceHistory, this.volumeHistory, this.highHistory, this.lowHistory);
      const vwapBreakout = (currentPrice - vwap) / vwap;
      
      // Volume analysis
      const volumeRatio = this.volumeHistory.length >= 20 ? 
        currentVolume / (this.volumeHistory.slice(-20).reduce((a, b) => a + b, 0) / 20) : 1;
      
      // ==================== BULLISH MOMENTUM SIGNALS ====================
      
      const strongUpMomentum = rocData.roc3 > this.rocThresholdStrong && rocData.roc5 > 0;
      const cciOversoldReversal = cci < this.cciOversold && cci > this.cciOversold - 50; // Not too extreme
      const willrOversoldTurning = willr < this.willrOversold && willr > -95; // Turning up from oversold
      const vwapBullishBreakout = vwapBreakout > this.vwapBreakoutThreshold;
      const volumeSupport = volumeRatio > 1.3;
      
      if (strongUpMomentum && (cciOversoldReversal || willrOversoldTurning) && vwapBullishBreakout && volumeSupport) {
        const signalStrength = this.calculateSignalStrength(rocData, cci, willr, vwapBreakout, volumeRatio);
        
        if (signalStrength >= this.minSignalStrength) {
          const positionSize = this.accountSize * this.maxRiskPerTrade * signalStrength;
          
          if (positionSize <= this.settledCash && this.currentPositions.length < this.maxPositions) {
            signals.push({
              timestamp: bar.t,
              signal_type: 'BUY_CALL',
              underlying_price: currentPrice,
              vwap: vwap,
              roc3: rocData.roc3,
              roc5: rocData.roc5,
              cci: cci,
              willr: willr,
              atr: currentATR,
              atr_ratio: atrRatio,
              vwap_breakout: vwapBreakout,
              volume_ratio: volumeRatio,
              signal_strength: signalStrength,
              position_size: Math.min(positionSize, this.maxPositionValue),
              signal_reason: 'BULLISH_MOMENTUM_BREAKOUT',
              target_delta: 0.55,
              option_type: 'call'
            });
            
            console.log(`🚀 [CALL MOMENTUM] Bullish breakout at $${currentPrice.toFixed(2)}`);
            console.log(`   ROC(3): ${(rocData.roc3 * 100).toFixed(2)}%, CCI: ${cci.toFixed(1)}, Williams %R: ${willr.toFixed(1)}`);
            console.log(`   VWAP Breakout: ${(vwapBreakout * 100).toFixed(2)}%, Volume: ${volumeRatio.toFixed(1)}x`);
            console.log(`   Signal Strength: ${signalStrength.toFixed(2)}, Position: $${positionSize.toFixed(0)}`);
          }
        }
      }
      
      // ==================== BEARISH MOMENTUM SIGNALS ====================
      
      const strongDownMomentum = rocData.roc3 < -this.rocThresholdStrong && rocData.roc5 < 0;
      const cciOverboughtReversal = cci > this.cciOverbought && cci < this.cciOverbought + 50; // Not too extreme
      const willrOverboughtTurning = willr > this.willrOverbought && willr < -5; // Turning down from overbought
      const vwapBearishBreakout = vwapBreakout < -this.vwapBreakoutThreshold;
      const volumePressure = volumeRatio > 1.3;
      
      if (strongDownMomentum && (cciOverboughtReversal || willrOverboughtTurning) && vwapBearishBreakout && volumePressure) {
        const signalStrength = this.calculateSignalStrength(rocData, cci, willr, vwapBreakout, volumeRatio);
        
        if (signalStrength >= this.minSignalStrength) {
          const positionSize = this.accountSize * this.maxRiskPerTrade * signalStrength;
          
          if (positionSize <= this.settledCash && this.currentPositions.length < this.maxPositions) {
            signals.push({
              timestamp: bar.t,
              signal_type: 'BUY_PUT',
              underlying_price: currentPrice,
              vwap: vwap,
              roc3: rocData.roc3,
              roc5: rocData.roc5,
              cci: cci,
              willr: willr,
              atr: currentATR,
              atr_ratio: atrRatio,
              vwap_breakout: vwapBreakout,
              volume_ratio: volumeRatio,
              signal_strength: signalStrength,
              position_size: Math.min(positionSize, this.maxPositionValue),
              signal_reason: 'BEARISH_MOMENTUM_BREAKOUT',
              target_delta: -0.55,
              option_type: 'put'
            });
            
            console.log(`🔻 [PUT MOMENTUM] Bearish breakout at $${currentPrice.toFixed(2)}`);
            console.log(`   ROC(3): ${(rocData.roc3 * 100).toFixed(2)}%, CCI: ${cci.toFixed(1)}, Williams %R: ${willr.toFixed(1)}`);
            console.log(`   VWAP Breakout: ${(vwapBreakout * 100).toFixed(2)}%, Volume: ${volumeRatio.toFixed(1)}x`);
            console.log(`   Signal Strength: ${signalStrength.toFixed(2)}, Position: $${positionSize.toFixed(0)}`);
          }
        }
      }
    });
    
    return signals;
  }

  /**
   * Advanced exit logic with trailing stops
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
    
    // Trailing stop logic
    if (pnlPercent >= this.trailingStopTrigger) {
      const highWaterMark = position.highWaterMark || currentPrice;
      const newHighWater = Math.max(highWaterMark, currentPrice);
      const trailingStopPrice = newHighWater * (1 - this.trailingStopDistance);
      
      position.highWaterMark = newHighWater;
      
      if (currentPrice <= trailingStopPrice) {
        return { shouldExit: true, reason: 'TRAILING_STOP', pnl, pnlPercent };
      }
    }
    
    // Quick exit on momentum reversal
    if (timeHeld >= 5 && pnlPercent < -0.10) { // 5 minutes and -10%
      return { shouldExit: true, reason: 'MOMENTUM_REVERSAL', pnl, pnlPercent };
    }
    
    // Time stop
    if (timeHeld >= this.maxHoldingPeriod) {
      return { shouldExit: true, reason: 'TIME_STOP', pnl, pnlPercent };
    }
    
    // End of day close
    const time = moment(currentTime).tz('America/New_York');
    if (time.hour() >= 15 && time.minute() >= 50) {
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
   * Get contract selection criteria
   */
  getContractCriteria(signal) {
    return {
      optionType: signal.option_type,
      minDelta: this.minDelta,
      maxDelta: this.maxDelta,
      maxBidAskSpread: this.maxBidAskSpread,
      minVolume: this.minVolume,
      targetDelta: Math.abs(signal.target_delta || 0.55),
      maxPositionValue: signal.position_size,
      preferLiquidity: true // Prioritize liquid contracts for quick entries/exits
    };
  }

  /**
   * Get strategy parameters
   */
  getParameters() {
    return {
      strategy: 'small-account-momentum',
      maxRiskPerTrade: this.maxRiskPerTrade,
      profitTarget: this.profitTarget,
      stopLoss: this.stopLoss,
      maxHoldingPeriod: this.maxHoldingPeriod,
      rocThresholdStrong: this.rocThresholdStrong,
      cciOverbought: this.cciOverbought,
      cciOversold: this.cciOversold,
      vwapBreakoutThreshold: this.vwapBreakoutThreshold,
      minSignalStrength: this.minSignalStrength,
      maxATRMultiple: this.maxATRMultiple,
      trailingStopTrigger: this.trailingStopTrigger,
      trailingStopDistance: this.trailingStopDistance
    };
  }

  /**
   * Reset for new trading day
   */
  reset() {
    this.dailyPnL = 0;
    this.dailyTrades = 0;
    this.currentPositions = [];
    console.log(`🔄 [MOMENTUM RESET] Strategy reset for new trading day`);
  }

  /**
   * Update account size for progressive scaling
   */
  updateAccountSize(newSize) {
    this.accountSize = newSize;
    this.settledCash = newSize * 0.95;
    console.log(`📊 [MOMENTUM UPDATE] Account size: $${newSize}, Available: $${this.settledCash.toFixed(2)}`);
  }
}

module.exports = SmallAccountMomentumStrategy;