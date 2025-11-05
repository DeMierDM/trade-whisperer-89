/**
 * HAVWAP Optuna Optimization Runner
 * 
 * Main script to execute Optuna hyperparameter optimization for HAVWAP strategy
 * Usage: node run-havwap-optimization.js [config-file]
 */

const fs = require('fs').promises;
const path = require('path');
const HAVWAPOptunaOptimizer = require('./optimization/havwap-optuna-optimizer');

async function main() {
  try {
    console.log('🎯 HAVWAP Strategy Optuna Optimization');
    console.log('=====================================');
    
    // Create optimization directory
    const optimizationDir = path.join(__dirname, 'optimization', 'results');
    try {
      await fs.mkdir(optimizationDir, { recursive: true });
    } catch (err) {
      // Directory might already exist
    }
    
    // Configuration for optimization
    const config = {
      // Optuna settings
      nTrials: 200, // Start with 200 trials for initial testing
      nJobs: 2, // Parallel jobs (adjust based on system capacity)
      studyName: `havwap-opt-${Date.now()}`,
      
      // Multi-week test period for robust results
      startDate: '2024-10-01', // Start of October
      endDate: '2024-10-25',   // End of test period (adjust as needed)
      
      // Liquid symbols for 0DTE options
      symbols: ['SPY', 'QQQ'], // Start with most liquid, add IWM later
      
      // Backtest configuration
      initialCapital: 10000,
      maxPositions: 1,
      contracts: 1,
      
      // Optimization targets
      primaryMetric: 'sharpe_ratio', // Primary: Sharpe ratio for risk-adjusted returns
      secondaryMetric: 'total_return', // Secondary: Absolute returns
      
      // Risk constraints
      maxDrawdown: 0.15, // 15% maximum acceptable drawdown
      minTrades: 15 // Minimum trades required for valid parameter set
    };
    
    console.log(`📊 Configuration:`);
    console.log(`   Trials: ${config.nTrials}`);
    console.log(`   Period: ${config.startDate} to ${config.endDate}`);
    console.log(`   Symbols: ${config.symbols.join(', ')}`);
    console.log(`   Target: ${config.primaryMetric}`);
    console.log(`   Max Drawdown: ${(config.maxDrawdown * 100).toFixed(1)}%`);
    console.log(`   Min Trades: ${config.minTrades}`);
    
    // Check if custom config file provided
    const configFile = process.argv[2];
    if (configFile) {
      try {
        const customConfig = JSON.parse(await fs.readFile(configFile, 'utf8'));
        Object.assign(config, customConfig);
        console.log(`   ✅ Loaded custom config from: ${configFile}`);
      } catch (error) {
        console.log(`   ⚠️  Could not load config file: ${error.message}`);
      }
    }
    
    // Create optimizer
    const optimizer = new HAVWAPOptunaOptimizer(config);
    
    // Start optimization
    console.log(`\n🚀 Starting optimization...`);
    const startTime = Date.now();
    
    const results = await optimizer.runOptimization();
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000 / 60; // minutes
    
    console.log(`\n✅ Optimization completed in ${duration.toFixed(1)} minutes`);
    console.log(`\n🏆 FINAL RESULTS:`);
    console.log(`   Best Score: ${results.best_score.toFixed(4)}`);
    console.log(`   Best Parameters:`);
    
    // Display best parameters in organized way
    const params = results.best_parameters;
    console.log(`\n   📏 Distance Thresholds:`);
    console.log(`      d_entry: ${params.d_entry.toFixed(4)} (${(params.d_entry * 100).toFixed(2)}%)`);
    console.log(`      d_near:  ${params.d_near.toFixed(4)} (${(params.d_near * 100).toFixed(2)}%)`);
    console.log(`      s_min:   ${params.s_min.toFixed(6)}`);
    
    console.log(`\n   🎛️  Risk Controls:`);
    console.log(`      rv_cap:     ${params.rv_cap.toFixed(4)} (${(params.rv_cap * 100).toFixed(1)} bps)`);
    console.log(`      iv_chg_cap: ${params.iv_chg_cap.toFixed(2)} sigma`);
    console.log(`      theta_imb:  ${params.theta_imb.toFixed(3)}`);
    
    console.log(`\n   🎯 Delta Targets:`);
    console.log(`      Reversion: ${params.deltaTargetReversion.toFixed(3)}`);
    console.log(`      Trend:     ${params.deltaTargetTrend.toFixed(3)}`);
    
    console.log(`\n   🚪 Exit Parameters - REVERSION:`);
    console.log(`      Profit Target: ${(params.profitTargetReversion * 100).toFixed(1)}%`);
    console.log(`      Stop Loss:     ${(params.stopLossReversion * 100).toFixed(1)}%`);
    console.log(`      Time Stop:     ${params.timeStopReversion}s (${(params.timeStopReversion/60).toFixed(1)}min)`);
    
    console.log(`\n   🚪 Exit Parameters - TREND:`);
    console.log(`      Profit Target: ${(params.profitTargetTrend * 100).toFixed(1)}%`);
    console.log(`      Stop Loss:     ${(params.stopLossTrend * 100).toFixed(1)}%`);
    console.log(`      Time Stop:     ${params.timeStopTrend}s (${(params.timeStopTrend/60).toFixed(1)}min)`);
    
    console.log(`\n   ⚙️  Option Selection:`);
    console.log(`      Max Spread:   ${params.maxSpreadPct}%`);
    console.log(`      Min Volume:   ${params.minVolume}`);
    console.log(`      Close Time:   ${params.zeroDTECloseTime}`);
    
    // Performance summary
    console.log(`\n📈 OPTIMIZATION INSIGHTS:`);
    console.log(`   Total Trials: ${results.study.trials.length}`);
    console.log(`   Best Trial: #${results.study.best_trial.number}`);
    
    // Find some statistics from all results
    const allScores = results.all_results.map(r => r.metrics.sharpe_ratio).filter(s => s > 0);
    if (allScores.length > 0) {
      const avgSharpe = allScores.reduce((a, b) => a + b, 0) / allScores.length;
      const maxSharpe = Math.max(...allScores);
      console.log(`   Avg Sharpe: ${avgSharpe.toFixed(3)}`);
      console.log(`   Max Sharpe: ${maxSharpe.toFixed(3)}`);
      console.log(`   Improvement: ${((maxSharpe - avgSharpe) / avgSharpe * 100).toFixed(1)}%`);
    }
    
    console.log(`\n✅ Optimized strategy saved as 'havwap-optimized.js'`);
    console.log(`💾 Full results saved in optimization/results/`);
    
    return results;
    
  } catch (error) {
    console.error(`❌ Optimization failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⏹️  Optimization interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⏹️  Optimization terminated');
  process.exit(0);
});

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error(`💥 Fatal error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { main };