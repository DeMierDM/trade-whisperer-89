/**
 * DYNAMIC TRAILING STOP ROLLOUT TEMPLATE
 * 
 * Use this template to quickly add dynamic trailing stops to all your strategies.
 * Just copy these snippets into each strategy file:
 */

// ===== STEP 1: Add import at the top of the file =====
const DynamicTrailingStop = require('../utils/dynamic-trailing-stop');

// ===== STEP 2: Add to constructor (replace existing profitTarget) =====
class YourStrategy {
  constructor(parameters = {}) {
    // ... existing constructor code ...
    
    // REPLACE OLD: this.profitTarget = 0.12;
    // WITH NEW: Dynamic trailing system
    this.trailingStop = new DynamicTrailingStop({
      initialTP: 0.03,  // 3% initial take profit
      trailingTiers: [
        { minProfit: 0.03, trailDistance: 0.03 },   // 3%+ profit: trail by 3%
        { minProfit: 0.10, trailDistance: 0.05 },   // 10%+ profit: trail by 5%
        { minProfit: 0.20, trailDistance: 0.07 },   // 20%+ profit: trail by 7%
        { minProfit: 0.35, trailDistance: 0.10 }    // 35%+ profit: trail by 10%
      ]
    });
    
    // Adjust existing parameters
    this.stopLoss = parameters.stopLoss || 0.15; // Wider hard stop (was 0.10)
    this.maxHoldingPeriod = parameters.maxHoldingPeriod || 15; // Extended time (was 10)
  }
}

// ===== STEP 3: Replace shouldExit method =====
shouldExit(position, currentPrice, currentTime) {
  const entryTime = new Date(position.entry_timestamp);
  const current = new Date(currentTime);
  const holdingMinutes = (current - entryTime) / (1000 * 60);
  
  // Calculate P&L
  const currentValue = currentPrice * position.quantity * 100;
  const entryValue = position.entry_price * position.quantity * 100;
  const pnlPct = (currentValue - entryValue) / entryValue;
  
  // PRIORITY 1: Dynamic Trailing Stop System
  const trailingResult = this.trailingStop.checkExit(position, pnlPct);
  if (trailingResult.shouldExit) {
    console.log(`   🎯 [DYNAMIC EXIT] ${trailingResult.reason}: ${trailingResult.details}`);
    return { 
      shouldExit: true, 
      reason: trailingResult.reason, 
      pnlPct: pnlPct,
      trailingData: trailingResult
    };
  }
  
  // PRIORITY 2: Hard stop loss (wider since trailing handles most exits)
  if (pnlPct <= -this.stopLoss) {
    this.trailingStop.cleanupPosition(position.instance_id || position.id);
    return { shouldExit: true, reason: 'HARD_STOP_LOSS', pnlPct: pnlPct };
  }
  
  // PRIORITY 3: Time stop (extended for trailing system)
  if (holdingMinutes >= this.maxHoldingPeriod) {
    this.trailingStop.cleanupPosition(position.instance_id || position.id);
    return { shouldExit: true, reason: 'TIME_STOP', pnlPct: pnlPct };
  }
  
  // Add any existing strategy-specific exits here (0DTE close, session end, etc.)
  // Remember to call this.trailingStop.cleanupPosition() before returning!
  
  return { shouldExit: false };
}

/*
QUICK ROLLOUT CHECKLIST:
□ Add import: const DynamicTrailingStop = require('../utils/dynamic-trailing-stop');
□ Replace profitTarget with trailingStop in constructor
□ Widen stopLoss from 0.10 to 0.15
□ Extend maxHoldingPeriod from 10 to 15 minutes
□ Replace entire shouldExit method with template above
□ Add cleanupPosition() calls to any strategy-specific exits
□ Test with backtest to verify dynamic exits are working

EXPECTED RESULTS:
- 40-60% of exits should be "DYNAMIC_TRAILING_STOP"
- Hard stops should be 20-30% (catching big losers)
- Time stops should be 10-20% (max hold time)
- Overall profitability should improve due to better exit management

FILES TO UPDATE:
□ rsi-vwap-fusion.js
□ rsi-vwap-adaptive-tod.js  
□ havwap-options.js
□ havwap-proper.js
□ small-account-rsi-vwap.js
□ small-account-momentum.js
□ small-account-iv-mean-reversion.js
□ (Any other active strategies)
*/