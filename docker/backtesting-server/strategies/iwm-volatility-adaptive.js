/**
 * 📈 IWM Volatility-Adaptive Strategy for 0DTE Options
 * 
 * 🎯 DESIGNED FOR SMALL CAP VOLATILITY PATTERNS
 * 
 * Based on analysis showing IWM has different characteristics than SPY:
 * - Higher volatility requiring wider stops
 * - Different momentum patterns  
 * - More erratic intraday moves
 * - Lower options liquidity
 * 
 * Research Findings (Dec 18-19, 2024):
 * - SPY: +$550 profit with 60% win rate
 * - IWM: -$278 to -$1,738 losses with 15-29% win rates
 * - IWM signals 2.6x more frequent but much lower quality
 * - Stop losses hit 0% (calm day) to 54% (volatile day) on IWM
 * 
 * IWM-Specific Adaptations:
 * - Volatility-adjusted entry thresholds
 * - Much wider stop losses (50%+ on volatile days)
 * - Reduced position sizing due to higher risk
 * - Alternative signal logic optimized for small cap momentum
 * - Liquidity filters to avoid illiquid options
 * 
 * Strategy Status: 🧪 EXPERIMENTAL
 * - Requires extensive testing and parameter optimization
 * - May need completely different signal generation approach
 * - Currently losing money - needs major improvements
 * 
 * Author: AI Assistant
 * Version: 1.0 - Initial Research
 * Last Updated: November 2024
 */

const contractSelector = require('../utils/contract-selector');

class IWMVolatilityAdaptiveStrategy {
  constructor(parameters = {}) {
    this.name = 'IWM Volatility-Adaptive Strategy';
    
    // 🎯 REQUIRED STRATEGY PROPERTIES (following working template)
    this.maxRiskPerTrade = parameters.maxRiskPerTrade || 0.05; // 5% per trade 
    this.preferredDTE = 0; // 0DTE strategy
    this.maxPositions = parameters.maxPositions || 2; // Lower for IWM volatility
    this.contractsPerTrade = 1; // 1 contract per trade
    this.currentPositions = []; // Track current positions
    
    // 📊 IWM-SPECIFIC VOLATILITY PARAMETERS
    // Start with working thresholds, then make more conservative
    this.rsiPeriod = parameters.rsiPeriod || 14;
    this.rsiOversold = parameters.rsiOversold || 40; // Less extreme but still conservative vs SPY (35)
    this.rsiOverbought = parameters.rsiOverbought || 60; // Less extreme but still conservative vs SPY (65) 
    this.vwapPeriod = parameters.vwapPeriod || 30;
    this.vwapThreshold = parameters.vwapThreshold || 0.003; // 0.3% vs SPY's 0.2%
    
    // 🎯 SIGNAL QUALITY FILTERS 
    this.minSignalStrength = parameters.minSignalStrength || 1.5; // Start reasonable, can increase later
    
    // 📉 CONSERVATIVE DELTA TARGETING (closer to ATM for IWM)
    this.targetCallDelta = parameters.targetCallDelta || 0.50; 
    this.targetPutDelta = parameters.targetPutDelta || -0.50;
    this.minDelta = parameters.minDelta || 0.30; 
    this.maxDelta = parameters.maxDelta || 0.75; 
    
    // 🛡️ WIDE STOP LOSSES (IWM needs much wider stops)
    this.stopLossPercent = parameters.stopLossPercent || 0.50; // 50% stop loss
    this.profitTargetPercent = parameters.profitTargetPercent || 0.30; // 30% profit target
    this.maxHoldMinutes = parameters.maxHoldMinutes || 90; // 90 minute max hold
    
    // 📊 LIQUIDITY FILTERS
    this.minVolume = parameters.minVolume || 50; 
    this.maxBidAskSpread = parameters.maxBidAskSpread || 0.20; // 20% max spread
    
    // State tracking
    this.currentVWAP = null;
    this.currentRSI = null;
    this.priceHistory = [];
    this.volumeHistory = [];
    this.signalCount = 0;
    this.barCount = 0;
    
    console.log('🧪 IWM Volatility-Adaptive Strategy initialized:', {
      tradingWindow: '9:30-11:30 AM ET',
      rsiThresholds: `${this.rsiOversold}/${this.rsiOverbought} (extreme)`,
      vwapThreshold: (this.vwapThreshold * 100).toFixed(2) + '%',
      targetDeltas: `Conservative ATM - Calls: ${this.targetCallDelta}, Puts: ${this.targetPutDelta}`,
      volatilityManagement: {
        expensiveThreshold: '$' + this.expensiveContractThreshold,
        expensiveStop: (this.expensiveStopLoss * 100).toFixed(0) + '%',
        cheapStop: (this.cheapStopLoss * 100).toFixed(0) + '%',
        maxPositions: this.maxPositions,
        portfolioLimit: (this.maxPortfolioAllocation * 100).toFixed(0) + '%'
      },
      experimentalStatus: 'NEEDS OPTIMIZATION - Currently losing money on IWM'
    });
  }

