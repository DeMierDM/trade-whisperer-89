/**
 * RSI-VWAP Enhanced Morning Session Strategy for 0DTE Options
 * 
 * EXPANDED FOR 9:30-11:30 AM ET (FULL MORNING SESSION)
 * 
 * Based on backtest analysis showing 10 AM hour has:
 * - 82.4% win rate (17 trades, 14 wins)
 * - +$20.96 average P&L per trade
 * - Total P&L: +$356.30
 * 
 * This far outperforms afternoon hours (2-4 PM):
 * - Afternoon: 11.1% win rate, -$12.32 avg P&L
 * 
 * Strategy combines:
 * 1. RSI Extreme signals (oversold < 30, overbought > 70)
 * 2. VWAP deviation confirmation (>0.25%)
 * 3. Opening Range Breakout (first 30 minutes)
 * 4. Morning-specific risk management
 * 
 * Target Metrics (10 AM only):
 * - Win Rate: 75-85%
 * - Sharpe Ratio: >3.0
 * - Profit Factor: >10.0
 * - Avg Hold: 5-10 minutes
 */

class RSIVWAPMorningSessionStrategy {
  constructor(parameters = {}) {
    this.name = 'RSI-VWAP Morning Session';
    
    // Core parameters - RELAXED for more frequent signals
    this.rsiPeriod = parameters.rsiPeriod || 14;
    this.rsiOversold = parameters.rsiOversold || 35; // Relaxed from 30
    this.rsiOverbought = parameters.rsiOverbought || 65; // Relaxed from 70
    this.vwapPeriod = parameters.vwapPeriod || 30;
    this.vwapThreshold = parameters.vwapThreshold || 0.002; // Relaxed from 0.25% to 0.2%
    
    // Morning-specific risk management (more aggressive given high win rate)
    this.profitTarget = parameters.profitTarget || 0.12; // 12% (higher than baseline)
    this.stopLoss = parameters.stopLoss || 0.18; // 18% (tighter than baseline)
    this.maxHoldingPeriod = parameters.maxHoldingPeriod || 8; // 8 minutes (slightly longer)
    this.maxPositions = parameters.maxPositions || 3;
    
    // EXPANDED TIME FILTER: 9:30-11:30 AM ET (FULL MORNING SESSION)
    this.allowedHours = [9, 10, 11]; // 9:30 AM - 11:30 AM ET
    this.allowedMinutesStart = 30; // Start at 9:30 AM
    this.allowedMinutesEnd = 150; // End at 11:30 (150 minutes after 9:00)
    this.endOfDayClose = parameters.endOfDayClose || '11:30:00'; // Close by 11:30 AM
    
    // Contract selection (slightly more aggressive for morning)
    this.minDelta = parameters.minDelta || 0.35; // Higher min delta
    this.maxDelta = parameters.maxDelta || 0.55; // Higher max delta
    this.maxBidAskSpread = parameters.maxBidAskSpread || 0.20; // Tighter spread (20%)
    
    // Opening Range tracking (critical for morning breakouts)
    this.openingRangeMinutes = 30;
    this.openingRangeHigh = null;
    this.openingRangeLow = null;
    this.openingRangeCalculated = false;
    
    // State tracking
    this.priceHistory = [];
    this.volumeHistory = [];
    this.currentVWAP = null;
    this.currentRSI = null;
    this.currentPositions = [];
    
    console.log('✅ RSI-VWAP Enhanced Morning Session Strategy initialized:', {
      tradingWindow: '9:30-11:30 AM ET (EXPANDED)',
      rsiOversold: this.rsiOversold,
      rsiOverbought: this.rsiOverbought,
      vwapThreshold: (this.vwapThreshold * 100).toFixed(2) + '%',
      profitTarget: (this.profitTarget * 100).toFixed(0) + '%',
      stopLoss: (this.stopLoss * 100).toFixed(0) + '%',
      maxHoldingPeriod: this.maxHoldingPeriod + ' min',
      maxPositions: this.maxPositions,
      minDelta: this.minDelta,
      maxDelta: this.maxDelta
    });
  }

