/**
 * SMALL ACCOUNT STRATEGY 3: IV Rank Mean Reversion (Selective High Win Rate)
 * 
 * Designed for: High probability trades with selective entry criteria
 * Risk Profile: Low-Medium (2-3% per trade)
 * Target Metrics: 80% win rate, 30% avg return, 15% max loss
 * 
 * Cash Account Optimizations:
 * - Selective high-probability setups only
 * - Quick scalping with tight stops
 * - IV rank-based timing for options pricing edges
 * 
 * Strategy Logic:
 * - IV Rank extreme readings (>80 or <20)
 * - Stochastic mean reversion signals
 * - Parabolic SAR trend confirmation
 * - CMO momentum divergence detection
 */

const moment = require('moment-timezone');

class SmallAccountIVMeanReversionStrategy {
  constructor(parameters = {}) {
    this.name = 'Small Account IV Mean Reversion';
    
    // SMALL ACCOUNT PARAMETERS
    this.accountSize = parameters.accountSize || 1000;
    this.maxRiskPerTrade = parameters.maxRiskPerTrade || 0.025; // 2.5% per trade (conservative)
    this.maxPositionValue = parameters.maxPositionValue || 150; // Smaller positions for more precision
    
    // IV RANK PARAMETERS
    this.ivRankPeriod = parameters.ivRankPeriod || 252; // 1-year IV rank
    this.ivRankHigh = parameters.ivRankHigh || 80; // High IV rank threshold
    this.ivRankLow = parameters.ivRankLow || 20; // Low IV rank threshold
    this.ivRankExtreme = parameters.ivRankExtreme || 90; // Extreme IV levels
    
    // STOCHASTIC PARAMETERS
    this.stochKPeriod = parameters.stochKPeriod || 14;
    this.stochDPeriod = parameters.stochDPeriod || 3;
    this.stochOverbought = parameters.stochOverbought || 80;
    this.stochOversold = parameters.stochOversold || 20;
    this.stochExtreme = parameters.stochExtreme || 90; // More extreme for mean reversion
    
    // PARABOLIC SAR PARAMETERS
    this.sarAcceleration = parameters.sarAcceleration || 0.02;
    this.sarMaxAcceleration = parameters.sarMaxAcceleration || 0.2;
    
    // CHANDE MOMENTUM OSCILLATOR (CMO) PARAMETERS
    this.cmoPeriod = parameters.cmoPeriod || 20;
    this.cmoOverbought = parameters.cmoOverbought || 50;
    this.cmoOversold = parameters.cmoOversold || -50;
    this.cmoExtreme = parameters.cmoExtreme || 70; // Extreme momentum readings
    
    // MEAN REVERSION THRESHOLDS
    this.priceDeviationThreshold = parameters.priceDeviationThreshold || 0.015; // 1.5% from mean
    this.volumeSpike = parameters.volumeSpike || 2.0; // Volume spike confirmation
    
    // CONSERVATIVE RISK MANAGEMENT
    this.profitTarget = parameters.profitTarget || 0.25; // 25% profit target (quick scalps)
    this.stopLoss = parameters.stopLoss || 0.15; // 15% stop loss
    this.maxHoldingPeriod = parameters.maxHoldingPeriod || 20; // 20 minutes max
    this.quickScalpTarget = parameters.quickScalpTarget || 0.15; // 15% quick scalp
    this.quickScalpTime = parameters.quickScalpTime || 5; // 5 minutes for quick exit
    
    // POSITION MANAGEMENT (Very selective)
    this.maxPositions = parameters.maxPositions || 1; // One position at a time
    this.maxDailyTrades = parameters.maxDailyTrades || 3; // Very selective trades
    this.maxDailyLoss = parameters.maxDailyLoss || 0.05; // 5% daily loss limit
    this.minSignalStrength = parameters.minSignalStrength || 1.5; // High signal threshold
    
    // OPTION SELECTION (Lower risk Greeks)
    this.minDelta = parameters.minDelta || 0.15; // 0DTE optimized: allow more OTM
    this.maxDelta = parameters.maxDelta || 0.65; // 0DTE optimized: allow ATM range
    this.maxBidAskSpread = parameters.maxBidAskSpread || 0.08; // 8% max spread
    this.minVolume = parameters.minVolume || 15; // Higher volume requirement
    this.preferATM = parameters.preferATM || true; // Prefer ATM options for IV benefit
    
    // TRADING HOURS (High probability periods)
    this.tradingHours = {
      morning: { start: { hour: 10, minute: 0 }, end: { hour: 11, minute: 30 } },
      afternoon: { start: { hour: 13, minute: 30 }, end: { hour: 15, minute: 0 } }
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
    this.ivHistory = []; // Simulated IV based on price action
    this.stochHistory = [];
    this.sarHistory = [];
    this.cmoHistory = [];
    this.currentPositions = [];
    this.dailyPnL = 0;
    this.dailyTrades = 0;
    this.movingAverage = 0;
    
    console.log(`🎯 [IV REVERSION INIT] IV Mean Reversion Strategy initialized:`);
    console.log(`   Max Risk Per Trade: ${(this.maxRiskPerTrade * 100).toFixed(1)}%`);
    console.log(`   Profit Target: ${(this.profitTarget * 100).toFixed(0)}%`);
    console.log(`   Max Daily Trades: ${this.maxDailyTrades}`);
    console.log(`   Min Signal Strength: ${this.minSignalStrength}`);
  }

  /**
   * Calculate Simulated IV Rank (using price volatility as proxy)
   */
  calculateIVRank(closes, period = 252) {
    if (closes.length < period) return 50; // Default to middle IV rank
    
    // Calculate rolling volatility
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push(Math.log(closes[i] / closes[i - 1]));
    }
    
    if (returns.length < 20) return 50;
    
    // Current volatility (last 20 days)
    const recentReturns = returns.slice(-20);
    const currentVol = Math.sqrt(recentReturns.reduce((sum, ret) => sum + ret * ret, 0) / recentReturns.length) * Math.sqrt(252);
    
    // Historical volatilities
    const historicalVols = [];
    const lookback = Math.min(period, returns.length - 20);
    
    for (let i = 20; i <= lookback; i++) {
      const periodReturns = returns.slice(i - 20, i);
      const vol = Math.sqrt(periodReturns.reduce((sum, ret) => sum + ret * ret, 0) / periodReturns.length) * Math.sqrt(252);
      historicalVols.push(vol);
    }
    
    if (historicalVols.length === 0) return 50;
    
    // Calculate rank
    const lowerCount = historicalVols.filter(vol => vol < currentVol).length;
    const rank = (lowerCount / historicalVols.length) * 100;
    
    return Math.max(0, Math.min(100, rank));
  }