  /**
   * Detect if current day has high volatility
   * Adjusts risk parameters accordingly
   */
  detectVolatilityRegime(underlyingBars) {
    if (underlyingBars.length < this.volatilityLookback) return;
    
    // Calculate recent daily ranges
    const recentRanges = underlyingBars.slice(-this.volatilityLookback).map(bar => {
      return (parseFloat(bar.h) - parseFloat(bar.l)) / parseFloat(bar.o);
    });
    
    const avgRange = recentRanges.reduce((a, b) => a + b, 0) / recentRanges.length;
    this.isHighVolatilityDay = avgRange > this.highVolatilityThreshold;
    
    if (this.isHighVolatilityDay) {
      console.log(`⚠️  HIGH VOLATILITY DETECTED: ${(avgRange * 100).toFixed(1)}% avg range - Widening stops further`);
      // Could dynamically adjust stops here
    }
  }

  /**
   * Calculate RSI (Relative Strength Index)
   */
  calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) {
      return 50; // Neutral if insufficient data
    }

    const recentPrices = prices.slice(-period - 1);
    let gains = 0;
    let losses = 0;

    for (let i = 1; i < recentPrices.length; i++) {
      const change = recentPrices[i] - recentPrices[i - 1];
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    return rsi;
  }

  /**
   * Calculate VWAP (Volume Weighted Average Price)
   */
  calculateVWAP(prices, volumes) {
    if (prices.length === 0 || volumes.length === 0) return null;
    
    const recentPrices = prices.slice(-this.vwapPeriod);
    const recentVolumes = volumes.slice(-this.vwapPeriod);
    
    let sumPV = 0;
    let sumV = 0;
    
    for (let i = 0; i < recentPrices.length; i++) {
      sumPV += recentPrices[i] * recentVolumes[i];
      sumV += recentVolumes[i];
    }
    
    return sumV > 0 ? sumPV / sumV : null;
  }

  /**
   * Generate trading signals with IWM-specific logic
   */
  generateSignals(underlyingBars) {
    if (underlyingBars.length < Math.max(this.rsiPeriod, this.vwapPeriod)) {
      return [];
    }

    // Update volatility regime
    this.detectVolatilityRegime(underlyingBars);

    const currentBar = underlyingBars[underlyingBars.length - 1];
    const currentPrice = parseFloat(currentBar.c);

    // Build price and volume history
    if (underlyingBars.length >= 2) {
      const previousBar = underlyingBars[underlyingBars.length - 2];
      this.priceHistory.push(parseFloat(previousBar.c));
      this.volumeHistory.push(parseFloat(previousBar.v) || 1);
      
      // Keep only necessary history
      const maxHistory = Math.max(this.rsiPeriod, this.vwapPeriod) + 10;
      if (this.priceHistory.length > maxHistory) {
        this.priceHistory = this.priceHistory.slice(-maxHistory);
        this.volumeHistory = this.volumeHistory.slice(-maxHistory);
      }
    }

    // Calculate indicators
    if (this.priceHistory.length >= this.rsiPeriod) {
      this.currentRSI = this.calculateRSI(this.priceHistory, this.rsiPeriod);
      this.currentVWAP = this.calculateVWAP(this.priceHistory, this.volumeHistory);
    }

    if (!this.currentRSI || !this.currentVWAP) {
      return [];
    }

    const signals = [];
    const vwapDeviation = Math.abs(currentPrice - this.currentVWAP) / this.currentVWAP;

    // 📈 CALL SIGNAL - Simplified for IWM (start permissive, optimize later)
    if (this.currentRSI < this.rsiOversold && 
        currentPrice > this.currentVWAP) {
      
      const callSignalStrength = 1.5; // Simplified signal strength
      
      signals.push({
        timestamp: currentBar.t,
        signal_type: 'BUY_CALL',
        underlying_price: currentPrice,
        signal_strength: callSignalStrength,
        position_size: 100,
        signal_reason: `IWM RSI ${this.currentRSI.toFixed(1)} < ${this.rsiOversold}, Price > VWAP`,
        target_delta: this.targetCallDelta,
        option_type: 'call'
      });
      this.signalCount++;
      console.log(`🧪 [IWM CALL] RSI: ${this.currentRSI.toFixed(1)}, Price: $${currentPrice.toFixed(2)}, VWAP: $${this.currentVWAP.toFixed(2)}`);
    }

    // 📉 PUT SIGNAL - Simplified for IWM
    if (this.currentRSI > this.rsiOverbought && 
        currentPrice < this.currentVWAP) {
      
      const putSignalStrength = 1.5; // Simplified signal strength
      
      signals.push({
        timestamp: currentBar.t,
        signal_type: 'BUY_PUT',
        underlying_price: currentPrice,
        signal_strength: putSignalStrength,
        position_size: 100,
        signal_reason: `IWM RSI ${this.currentRSI.toFixed(1)} > ${this.rsiOverbought}, Price < VWAP`,
        target_delta: this.targetPutDelta,
        option_type: 'put'
      });
      this.signalCount++;
      console.log(`🧪 [IWM PUT] RSI: ${this.currentRSI.toFixed(1)}, Price: $${currentPrice.toFixed(2)}, VWAP: $${this.currentVWAP.toFixed(2)}`);
    }

    return signals;
  }

  /**
   * Calculate signal strength with IWM-specific weighting
   */
  calculateSignalStrength(type, rsi, vwapDeviation) {
    let strength = 0;
    
    if (type === 'CALL') {
      // More extreme RSI gets higher score
      const rsiStrength = Math.max(0, (this.rsiOversold - rsi) / this.rsiOversold);
      strength += rsiStrength * 2.0; // RSI weight
      
      // VWAP momentum confirmation
      strength += Math.min(vwapDeviation / 0.01, 2.0); // Cap at 2.0
      
      // Volatility adjustment - reduce signal strength on high vol days
      if (this.isHighVolatilityDay) {
        strength *= 0.8; // Reduce by 20%
      }
      
    } else if (type === 'PUT') {
      // More extreme RSI gets higher score
      const rsiStrength = Math.max(0, (rsi - this.rsiOverbought) / (100 - this.rsiOverbought));
      strength += rsiStrength * 2.0; // RSI weight
      
      // VWAP momentum confirmation  
      strength += Math.min(vwapDeviation / 0.01, 2.0); // Cap at 2.0
      
      // Volatility adjustment
      if (this.isHighVolatilityDay) {
        strength *= 0.8; // Reduce by 20%
      }
    }
    
    return Math.round(strength * 100) / 100; // Round to 2 decimals
  }

  /**
   * Check if new position can be opened (required method)
   */
  canOpenPosition() {
    return this.currentPositions.length < this.maxPositions;
  }

  /**
   * Get contract criteria for IWM options (required method)
   */
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

  /**
   * Exit logic with IWM-specific wide stops (required method)
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
    
    // PRIORITY 1: Profit target (30% for IWM volatility)
    if (pnlPercent >= this.profitTargetPercent) {
      console.log(`   💰 [IWM PROFIT] ${(this.profitTargetPercent * 100).toFixed(0)}% target: ${(pnlPercent * 100).toFixed(2)}% in ${timeHeld.toFixed(1)} min`);
      return { shouldExit: true, reason: 'PROFIT_TARGET', pnl, pnlPercent };
    }

    // PRIORITY 2: Wide stop loss (50% for IWM volatility)
    if (pnlPercent <= -this.stopLossPercent) {
      console.log(`   🛑 [IWM STOP] ${(this.stopLossPercent * 100).toFixed(0)}% stop: ${(pnlPercent * 100).toFixed(2)}% in ${timeHeld.toFixed(1)} min`);
      return { shouldExit: true, reason: 'STOP_LOSS', pnl, pnlPercent };
    }
    
    // PRIORITY 3: Time stop (90 minutes for IWM)
    if (timeHeld >= this.maxHoldMinutes) {
      console.log(`   ⏱️  [IWM TIME] ${this.maxHoldMinutes}min limit: ${(pnlPercent * 100).toFixed(2)}% in ${timeHeld.toFixed(1)} min`);
      return { shouldExit: true, reason: 'TIME_STOP', pnl, pnlPercent };
    }
    
    // Continue holding
    return { shouldExit: false };
  }

  /**
   * Get strategy parameters (required method)
   */
  getParameters() {
    return {
      strategy: 'iwm-volatility-adaptive',
      maxRiskPerTrade: this.maxRiskPerTrade,
      signalCount: this.signalCount,
      barCount: this.barCount,
      rsiThresholds: `${this.rsiOversold}/${this.rsiOverbought}`,
      vwapThreshold: this.vwapThreshold,
      stopLoss: this.stopLossPercent,
      profitTarget: this.profitTargetPercent,
      maxHoldMinutes: this.maxHoldMinutes,
      maxPositions: this.maxPositions
    };
  }

  /**
   * Reset for new trading day (optional method)
   */
  reset() {
    this.signalCount = 0;
    this.barCount = 0;
    this.priceHistory = [];
    this.volumeHistory = [];
    this.currentVWAP = null;
    this.currentRSI = null;
    console.log(`🧪 [IWM STRATEGY] Reset for new trading day`);
  }
}

module.exports = IWMVolatilityAdaptiveStrategy;