  /**
   * Calculate RSI from price array
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
   * Update opening range (first 30 minutes)
   */
  updateOpeningRange(bar, minutesSinceOpen) {
    if (minutesSinceOpen <= this.openingRangeMinutes) {
      if (this.openingRangeHigh === null || bar.high > this.openingRangeHigh) {
        this.openingRangeHigh = bar.high;
      }
      if (this.openingRangeLow === null || bar.low < this.openingRangeLow) {
        this.openingRangeLow = bar.low;
      }
    } else if (!this.openingRangeCalculated) {
      this.openingRangeCalculated = true;
      console.log(`📊 [MORNING] Opening Range: High=${this.openingRangeHigh.toFixed(2)}, Low=${this.openingRangeLow.toFixed(2)}, Range=${(this.openingRangeHigh - this.openingRangeLow).toFixed(2)}`);
    }
  }

  /**
   * Generate signals from underlying bars array (backtest engine interface)
   *
   * ✅ LOOK-AHEAD BIAS FIXED:
   * - Uses PREVIOUS bar's close for indicator calculation
   * - Uses CURRENT bar's open for entry price simulation
   * - Simulates realistic trading: decision at bar N-1 close, execution at bar N open
   */
  generateSignals(underlyingBars) {
    const signals = [];

    underlyingBars.forEach((bar, index) => {
      // ✅ FIX: Skip first bar - need previous bar for unbiased calculation
      if (index === 0) {
        return;
      }

      // ✅ FIX: Update price/volume history with PREVIOUS bar's close (bar N-1)
      // In live trading: You see bar N-1 close, calculate indicators, then enter at bar N open
      const previousBar = underlyingBars[index - 1];
      this.priceHistory.push(previousBar.c);
      this.volumeHistory.push(previousBar.v || 1);

      // Keep only last 100 bars
      if (this.priceHistory.length > 100) {
        this.priceHistory.shift();
        this.volumeHistory.shift();
      }

      // Update opening range (uses current bar high/low - this is OK)
      const timestamp = new Date(bar.t);
      const hour = timestamp.getUTCHours() - 5; // ET
      const minute = timestamp.getUTCMinutes();
      const minutesSinceOpen = (hour - 9) * 60 + minute - 30;
      this.updateOpeningRange({ high: bar.h, low: bar.l }, minutesSinceOpen);

      // ✅ FIX: Calculate indicators using history (now includes bar N-1 close, NOT current bar)
      this.currentRSI = this.calculateRSI(this.priceHistory, this.rsiPeriod);
      this.currentVWAP = this.calculateVWAP(this.priceHistory, this.volumeHistory);

      // EXPANDED TIME FILTER: 9:30-11:30 AM ET
      // Allow hours 9 (after 9:30), 10 (full hour), 11 (before 11:30)
      if (hour < 9 || hour > 11) {
        return; // Outside trading window
      }
      
      // Minute-level filtering
      if (hour === 9 && minute < 30) {
        return; // Before 9:30 AM
      }
      
      if (hour === 11 && minute >= 30) {
        return; // After 11:30 AM
      }

      // Need minimum data
      if (this.priceHistory.length < Math.max(this.rsiPeriod + 1, this.vwapPeriod)) {
        return;
      }

      if (!this.currentVWAP) {
        return;
      }

      // ✅ FIX: Use current bar's OPEN price for entry simulation
      // In live trading: decision at bar N-1 close, execution at bar N open
      const currentPrice = bar.o;  // Changed from bar.c to bar.o
      const vwapDeviation = (currentPrice - this.currentVWAP) / this.currentVWAP;

      // SIGNAL 1: RSI Oversold + Price Below VWAP (BULLISH)
      const rsiOversoldSignal =
        this.currentRSI < this.rsiOversold &&
        vwapDeviation < -this.vwapThreshold;

      // SIGNAL 2: RSI Overbought + Price Above VWAP (BEARISH)
      const rsiOverboughtSignal =
        this.currentRSI > this.rsiOverbought &&
        vwapDeviation > this.vwapThreshold;

      // SIGNAL 3: Opening Range Breakout (DIRECTIONAL)
      let orbBullish = false;
      let orbBearish = false;

      if (this.openingRangeCalculated && this.openingRangeHigh && this.openingRangeLow) {
        orbBullish = currentPrice > this.openingRangeHigh && this.currentRSI < 75;
        orbBearish = currentPrice < this.openingRangeLow && this.currentRSI > 25;
      }

      // SIGNAL 4: VWAP-ONLY Signals (NEW - for days with neutral RSI)
      const strongVwapBullish = 
        vwapDeviation < -0.004 && // Strong deviation (0.4%)
        this.currentRSI > 40 && this.currentRSI < 60; // Neutral RSI range
      
      const strongVwapBearish = 
        vwapDeviation > 0.004 && // Strong deviation (0.4%)
        this.currentRSI > 40 && this.currentRSI < 60; // Neutral RSI range

      // SIGNAL 5: Momentum Signals (NEW - price momentum + RSI confirmation)
      const recentPrices = this.priceHistory.slice(-5); // Last 5 bars
      let priceVelocity = 0;
      if (recentPrices.length >= 2) {
        const priceChange = (recentPrices[recentPrices.length - 1] - recentPrices[0]) / recentPrices[0];
        priceVelocity = priceChange;
      }
      
      const momentumBullish = 
        priceVelocity > 0.002 && // 0.2% price increase
        this.currentRSI > 45 && this.currentRSI < 65 &&
        vwapDeviation > -0.001; // Not too far below VWAP
      
      const momentumBearish = 
        priceVelocity < -0.002 && // 0.2% price decrease  
        this.currentRSI > 35 && this.currentRSI < 55 &&
        vwapDeviation < 0.001; // Not too far above VWAP

      // Generate BULLISH signals (using current bar open price)
      if (rsiOversoldSignal || orbBullish || strongVwapBullish || momentumBullish) {
        let signalReason = 'UNKNOWN';
        if (rsiOversoldSignal) signalReason = 'RSI_OVERSOLD';
        else if (orbBullish) signalReason = 'ORB_BULLISH';
        else if (strongVwapBullish) signalReason = 'VWAP_BULLISH';
        else if (momentumBullish) signalReason = 'MOMENTUM_BULLISH';
        
        signals.push({
          timestamp: bar.t,
          signal_type: 'BUY_CALL',
          underlying_price: currentPrice,  // Entry at current bar open
          vwap: this.currentVWAP,
          rsi: this.currentRSI,
          vwapDeviation: vwapDeviation,
          signalReason: signalReason,
          option_type: 'CALL',
          target_delta: 0.45,
          hour: hour,
          minute: minute
        });
      }

      // Generate BEARISH signals
      if (rsiOverboughtSignal || orbBearish || strongVwapBearish || momentumBearish) {
        let signalReason = 'UNKNOWN';
        if (rsiOverboughtSignal) signalReason = 'RSI_OVERBOUGHT';
        else if (orbBearish) signalReason = 'ORB_BEARISH';
        else if (strongVwapBearish) signalReason = 'VWAP_BEARISH';
        else if (momentumBearish) signalReason = 'MOMENTUM_BEARISH';
        
        signals.push({
          timestamp: bar.t,
          signal_type: 'BUY_PUT',
          underlying_price: currentPrice,  // Entry at current bar open
          vwap: this.currentVWAP,
          rsi: this.currentRSI,
          vwapDeviation: vwapDeviation,
          signalReason: signalReason,
          option_type: 'PUT',
          target_delta: -0.45,
          hour: hour,
          minute: minute
        });
      }
    });

    console.log(`\n🌅 RSI-VWAP Morning Session [UNBIASED]: Generated ${signals.length} signals from ${underlyingBars.length} bars (10:00-11:30 AM only)`);
    return signals;
  }