  /**
   * Calculate Stochastic Oscillator
   */
  calculateStochastic(highs, lows, closes, kPeriod = 14, dPeriod = 3) {
    if (closes.length < kPeriod) return { k: [], d: [] };
    
    const kValues = [];
    
    for (let i = kPeriod - 1; i < closes.length; i++) {
      const periodHighs = highs.slice(i - kPeriod + 1, i + 1);
      const periodLows = lows.slice(i - kPeriod + 1, i + 1);
      
      const highestHigh = Math.max(...periodHighs);
      const lowestLow = Math.min(...periodLows);
      
      const kValue = ((closes[i] - lowestLow) / (highestHigh - lowestLow)) * 100;
      kValues.push(kValue);
    }
    
    // Calculate %D (SMA of %K)
    const dValues = [];
    for (let i = dPeriod - 1; i < kValues.length; i++) {
      const dValue = kValues.slice(i - dPeriod + 1, i + 1).reduce((sum, val) => sum + val, 0) / dPeriod;
      dValues.push(dValue);
    }
    
    return { k: kValues, d: dValues };
  }

  /**
   * Calculate Parabolic SAR
   */
  calculateParabolicSAR(highs, lows, acceleration = 0.02, maxAcceleration = 0.2) {
    if (highs.length < 2) return [];
    
    const sar = [];
    let isUpTrend = highs[1] > highs[0];
    let currentSar = isUpTrend ? lows[0] : highs[0];
    let extremePoint = isUpTrend ? highs[1] : lows[1];
    let currentAcceleration = acceleration;
    
    sar.push(currentSar);
    
    for (let i = 1; i < highs.length; i++) {
      const high = highs[i];
      const low = lows[i];
      
      // Calculate next SAR
      let nextSar = currentSar + currentAcceleration * (extremePoint - currentSar);
      
      if (isUpTrend) {
        // Uptrend
        nextSar = Math.min(nextSar, lows[i - 1]);
        if (i > 1) nextSar = Math.min(nextSar, lows[i - 2]);
        
        if (low <= nextSar) {
          // Trend reversal
          isUpTrend = false;
          nextSar = extremePoint;
          extremePoint = low;
          currentAcceleration = acceleration;
        } else if (high > extremePoint) {
          // New extreme point
          extremePoint = high;
          currentAcceleration = Math.min(currentAcceleration + acceleration, maxAcceleration);
        }
      } else {
        // Downtrend
        nextSar = Math.max(nextSar, highs[i - 1]);
        if (i > 1) nextSar = Math.max(nextSar, highs[i - 2]);
        
        if (high >= nextSar) {
          // Trend reversal
          isUpTrend = true;
          nextSar = extremePoint;
          extremePoint = high;
          currentAcceleration = acceleration;
        } else if (low < extremePoint) {
          // New extreme point
          extremePoint = low;
          currentAcceleration = Math.min(currentAcceleration + acceleration, maxAcceleration);
        }
      }
      
      currentSar = nextSar;
      sar.push(currentSar);
    }
    
    return sar;
  }

