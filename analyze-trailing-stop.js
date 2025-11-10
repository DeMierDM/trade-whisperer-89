#!/usr/bin/env node

// Analyze the trailing stop system to identify if it's too aggressive

console.log('🎯 ANALYZING DYNAMIC TRAILING STOP SYSTEM\n');

// Simulate the trailing stop configuration from the strategy
const trailingConfig = {
  initialTP: 0.03,  // 3% initial take profit
  trailingTiers: [
    { minProfit: 0.03, trailDistance: 0.03 },   // 3%+ profit: trail by 3%
    { minProfit: 0.08, trailDistance: 0.04 },   // 8%+ profit: trail by 4%
    { minProfit: 0.15, trailDistance: 0.06 },   // 15%+ profit: trail by 6%
    { minProfit: 0.25, trailDistance: 0.08 }    // 25%+ profit: trail by 8%
  ]
};

console.log('📊 CURRENT TRAILING STOP CONFIGURATION:');
console.log(`Initial Take Profit: ${(trailingConfig.initialTP * 100).toFixed(1)}%`);
console.log('Trailing Tiers:');
trailingConfig.trailingTiers.forEach((tier, i) => {
  console.log(`  ${i+1}. ${(tier.minProfit * 100).toFixed(0)}%+ profit → Trail by ${(tier.trailDistance * 100).toFixed(0)}%`);
});
console.log('');

// Simulate different profit scenarios
function simulateTrailing(profitSequence, description) {
  console.log(`🎭 SCENARIO: ${description}`);
  console.log(`Profit sequence: ${profitSequence.map(p => (p*100).toFixed(1) + '%').join(' → ')}`);
  
  let peakProfit = 0;
  let trailingStop = null;
  let isTrailing = false;
  let exitPoint = null;
  
  for (let i = 0; i < profitSequence.length; i++) {
    const currentProfit = profitSequence[i];
    
    // Update peak profit
    if (currentProfit > peakProfit) {
      peakProfit = currentProfit;
    }
    
    // Check if we should start trailing
    if (!isTrailing && currentProfit >= trailingConfig.initialTP) {
      isTrailing = true;
      console.log(`  Step ${i+1}: Hit ${(trailingConfig.initialTP * 100).toFixed(1)}% initial TP - Starting trailing mode`);
    }
    
    // Calculate trailing stop if we're trailing
    if (isTrailing) {
      // Find appropriate tier
      let newTrailingStop = null;
      for (const tier of trailingConfig.trailingTiers.sort((a, b) => b.minProfit - a.minProfit)) {
        if (peakProfit >= tier.minProfit) {
          newTrailingStop = peakProfit - tier.trailDistance;
          break;
        }
      }
      
      // Only update if it moves up
      if (newTrailingStop > (trailingStop || 0)) {
        trailingStop = newTrailingStop;
      }
      
      // Check if we should exit
      if (currentProfit <= trailingStop) {
        exitPoint = i + 1;
        console.log(`  Step ${i+1}: 🛑 TRAILING STOP HIT! Peak: ${(peakProfit*100).toFixed(1)}%, Current: ${(currentProfit*100).toFixed(1)}%, Stop: ${(trailingStop*100).toFixed(1)}%`);
        break;
      } else {
        console.log(`  Step ${i+1}: Peak: ${(peakProfit*100).toFixed(1)}%, Current: ${(currentProfit*100).toFixed(1)}%, Stop: ${(trailingStop*100).toFixed(1)}%`);
      }
    } else {
      console.log(`  Step ${i+1}: Current: ${(currentProfit*100).toFixed(1)}% (Not trailing yet)`);
    }
  }
  
  if (!exitPoint) {
    console.log(`  Result: Position still open, final profit: ${(profitSequence[profitSequence.length-1]*100).toFixed(1)}%`);
  } else {
    const finalProfit = profitSequence[exitPoint - 1];
    console.log(`  Result: Exited at step ${exitPoint} with ${(finalProfit*100).toFixed(1)}% profit`);
  }
  console.log('');
}

console.log('='.repeat(80));
console.log('TESTING DIFFERENT PROFIT PATTERNS');
console.log('='.repeat(80));

// Scenario 1: Quick profit then reversal (typical options scenario)
simulateTrailing([0.01, 0.035, 0.055, 0.04, 0.025], 
  'Quick profit then reversal (options volatility)');

// Scenario 2: Gradual climb then sharp drop
simulateTrailing([0.01, 0.02, 0.035, 0.05, 0.065, 0.045, 0.02], 
  'Gradual climb then sharp drop');

// Scenario 3: Volatile but trending up
simulateTrailing([0.01, 0.025, 0.045, 0.035, 0.055, 0.08, 0.07, 0.09], 
  'Volatile but trending upward');

// Scenario 4: High volatility - mimics December 19 conditions
simulateTrailing([0.02, 0.045, 0.025, 0.06, 0.035, 0.02, 0.01], 
  'High volatility market (Dec 19 style)');

console.log('='.repeat(80));
console.log('ANALYSIS & RECOMMENDATIONS');
console.log('='.repeat(80));

console.log('🔍 POTENTIAL ISSUES IDENTIFIED:');
console.log('');
console.log('1. 🎯 INITIAL TAKE PROFIT TOO LOW (3%)');
console.log('   - Options often move 3-5% just from normal volatility');
console.log('   - Dec 19 was a high volatility day ($6 SPY drop)');
console.log('   - 3% TP triggers trailing too early in volatile conditions');
console.log('');

console.log('2. 🔄 TRAILING DISTANCE TOO TIGHT (3%)');
console.log('   - 3% trailing distance too small for options');
console.log('   - Options can swing 5-10% intraday easily');  
console.log('   - Tight trailing gets stopped out by normal noise');
console.log('');

console.log('3. ⚡ COMBINATION EFFECT');
console.log('   - Low initial TP + tight trailing = quick exits');
console.log('   - Explains 11.7 minute average holding time');
console.log('   - Explains 44.4% trailing stop exits');
console.log('');

console.log('💡 SUGGESTED FIXES:');
console.log('');
console.log('A. 📈 INCREASE INITIAL TAKE PROFIT:');
console.log('   - Change from 3% → 8% for expensive contracts');
console.log('   - Change from 3% → 6% for cheap contracts');
console.log('   - Let positions develop before trailing');
console.log('');

console.log('B. 🎯 WIDEN TRAILING DISTANCES:');
console.log('   - 8%+ profit: trail by 5% (not 3%)');
console.log('   - 15%+ profit: trail by 7% (not 4%)');
console.log('   - Account for options volatility');
console.log('');

console.log('C. 💰 COST-AWARE TRAILING:');
console.log('   - Expensive contracts: Higher initial TP, wider trailing');
console.log('   - Cheap contracts: Lower initial TP, tighter trailing');
console.log('   - Match trailing aggressiveness to contract cost');
console.log('');

console.log('D. 🌪️  VOLATILITY ADJUSTMENT:');
console.log('   - Detect high volatility days (like Dec 19)');
console.log('   - Automatically widen trailing stops in volatile conditions');
console.log('   - Use ATR or VIX-based adjustments');
console.log('');

console.log('🎯 IMMEDIATE ACTION:');
console.log('Test with modified config:');
console.log('- initialTP: 0.08 (8% vs current 3%)');
console.log('- First tier: 8%+ profit, trail by 5% (vs current 3%+ trail by 3%)');
console.log('- This should reduce premature exits and improve performance');