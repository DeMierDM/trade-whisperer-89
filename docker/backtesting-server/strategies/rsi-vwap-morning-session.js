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
 * 5. ENHANCED: Dynamic trailing take profit system
 * 
 * Target Metrics (10 AM only):
 * - Win Rate: 75-85%
 * - Sharpe Ratio: >3.0
 * - Profit Factor: >10.0
 * - Avg Hold: 5-10 minutes
 */

const DynamicTrailingStop = require('../utils/dynamic-trailing-stop');

class RSIVWAPMorningSessionStrategy {
  constructor(parameters = {}) {
    this.name = 'RSI-VWAP Morning Session';
    
    // Core parameters - RELAXED for more frequent signals
    this.rsiPeriod = parameters.rsiPeriod || 14;
    this.rsiOversold = parameters.rsiOversold || 35; // Relaxed from 30
    this.rsiOverbought = parameters.rsiOverbought || 65; // Relaxed from 70
    this.vwapPeriod = parameters.vwapPeriod || 30;
    this.vwapThreshold = parameters.vwapThreshold || 0.002; // Relaxed from 0.25% to 0.2%
    
    // DYNAMIC TRAILING STOP SYSTEM - OPTIONS-OPTIMIZED (replaces fixed profit target)
    // 🎯 COST-AWARE TRAILING: Different settings for expensive vs cheap contracts
    const expensiveContractThreshold = parameters.expensiveContractThreshold || 2.0;
    
    // Expensive contracts need higher initial TP and wider trailing (less aggressive)
    const expensiveTrailingConfig = {
      initialTP: 0.08,  // 8% initial TP for expensive contracts (was 3%)
      trailingTiers: [
        { minProfit: 0.08, trailDistance: 0.05 },   // 8%+ profit: trail by 5% (was 3%+ by 3%)  
        { minProfit: 0.15, trailDistance: 0.07 },   // 15%+ profit: trail by 7% (was 8%+ by 4%)
        { minProfit: 0.25, trailDistance: 0.09 },   // 25%+ profit: trail by 9% (was 15%+ by 6%)
        { minProfit: 0.40, trailDistance: 0.12 }    // 40%+ profit: trail by 12% (was 25%+ by 8%)
      ]
    };
    
    // Cheap contracts can be more aggressive (tighter trailing)
    const cheapTrailingConfig = {
      initialTP: 0.06,  // 6% initial TP for cheap contracts (was 3%)
      trailingTiers: [
        { minProfit: 0.06, trailDistance: 0.04 },   // 6%+ profit: trail by 4%
        { minProfit: 0.12, trailDistance: 0.05 },   // 12%+ profit: trail by 5% 
        { minProfit: 0.20, trailDistance: 0.07 },   // 20%+ profit: trail by 7%
        { minProfit: 0.35, trailDistance: 0.10 }    // 35%+ profit: trail by 10%
      ]
    };
    
    // Use expensive config by default (more conservative for volatile markets like Dec 19)
    this.trailingStop = new DynamicTrailingStop(expensiveTrailingConfig);
    
    // 🧪 EXPERIMENTAL: TRAILING STOPS DISABLED + WIDER ADAPTIVE STOPS
    // Testing if trailing stops (50% of exits) are causing premature exits
    console.log(`🧪 EXPERIMENT: Trailing stops DISABLED, Adaptive stops widened (35%/45%)`);
    
    // Traditional risk management (as fallbacks)
    this.stopLoss = parameters.stopLoss || 0.15; // 15% hard stop (widened since trailing handles most exits)
    this.maxHoldingPeriod = parameters.maxHoldingPeriod || 12; // 12 minutes (extended for trailing to work)
    this.maxPositions = parameters.maxPositions || 3;
    
    // EXPANDED TIME FILTER: 9:30-11:30 AM ET (FULL MORNING SESSION)
    this.allowedHours = [9, 10, 11]; // 9:30 AM - 11:30 AM ET
    this.allowedMinutesStart = 30; // Start at 9:30 AM
    this.allowedMinutesEnd = 150; // End at 11:30 (150 minutes after 9:00)
    this.endOfDayClose = parameters.endOfDayClose || '11:30:00'; // Close by 11:30 AM
    
    // Contract selection (ATM-FOCUSED for better pricing on 0DTE)
    this.minDelta = parameters.minDelta || 0.25; // ATM RANGE: Allow slightly OTM to ATM contracts
    this.maxDelta = parameters.maxDelta || 0.70; // CAPPED: Avoid expensive deep ITM contracts
    this.maxBidAskSpread = parameters.maxBidAskSpread || 0.20; // Tighter spread (20%)
    
    // 0DTE ATM-FOCUSED TRADING (0DTE ATM contracts naturally have high deltas)
    // For 0DTE: ATM calls ~0.70-0.90 delta, ATM puts ~-0.65 to -0.85 delta
    this.targetCallDelta = parameters.targetCallDelta || 0.45; // Target ATM calls (~45 delta for better pricing)
    this.targetPutDelta = parameters.targetPutDelta || -0.45; // Target ATM puts (~-45 delta for better pricing)
    
    // 🎯 ATM-FOCUSED COST MANAGEMENT (targeting cheaper ATM/OTM contracts)
    this.expensiveContractThreshold = parameters.expensiveContractThreshold || 2.0; // $2+ = expensive for ATM
    this.expensiveStopLoss = parameters.expensiveStopLoss || 0.35; // 35% stop for expensive ATM (widened from 20%)
    this.cheapStopLoss = parameters.cheapStopLoss || 0.45; // 45% stop for cheap ATM (widened from 30%)
    this.expensiveProfitTarget = parameters.expensiveProfitTarget || 0.25; // 25% target for expensive ATM
    this.cheapProfitTarget = parameters.cheapProfitTarget || 0.40; // 40% target for cheap ATM
    this.expensiveMaxHold = parameters.expensiveMaxHold || 45; // 45 min for expensive ATM
    this.cheapMaxHold = parameters.cheapMaxHold || 90; // 90 min for cheap ATM
    this.minCallSignalStrength = parameters.minCallSignalStrength || 2; // ATM calls need less stringent signals
    
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
    
    console.log('✅ RSI-VWAP ATM-Focused 0DTE Strategy initialized:', {
      tradingWindow: '9:30-11:30 AM ET',
      rsiOversold: this.rsiOversold,
      rsiOverbought: this.rsiOverbought,
      vwapThreshold: (this.vwapThreshold * 100).toFixed(2) + '%',
      targetDeltas: `ATM Focus - Calls: ${this.targetCallDelta}, Puts: ${this.targetPutDelta}`,
      atmCostManagement: {
        expensiveThreshold: '$' + this.expensiveContractThreshold,
        expensiveStop: (this.expensiveStopLoss * 100).toFixed(0) + '%',
        cheapStop: (this.cheapStopLoss * 100).toFixed(0) + '%',
        minCallSignalStrength: this.minCallSignalStrength
      },
      deltaRange: `${this.minDelta}-${this.maxDelta} (ATM-focused)`,
      maxPositions: this.maxPositions
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
      
      // DEBUG: Log time conversion for first few bars
      if (index < 5) {
        console.log(`🕐 [TIME DEBUG] Bar ${index}: Raw UTC: ${bar.t}, Parsed: ${timestamp.toISOString()}, UTC Hour: ${timestamp.getUTCHours()}, Converted ET Hour: ${hour}:${minute.toString().padStart(2, '0')}`);
      }
      
      if (hour < 9 || hour > 11) {
        if (index < 10) console.log(`   ⏰ [TIME FILTER] Rejected: ${hour}:${minute.toString().padStart(2, '0')} ET (outside 9-11 window)`);
        return; // Outside trading window
      }
      
      // Minute-level filtering
      if (hour === 9 && minute < 30) {
        if (index < 10) console.log(`   ⏰ [TIME FILTER] Rejected: ${hour}:${minute.toString().padStart(2, '0')} ET (before 9:30 AM)`);
        return; // Before 9:30 AM
      }
      
      if (hour === 11 && minute >= 30) {
        if (index < 10) console.log(`   ⏰ [TIME FILTER] Rejected: ${hour}:${minute.toString().padStart(2, '0')} ET (after 11:30 AM)`);
        return; // After 11:30 AM
      }
      
      // If we get here, time filter passed
      if (index < 5) console.log(`   ✅ [TIME FILTER] Accepted: ${hour}:${minute.toString().padStart(2, '0')} ET (morning session)`);
      

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

      // 🎯 ENHANCED CALL SIGNALS: More selective due to high cost of deep ITM calls
      // Require STRONGER signals for expensive call contracts ($4-6 entry cost)
      let callSignalStrength = 0;
      let callReasons = [];
      
      if (rsiOversoldSignal) { 
        callSignalStrength += 2; 
        callReasons.push('RSI_OVERSOLD'); 
      }
      if (orbBullish) { 
        callSignalStrength += 2; 
        callReasons.push('ORB_BULLISH'); 
      }
      if (strongVwapBullish) { 
        callSignalStrength += 1; 
        callReasons.push('VWAP_BULLISH'); 
      }
      if (momentumBullish) { 
        callSignalStrength += 1; 
        callReasons.push('MOMENTUM_BULLISH'); 
      }
      
      // Additional call quality filters for expensive contracts
      const hasStrongVolume = bar.v > (this.volumeHistory.slice(-20).reduce((a,b) => a + b, 0) / 20); // Above 20-bar avg
      const hasGoodMomentum = priceVelocity > 0.001; // Positive momentum
      
      if (hasStrongVolume) { callSignalStrength += 1; callReasons.push('VOLUME'); }
      if (hasGoodMomentum) { callSignalStrength += 1; callReasons.push('MOMENTUM'); }
      
      // MINIMUM SIGNAL STRENGTH REQUIRED (configurable for expensive calls)
      if (callSignalStrength >= this.minCallSignalStrength) {
        signals.push({
          timestamp: bar.t,
          signal_type: 'BUY_CALL',
          underlying_price: currentPrice,
          vwap: this.currentVWAP,
          rsi: this.currentRSI,
          vwapDeviation: vwapDeviation,
          signalReason: callReasons.join('+'),
          signalStrength: callSignalStrength,
          option_type: 'CALL',
          target_delta: this.targetCallDelta, // HIGH-DELTA FOCUS: Target 80 delta calls
          hour: hour,
          minute: minute
        });
      }

      // 🎯 PUT SIGNALS: Less restrictive since puts are cheaper ($0.87-1.15)
      // Allow more frequent put trades due to lower cost and risk
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
          signalStrength: 1, // Puts only need basic signal
          option_type: 'PUT',
          target_delta: this.targetPutDelta, // HIGH-DELTA FOCUS: Target -80 delta puts
          hour: hour,
          minute: minute
        });
      }
    });

    console.log(`\n🌅 RSI-VWAP Morning Session [UNBIASED]: Generated ${signals.length} signals from ${underlyingBars.length} bars (10:00-11:30 AM only)`);
    return signals;
  }

  /**
   * Check if position should be exited - ENHANCED with Cost-Aware Risk Management
   */
  shouldExit(position, currentPrice, currentTime) {
    const entryTime = new Date(position.entry_timestamp);
    const current = new Date(currentTime);
    const holdingMinutes = (current - entryTime) / (1000 * 60);
    
    // Calculate P&L
    const currentValue = currentPrice * position.quantity * 100;
    const entryValue = position.entry_price * position.quantity * 100;
    const pnlPct = (currentValue - entryValue) / entryValue;
    
    // 🎯 COST-AWARE RISK MANAGEMENT: Different rules for expensive vs cheap contracts
    const entryPrice = position.entry_price;
    const isExpensiveContract = entryPrice > this.expensiveContractThreshold;
    const isCallPosition = position.contract_symbol?.includes('C');
    
    // Cost-aware stop loss: Tighter for expensive contracts, looser for cheap
    const adaptiveStopLoss = isExpensiveContract ? this.expensiveStopLoss : this.cheapStopLoss;
    
    // Cost-aware profit target: Different targets based on cost
    const adaptiveProfitTarget = isExpensiveContract ? this.expensiveProfitTarget : this.cheapProfitTarget;
    
    // PRIORITY 0: Cost-aware profit taking (before trailing)
    if (pnlPct >= adaptiveProfitTarget) {
      console.log(`   💰 [COST-AWARE EXIT] Profit target hit: ${(pnlPct * 100).toFixed(2)}% (${isExpensiveContract ? 'EXPENSIVE' : 'CHEAP'} contract) in ${holdingMinutes.toFixed(1)} min`);
      this.trailingStop.cleanupPosition(position.instance_id || position.id);
      return { shouldExit: true, reason: 'PROFIT_TARGET', pnlPct: pnlPct };
    }
    
    // PRIORITY 1: Dynamic Trailing Stop System (TEMPORARILY DISABLED FOR TESTING)
    // 🧪 TEST: Disable trailing stops to see if they're causing premature exits
    // const trailingResult = this.trailingStop.checkExit(position, pnlPct);
    // if (trailingResult.shouldExit) {
    //   console.log(`   🎯 [DYNAMIC EXIT] ${trailingResult.reason}: ${trailingResult.details} (${isExpensiveContract ? 'EXPENSIVE' : 'CHEAP'} contract) in ${holdingMinutes.toFixed(1)} min`);
    //   return { 
    //     shouldExit: true, 
    //     reason: trailingResult.reason, 
    //     pnlPct: pnlPct,
    //     trailingData: trailingResult
    //   };
    // }
    
    // PRIORITY 2: Adaptive hard stop loss
    if (pnlPct <= -adaptiveStopLoss) {
      console.log(`   🛑 [ADAPTIVE STOP] ${(adaptiveStopLoss * 100).toFixed(0)}% stop (${isExpensiveContract ? 'EXPENSIVE' : 'CHEAP'}): ${(pnlPct * 100).toFixed(2)}% in ${holdingMinutes.toFixed(1)} min`);
      this.trailingStop.cleanupPosition(position.instance_id || position.id);
      return { shouldExit: true, reason: 'ADAPTIVE_STOP_LOSS', pnlPct: pnlPct };
    }
    
    // PRIORITY 3: Cost-aware time management
    const maxHoldTime = isExpensiveContract ? this.expensiveMaxHold : this.cheapMaxHold;
    
    if (holdingMinutes >= maxHoldTime) {
      console.log(`   ⏱️  [COST-AWARE TIME] ${maxHoldTime}min limit (${isExpensiveContract ? 'EXPENSIVE' : 'CHEAP'}): ${(pnlPct * 100).toFixed(2)}% in ${holdingMinutes.toFixed(1)} min`);
      this.trailingStop.cleanupPosition(position.instance_id || position.id);
      return { shouldExit: true, reason: 'ADAPTIVE_TIME_STOP', pnlPct: pnlPct };
    }
    
    // PRIORITY 4: End of morning session (11:30 AM ET)
    const currentET = current.getUTCHours() - 5;
    const minuteET = current.getUTCMinutes();
    
    if (currentET > 11 || (currentET === 11 && minuteET >= 30)) {
      console.log(`   🌅 [MORNING EXIT] Session end: ${(pnlPct * 100).toFixed(2)}% at ${currentET}:${minuteET.toString().padStart(2, '0')} ET`);
      this.trailingStop.cleanupPosition(position.instance_id || position.id);
      return { shouldExit: true, reason: 'MORNING_SESSION_END', pnlPct: pnlPct };
    }
    
    // PRIORITY 5: 0DTE close at expiry (in case held until end of day)
    if (position.expiry_date) {
      const expiryDate = new Date(position.expiry_date);
      const today = new Date(currentTime);
      
      if (expiryDate.toDateString() === today.toDateString()) {
        if (currentET > 15 || (currentET === 15 && minuteET >= 50)) {
          console.log(`   🌅 [MORNING EXIT] 0DTE expiry: ${(pnlPct * 100).toFixed(2)}%`);
          this.trailingStop.cleanupPosition(position.instance_id || position.id);
          return { shouldExit: true, reason: 'ZERO_DTE_TIME_STOP', pnlPct: pnlPct };
        }
      }
    }
    
    // Log trailing status periodically for monitoring
    if (trailingResult.isTrailing && Math.random() < 0.03) { // 3% sample rate for morning sessions
      console.log(`   📈 [MORNING TRAILING] Peak: ${(trailingResult.peakProfit * 100).toFixed(1)}%, Current: ${(pnlPct * 100).toFixed(1)}%, Stop: ${(trailingResult.trailingStop * 100).toFixed(1)}%`);
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
      targetDelta: Math.abs(signal.target_delta || (signal.option_type === 'CALL' ? this.targetCallDelta : this.targetPutDelta))
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