  /**
   * Calculate Chande Momentum Oscillator (CMO)
   */
  calculateCMO(closes, period = 20) {
    if (closes.length <= period) return [];
    
    const cmo = [];
    
    for (let i = period; i < closes.length; i++) {
      let upSum = 0;
      let downSum = 0;
      
      for (let j = i - period + 1; j <= i; j++) {
        const change = closes[j] - closes[j - 1];
        if (change > 0) {
          upSum += change;
        } else {
          downSum += Math.abs(change);
        }
      }
      
      const cmoValue = ((upSum - downSum) / (upSum + downSum)) * 100;
      cmo.push(isNaN(cmoValue) ? 0 : cmoValue);
    }
    
    return cmo;
  }

  /**
   * Check if within optimal trading hours
   */
  isWithinTradingHours(timestamp) {
    const time = moment(timestamp).tz('America/New_York');
    const hour = time.hour();
    const minute = time.minute();
    
    // Avoid first 30 minutes (9:30-10:00)
    if (hour === 9) return false;
    
    // Morning session (10:00 - 11:30 AM)
    if (hour >= this.tradingHours.morning.start.hour && hour < this.tradingHours.morning.end.hour) {
      return true;
    }
    if (hour === this.tradingHours.morning.end.hour && minute < this.tradingHours.morning.end.minute) {
      return true;
    }
    
    // Afternoon session (1:30 - 3:00 PM)
    if (hour >= this.tradingHours.afternoon.start.hour && hour < this.tradingHours.afternoon.end.hour) {
      return true;
    }
    
    // Avoid last 30 minutes (3:30-4:00)
    return false;
  }

  /**
   * Calculate signal strength for mean reversion
   */
  calculateSignalStrength(ivRank, stoch, cmo, sarSignal, priceDeviation, volumeRatio) {
    let strength = 1.0;
    
    // IV Rank extreme readings (better for selling premium)
    if (ivRank > this.ivRankExtreme) strength += 0.4; // Very high IV
    else if (ivRank > this.ivRankHigh) strength += 0.2;
    
    if (ivRank < this.ivRankLow) strength += 0.3; // Low IV for buying
    
    // Stochastic extremes
    if (stoch.k > this.stochExtreme || stoch.k < (100 - this.stochExtreme)) {
      strength += 0.3;
    }
    
    // CMO divergence
    if (Math.abs(cmo) > this.cmoExtreme) strength += 0.3;
    
    // SAR trend confirmation
    if (sarSignal !== 0) strength += 0.2;
    
    // Price deviation from mean
    if (Math.abs(priceDeviation) > this.priceDeviationThreshold) {
      strength += 0.3;
    }
    
    // Volume confirmation
    if (volumeRatio > this.volumeSpike) strength += 0.2;
    
    return Math.min(strength, 2.5); // Cap at 2.5 for very selective trades
  }

