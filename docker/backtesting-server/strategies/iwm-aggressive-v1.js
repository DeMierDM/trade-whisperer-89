/**
 * 🎯 IWM Aggressive Strategy V1 - Parameter Optimization
 * 
 * OBJECTIVE: Test more frequent trading with tighter stops
 * 
 * Approach: More signals, tighter risk management, faster exits
 * Theory: IWM might work better with quick scalps due to volatility
 */

const contractSelector = require('../utils/contract-selector');

class IWMAggressiveV1Strategy {
  constructor(parameters = {}) {
    this.name = 'IWM Aggressive V1 Strategy';
    
    // Required strategy properties
    this.maxRiskPerTrade = 0.02; // 2% per trade
    this.preferredDTE = 0;
    this.maxPositions = 3; // Allow more positions
    this.contractsPerTrade = 1;
    this.currentPositions = [];
    
    // AGGRESSIVE PARAMETERS - More frequent signals
    this.rsiPeriod = 10; // Shorter RSI period for faster signals
    this.rsiOversold = 45; // Less extreme thresholds
    this.rsiOverbought = 55;
    this.vwapPeriod = 15; // Shorter VWAP
    this.vwapThreshold = 0.002; // Lower threshold (0.2%)
    
    this.minSignalStrength = 1.0;
    
    // Delta targeting
    this.targetCallDelta = 0.50;
    this.targetPutDelta = -0.50;
    this.minDelta = 0.30;
    this.maxDelta = 0.70;
    
    // TIGHTER STOPS for quick scalps
    this.stopLossPercent = 0.25; // 25% stop
    this.profitTargetPercent = 0.15; // 15% profit target (quick scalps)
    this.maxHoldMinutes = 45; // 45 minute max hold
    
    // Liquidity filters
    this.minVolume = 50;
    this.maxBidAskSpread = 0.20;
    
    // State tracking
    this.currentVWAP = null;
    this.currentRSI = null;
    this.priceHistory = [];
    this.volumeHistory = [];
    this.signalCount = 0;
    this.barCount = 0;
    
    console.log('🎯 IWM Aggressive V1: RSI 45/55, 25% stops, 15% targets, 45min holds');
  }

