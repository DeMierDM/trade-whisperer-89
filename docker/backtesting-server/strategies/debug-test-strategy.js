/**
 * DEBUG STRATEGY for testing the automatic strategy registry and signal generation
 * 
 * This strategy is designed to:
 * 1. Generate signals on every bar to test the system
 * 2. Log detailed information about the data it receives
 * 3. Help debug why other strategies might not be generating signals
 * 4. Test dynamic trailing take profit system
 */

const DynamicTrailingStop = require('../utils/dynamic-trailing-stop');

class DebugTestStrategy {
  constructor(parameters = {}) {
    this.name = 'Debug Test Strategy';
    this.maxRiskPerTrade = 0.02; // 2% per trade
    this.signalCount = 0;
    this.barCount = 0;
    
    // Required strategy properties
    this.preferredDTE = 0; // 0DTE strategy
    this.maxPositions = 10; // Allow up to 10 positions
    this.contractsPerTrade = 1; // 1 contract per trade
    this.currentPositions = []; // Track current positions
    
    // Initialize dynamic trailing stop system
    this.trailingStop = new DynamicTrailingStop({
      initialTP: 0.03,  // 3% initial take profit
      trailingTiers: [
        { minProfit: 0.03, trailDistance: 0.03 },   // 3%+ profit: trail by 3%
        { minProfit: 0.10, trailDistance: 0.05 },   // 10%+ profit: trail by 5%
        { minProfit: 0.20, trailDistance: 0.07 },   // 20%+ profit: trail by 7%
        { minProfit: 0.35, trailDistance: 0.10 }    // 35%+ profit: trail by 10%
      ]
    });
    
    console.log(`🐛 [DEBUG STRATEGY] Initialized with parameters:`, parameters);
    console.log(`🎯 [DEBUG STRATEGY] Dynamic trailing stop config:`, this.trailingStop.getConfig());
  }

  /**
   * Generate test signals on every other bar
   */
  generateSignals(underlyingBars) {
    console.log(`🐛 [DEBUG STRATEGY] generateSignals called with ${underlyingBars?.length || 0} bars`);
    
    if (!underlyingBars || underlyingBars.length === 0) {
      console.log(`🐛 [DEBUG STRATEGY] No underlying bars provided!`);
      return [];
    }

    const signals = [];
    
    underlyingBars.forEach((bar, index) => {
      this.barCount++;
      
      // Log first few bars to see data structure
      if (index < 3) {
        console.log(`🐛 [DEBUG STRATEGY] Bar ${index}:`, {
          timestamp: bar.t,
          open: bar.o,
          high: bar.h,
          low: bar.l,
          close: bar.c,
          volume: bar.v
        });
      }
      
      // Generate a signal every 5 bars
      if (index > 0 && index % 5 === 0) {
        const price = parseFloat(bar.c || bar.close);
        const signalType = index % 10 === 0 ? 'BUY_CALL' : 'BUY_PUT';
        
        signals.push({
          timestamp: bar.t,
          signal_type: signalType,
          underlying_price: price,
          signal_strength: 1.5,
          position_size: 100,
          signal_reason: 'DEBUG_TEST_SIGNAL',
          target_delta: signalType === 'BUY_CALL' ? 0.50 : -0.50,
          option_type: signalType === 'BUY_CALL' ? 'call' : 'put'
        });
        
        this.signalCount++;
        console.log(`🐛 [DEBUG STRATEGY] Generated signal ${this.signalCount}: ${signalType} at $${price.toFixed(2)}`);
      }
    });
    
    console.log(`🐛 [DEBUG STRATEGY] Processed ${this.barCount} total bars, generated ${signals.length} signals`);
    return signals;
  }

  /**
   * Advanced exit logic with dynamic trailing take profit
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
    
    // PRIORITY 1: Check dynamic trailing stop
    const trailingResult = this.trailingStop.checkExit(position, pnlPercent);
    if (trailingResult.shouldExit) {
      console.log(`   🎯 [DYNAMIC EXIT] ${trailingResult.reason}: ${trailingResult.details}`);
      return { 
        shouldExit: true, 
        reason: trailingResult.reason, 
        pnl, 
        pnlPercent,
        trailingData: trailingResult
      };
    }
    
    // PRIORITY 2: Hard stop loss (overrides trailing if deeper loss)
    if (pnlPercent <= -0.15) { // 15% hard stop (wider than before since trailing handles most exits)
      this.trailingStop.cleanupPosition(position.instance_id || position.id);
      return { shouldExit: true, reason: 'HARD_STOP_LOSS', pnl, pnlPercent };
    }
    
    // PRIORITY 3: Time stop (max 15 minutes - extended since trailing may hold winners longer)
    if (timeHeld >= 15) {
      this.trailingStop.cleanupPosition(position.instance_id || position.id);
      return { shouldExit: true, reason: 'TIME_STOP', pnl, pnlPercent };
    }
    
    // Log trailing status for monitoring
    if (trailingResult.isTrailing && Math.random() < 0.05) { // 5% sample rate
      console.log(`   📊 [TRAILING STATUS] Peak: ${(trailingResult.peakProfit * 100).toFixed(1)}%, Current: ${(pnlPercent * 100).toFixed(1)}%, Stop: ${(trailingResult.trailingStop * 100).toFixed(1)}%`);
    }
    
    return { shouldExit: false };
  }

  /**
   * Check if new position can be opened
   */
  canOpenPosition() {
    return true; // Always allow positions for testing
  }

  /**
   * Get contract criteria for testing
   */
  getContractCriteria(signal) {
    return {
      optionType: signal.option_type,
      minDelta: 0.15, // 0DTE optimized: allow more OTM options
      maxDelta: 0.65, // 0DTE optimized: align with ATM delta range
      maxBidAskSpread: 0.15,
      minVolume: 5,
      targetDelta: Math.abs(signal.target_delta || 0.50),
      maxPositionValue: signal.position_size
    };
  }

  /**
   * Get strategy parameters
   */
  getParameters() {
    return {
      strategy: 'debug-test',
      maxRiskPerTrade: this.maxRiskPerTrade,
      signalCount: this.signalCount,
      barCount: this.barCount
    };
  }

  /**
   * Reset for new trading day
   */
  reset() {
    this.signalCount = 0;
    this.barCount = 0;
    console.log(`🐛 [DEBUG STRATEGY] Reset for new trading day`);
  }
}

module.exports = DebugTestStrategy;