  /**
   * Generate high-probability mean reversion signals
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
      const maxHistory = 300; // Longer history for IV calculations
      if (this.priceHistory.length > maxHistory) {
        this.priceHistory.shift();
        this.highHistory.shift();
        this.lowHistory.shift();
        this.volumeHistory.shift();
      }
      
      // Need significant history for IV rank
      if (this.priceHistory.length < 60) return;
      
      // Check trading hours
      if (!this.isWithinTradingHours(bar.t)) return;
      
      // Check daily trade limits (very selective)
      if (this.dailyTrades >= this.maxDailyTrades) return;
      
      // Calculate indicators
      const ivRank = this.calculateIVRank(this.priceHistory, this.ivRankPeriod);
      const stoch = this.calculateStochastic(this.highHistory, this.lowHistory, this.priceHistory, 
                                            this.stochKPeriod, this.stochDPeriod);
      const sar = this.calculateParabolicSAR(this.highHistory, this.lowHistory, 
                                           this.sarAcceleration, this.sarMaxAcceleration);
      const cmo = this.calculateCMO(this.priceHistory, this.cmoPeriod);
      
      if (stoch.k.length === 0 || stoch.d.length === 0 || sar.length === 0 || cmo.length === 0) {
        return;
      }
      
      const currentStochK = stoch.k[stoch.k.length - 1];
      const currentStochD = stoch.d[stoch.d.length - 1];
      const currentSar = sar[sar.length - 1];
      const currentCmo = cmo[cmo.length - 1];
      
      // Calculate moving average for price deviation
      const smaLength = Math.min(20, this.priceHistory.length);
      this.movingAverage = this.priceHistory.slice(-smaLength).reduce((sum, price) => sum + price, 0) / smaLength;
      const priceDeviation = (currentPrice - this.movingAverage) / this.movingAverage;
      
      // SAR trend signal
      const sarSignal = currentPrice > currentSar ? 1 : (currentPrice < currentSar ? -1 : 0);
      
      // Volume analysis
      const volumeRatio = this.volumeHistory.length >= 10 ? 
        currentVolume / (this.volumeHistory.slice(-10).reduce((a, b) => a + b, 0) / 10) : 1;
      
      // ==================== BULLISH MEAN REVERSION (Oversold Bounce) ====================
      
      const stochOversold = currentStochK < this.stochOversold && currentStochD < this.stochOversold;
      const stochTurningUp = currentStochK > currentStochD; // Stoch turning up
      const cmoOversold = currentCmo < this.cmoOversold;
      const priceBelowMean = priceDeviation < -this.priceDeviationThreshold;
      const sarBullish = sarSignal === 1 || (sarSignal === -1 && Math.abs(currentPrice - currentSar) / currentPrice < 0.005);
      const lowIV = ivRank < this.ivRankLow; // Good for buying options
      const volumeConfirmation = volumeRatio > 1.5;
      
      if (stochOversold && stochTurningUp && cmoOversold && priceBelowMean && (lowIV || volumeConfirmation)) {
        const signalStrength = this.calculateSignalStrength(ivRank, {k: currentStochK, d: currentStochD}, 
                                                          currentCmo, sarSignal, priceDeviation, volumeRatio);
        
        if (signalStrength >= this.minSignalStrength) {
          const positionSize = this.accountSize * this.maxRiskPerTrade * Math.min(signalStrength / 2, 1);
          
          if (positionSize <= this.settledCash && this.currentPositions.length < this.maxPositions) {
            signals.push({
              timestamp: bar.t,
              signal_type: 'BUY_CALL',
              underlying_price: currentPrice,
              iv_rank: ivRank,
              stoch_k: currentStochK,
              stoch_d: currentStochD,
              cmo: currentCmo,
              sar: currentSar,
              price_deviation: priceDeviation,
              volume_ratio: volumeRatio,
              signal_strength: signalStrength,
              position_size: Math.min(positionSize, this.maxPositionValue),
              signal_reason: 'OVERSOLD_MEAN_REVERSION',
              target_delta: 0.35,
              option_type: 'call'
            });
            
            console.log(`🎯 [CALL REVERSION] Oversold bounce at $${currentPrice.toFixed(2)}`);
            console.log(`   IV Rank: ${ivRank.toFixed(1)}, Stoch: ${currentStochK.toFixed(1)}/${currentStochD.toFixed(1)}`);
            console.log(`   CMO: ${currentCmo.toFixed(1)}, Price Dev: ${(priceDeviation * 100).toFixed(2)}%`);
            console.log(`   Signal Strength: ${signalStrength.toFixed(2)}, Position: $${positionSize.toFixed(0)}`);
          }
        }
      }
      
      // ==================== BEARISH MEAN REVERSION (Overbought Fade) ====================
      
      const stochOverbought = currentStochK > this.stochOverbought && currentStochD > this.stochOverbought;
      const stochTurningDown = currentStochK < currentStochD; // Stoch turning down
      const cmoOverbought = currentCmo > this.cmoOverbought;
      const priceAboveMean = priceDeviation > this.priceDeviationThreshold;
      const sarBearish = sarSignal === -1 || (sarSignal === 1 && Math.abs(currentPrice - currentSar) / currentPrice < 0.005);
      const highIV = ivRank > this.ivRankHigh; // Can sell premium or buy puts
      
      if (stochOverbought && stochTurningDown && cmoOverbought && priceAboveMean && volumeConfirmation) {
        const signalStrength = this.calculateSignalStrength(ivRank, {k: currentStochK, d: currentStochD}, 
                                                          currentCmo, sarSignal, priceDeviation, volumeRatio);
        
        if (signalStrength >= this.minSignalStrength) {
          const positionSize = this.accountSize * this.maxRiskPerTrade * Math.min(signalStrength / 2, 1);
          
          if (positionSize <= this.settledCash && this.currentPositions.length < this.maxPositions) {
            signals.push({
              timestamp: bar.t,
              signal_type: 'BUY_PUT',
              underlying_price: currentPrice,
              iv_rank: ivRank,
              stoch_k: currentStochK,
              stoch_d: currentStochD,
              cmo: currentCmo,
              sar: currentSar,
              price_deviation: priceDeviation,
              volume_ratio: volumeRatio,
              signal_strength: signalStrength,
              position_size: Math.min(positionSize, this.maxPositionValue),
              signal_reason: 'OVERBOUGHT_MEAN_REVERSION',
              target_delta: -0.35,
              option_type: 'put'
            });
            
            console.log(`🎯 [PUT REVERSION] Overbought fade at $${currentPrice.toFixed(2)}`);
            console.log(`   IV Rank: ${ivRank.toFixed(1)}, Stoch: ${currentStochK.toFixed(1)}/${currentStochD.toFixed(1)}`);
            console.log(`   CMO: ${currentCmo.toFixed(1)}, Price Dev: ${(priceDeviation * 100).toFixed(2)}%`);
            console.log(`   Signal Strength: ${signalStrength.toFixed(2)}, Position: $${positionSize.toFixed(0)}`);
          }
        }
      }
    });
    
    return signals;
  }

  /**
   * Conservative exit logic with quick scalping
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
    
    // Quick scalp target (5 minutes, 15% profit)
    if (timeHeld <= this.quickScalpTime && pnlPercent >= this.quickScalpTarget) {
      return { shouldExit: true, reason: 'QUICK_SCALP', pnl, pnlPercent };
    }
    
    // Main profit target
    if (pnlPercent >= this.profitTarget) {
      return { shouldExit: true, reason: 'PROFIT_TARGET', pnl, pnlPercent };
    }
    
    // Conservative stop loss
    if (pnlPercent <= -this.stopLoss) {
      return { shouldExit: true, reason: 'STOP_LOSS', pnl, pnlPercent };
    }
    
    // Early exit if position moves against us quickly
    if (timeHeld >= 3 && pnlPercent < -0.08) { // 3 minutes and -8%
      return { shouldExit: true, reason: 'EARLY_STOP', pnl, pnlPercent };
    }
    
    // Tight time management
    if (timeHeld >= this.maxHoldingPeriod) {
      return { shouldExit: true, reason: 'TIME_STOP', pnl, pnlPercent };
    }
    
    // Conservative end-of-day close
    const time = moment(currentTime).tz('America/New_York');
    if (time.hour() >= 15 && time.minute() >= 30) {
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
   * Get conservative contract selection criteria
   */
  getContractCriteria(signal) {
    return {
      optionType: signal.option_type,
      minDelta: this.minDelta,
      maxDelta: this.maxDelta,
      maxBidAskSpread: this.maxBidAskSpread,
      minVolume: this.minVolume,
      targetDelta: Math.abs(signal.target_delta || 0.35),
      maxPositionValue: signal.position_size,
      preferATM: this.preferATM, // ATM options for IV edge
      requireTightSpreads: true // Require tight spreads for quick entries/exits
    };
  }