  calculateRSI(prices, period = 10) {
    if (prices.length < period + 1) return 50;

    const recentPrices = prices.slice(-period - 1);
    let gains = 0, losses = 0;

    for (let i = 1; i < recentPrices.length; i++) {
      const change = recentPrices[i] - recentPrices[i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  calculateVWAP(prices, volumes) {
    if (prices.length === 0 || volumes.length === 0) return null;
    
    const recentPrices = prices.slice(-this.vwapPeriod);
    const recentVolumes = volumes.slice(-this.vwapPeriod);
    
    let sumPV = 0, sumV = 0;
    for (let i = 0; i < recentPrices.length; i++) {
      sumPV += recentPrices[i] * recentVolumes[i];
      sumV += recentVolumes[i];
    }
    
    return sumV > 0 ? sumPV / sumV : null;
  }

  generateSignals(underlyingBars) {
    if (underlyingBars.length < Math.max(this.rsiPeriod, this.vwapPeriod)) return [];

    // Build price history
    if (underlyingBars.length >= 2) {
      const previousBar = underlyingBars[underlyingBars.length - 2];
      this.priceHistory.push(parseFloat(previousBar.c));
      this.volumeHistory.push(parseFloat(previousBar.v) || 1);
      
      const maxHistory = Math.max(this.rsiPeriod, this.vwapPeriod) + 10;
      if (this.priceHistory.length > maxHistory) {
        this.priceHistory = this.priceHistory.slice(-maxHistory);
        this.volumeHistory = this.volumeHistory.slice(-maxHistory);
      }
    }

    if (this.priceHistory.length < this.rsiPeriod) return [];

    const currentBar = underlyingBars[underlyingBars.length - 1];
    const currentPrice = parseFloat(currentBar.c);

    this.currentRSI = this.calculateRSI(this.priceHistory, this.rsiPeriod);
    this.currentVWAP = this.calculateVWAP(this.priceHistory, this.volumeHistory);

    if (!this.currentRSI || !this.currentVWAP) return [];

    const signals = [];
    const vwapDeviation = Math.abs(currentPrice - this.currentVWAP) / this.currentVWAP;

    // Aggressive CALL signals (more frequent)
    if (this.currentRSI < this.rsiOversold && 
        currentPrice > this.currentVWAP && 
        vwapDeviation > this.vwapThreshold) {
      signals.push({
        timestamp: currentBar.t,
        signal_type: 'BUY_CALL',
        underlying_price: currentPrice,
        signal_strength: 1.5,
        position_size: 100,
        signal_reason: `Aggressive: RSI ${this.currentRSI.toFixed(1)} < ${this.rsiOversold}, VWAP+ ${(vwapDeviation*100).toFixed(1)}%`,
        target_delta: this.targetCallDelta,
        option_type: 'call'
      });
      this.signalCount++;
    }

    // Aggressive PUT signals
    if (this.currentRSI > this.rsiOverbought && 
        currentPrice < this.currentVWAP && 
        vwapDeviation > this.vwapThreshold) {
      signals.push({
        timestamp: currentBar.t,
        signal_type: 'BUY_PUT',
        underlying_price: currentPrice,
        signal_strength: 1.5,
        position_size: 100,
        signal_reason: `Aggressive: RSI ${this.currentRSI.toFixed(1)} > ${this.rsiOverbought}, VWAP- ${(vwapDeviation*100).toFixed(1)}%`,
        target_delta: this.targetPutDelta,
        option_type: 'put'
      });
      this.signalCount++;
    }

    return signals;
  }

  canOpenPosition() {
    return this.currentPositions.length < this.maxPositions;
  }

  getContractCriteria(signal) {
    return {
      optionType: signal.option_type,
      minDelta: this.minDelta,
      maxDelta: this.maxDelta,
      maxBidAskSpread: this.maxBidAskSpread,
      minVolume: this.minVolume,
      targetDelta: Math.abs(signal.target_delta || 0.50),
      maxPositionValue: signal.position_size
    };
  }

  shouldExit(position, currentPrice, currentTime) {
    const entryPrice = position.entry_price;
    const entryTime = new Date(position.entry_timestamp || position.entry_time);
    const current = new Date(currentTime);
    const holdingTime = (current - entryTime) / 1000;
    
    const currentValue = currentPrice * 100 * position.quantity;
    const entryValue = entryPrice * 100 * position.quantity;
    const pnl = currentValue - entryValue;
    const pnlPercent = pnl / entryValue;
    
    const timeHeld = holdingTime / 60;
    
    if (pnlPercent >= this.profitTargetPercent) {
      return { shouldExit: true, reason: 'PROFIT_TARGET', pnl, pnlPercent };
    }

    if (pnlPercent <= -this.stopLossPercent) {
      return { shouldExit: true, reason: 'STOP_LOSS', pnl, pnlPercent };
    }
    
    if (timeHeld >= this.maxHoldMinutes) {
      return { shouldExit: true, reason: 'TIME_STOP', pnl, pnlPercent };
    }
    
    return { shouldExit: false };
  }

  getParameters() {
    return {
      strategy: 'iwm-aggressive-v1',
      maxRiskPerTrade: this.maxRiskPerTrade,
      rsiThresholds: `${this.rsiOversold}/${this.rsiOverbought}`,
      stopLoss: this.stopLossPercent,
      profitTarget: this.profitTargetPercent,
      maxHoldMinutes: this.maxHoldMinutes
    };
  }

  reset() {
    this.signalCount = 0;
    this.barCount = 0;
    this.priceHistory = [];
    this.volumeHistory = [];
  }
}

module.exports = IWMAggressiveV1Strategy;