  /**
   * Check if position should be exited
   */
  shouldExit(position, currentPrice, currentTime) {
    const entryTime = new Date(position.entry_timestamp);
    const current = new Date(currentTime);
    const holdingMinutes = (current - entryTime) / (1000 * 60);
    
    // Calculate P&L
    const currentValue = currentPrice * position.quantity * 100;
    const entryValue = position.entry_price * position.quantity * 100;
    const pnlPct = (currentValue - entryValue) / entryValue;
    
    // Exit reason priority:
    // 1. Profit target hit (12% for morning)
    if (pnlPct >= this.profitTarget) {
      console.log(`   💰 [MORNING EXIT] Profit target: ${(pnlPct * 100).toFixed(2)}% in ${holdingMinutes.toFixed(1)} min`);
      return { shouldExit: true, reason: 'PROFIT_TARGET', pnlPct: pnlPct };
    }
    
    // 2. Stop loss hit (18% for morning)
    if (pnlPct <= -this.stopLoss) {
      console.log(`   🛑 [MORNING EXIT] Stop loss: ${(pnlPct * 100).toFixed(2)}% in ${holdingMinutes.toFixed(1)} min`);
      return { shouldExit: true, reason: 'STOP_LOSS', pnlPct: pnlPct };
    }
    
    // 3. Max holding period (8 minutes for morning)
    if (holdingMinutes >= this.maxHoldingPeriod) {
      console.log(`   ⏱️  [MORNING EXIT] Max hold time: ${(pnlPct * 100).toFixed(2)}% in ${holdingMinutes.toFixed(1)} min`);
      return { shouldExit: true, reason: 'TIME_STOP', pnlPct: pnlPct };
    }
    
    // 4. End of morning session (11:30 AM ET)
    const currentET = current.getUTCHours() - 5;
    const minuteET = current.getUTCMinutes();
    
    if (currentET > 11 || (currentET === 11 && minuteET >= 30)) {
      console.log(`   🌅 [MORNING EXIT] Session end: ${(pnlPct * 100).toFixed(2)}% at ${currentET}:${minuteET.toString().padStart(2, '0')} ET`);
      return { shouldExit: true, reason: 'MORNING_SESSION_END', pnlPct: pnlPct };
    }
    
    // 5. 0DTE close at expiry (in case held until end of day)
    if (position.expiry_date) {
      const expiryDate = new Date(position.expiry_date);
      const today = new Date(currentTime);
      
      if (expiryDate.toDateString() === today.toDateString()) {
        if (currentET > 15 || (currentET === 15 && minuteET >= 50)) {
          console.log(`   🌅 [MORNING EXIT] 0DTE expiry: ${(pnlPct * 100).toFixed(2)}%`);
          return { shouldExit: true, reason: 'ZERO_DTE_TIME_STOP', pnlPct: pnlPct };
        }
      }
    }
    
    return { shouldExit: false, reason: null };
  }