  /**
   * Get strategy parameters
   */
  getParameters() {
    return {
      strategy: 'small-account-iv-mean-reversion',
      maxRiskPerTrade: this.maxRiskPerTrade,
      profitTarget: this.profitTarget,
      stopLoss: this.stopLoss,
      quickScalpTarget: this.quickScalpTarget,
      maxHoldingPeriod: this.maxHoldingPeriod,
      ivRankHigh: this.ivRankHigh,
      ivRankLow: this.ivRankLow,
      stochOverbought: this.stochOverbought,
      stochOversold: this.stochOversold,
      minSignalStrength: this.minSignalStrength,
      maxDailyTrades: this.maxDailyTrades,
      preferATM: this.preferATM
    };
  }

  /**
   * Reset for new trading day
   */
  reset() {
    this.dailyPnL = 0;
    this.dailyTrades = 0;
    this.currentPositions = [];
    console.log(`🔄 [IV REVERSION RESET] Strategy reset for new trading day`);
  }

  /**
   * Update account size for progressive scaling
   */
  updateAccountSize(newSize) {
    this.accountSize = newSize;
    this.settledCash = newSize * 0.95;
    console.log(`📊 [IV REVERSION UPDATE] Account size: $${newSize}, Available: $${this.settledCash.toFixed(2)}`);
  }
}

module.exports = SmallAccountIVMeanReversionStrategy;