  /**
   * Reset state for new trading day
   */
  resetDailyState() {
    this.openingRangeHigh = null;
    this.openingRangeLow = null;
    this.openingRangeCalculated = false;
    this.priceHistory = [];
    this.volumeHistory = [];
    this.currentVWAP = null;
    this.currentRSI = null;
    this.currentPositions = [];
    console.log('🔄 [MORNING] Daily state reset for new trading day');
  }

  /**
   * Check if can open new position
   */
  canOpenPosition() {
    return true; // Managed by maxPositions in backtest engine
  }

  /**
   * Get contract selection criteria
   */
  getContractCriteria(signal, mode = 'backtest') {
    return {
      optionType: signal.option_type,
      minDelta: this.minDelta,
      maxDelta: this.maxDelta,
      maxBidAskSpread: this.maxBidAskSpread,
      targetDelta: Math.abs(signal.target_delta || 0.45)
    };
  }

  /**
   * Get strategy parameters
   */
  getParameters() {
    return {
      rsiPeriod: this.rsiPeriod,
      rsiOversold: this.rsiOversold,
      rsiOverbought: this.rsiOverbought,
      vwapPeriod: this.vwapPeriod,
      vwapThreshold: this.vwapThreshold,
      profitTarget: this.profitTarget,
      stopLoss: this.stopLoss,
      maxHoldingPeriod: this.maxHoldingPeriod,
      maxPositions: this.maxPositions,
      minDelta: this.minDelta,
      maxDelta: this.maxDelta,
      maxBidAskSpread: this.maxBidAskSpread,
      tradingWindow: '10:00-11:30 AM ET'
    };
  }

  /**
   * Reset method for backtest engine
   */
  reset() {
    this.resetDailyState();
  }
}

module.exports = RSIVWAPMorningSessionStrategy;
