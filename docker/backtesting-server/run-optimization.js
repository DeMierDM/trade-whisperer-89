/**
 * HAVWAP Optimization Runner
 * 
 * Main script to run HAVWAP parameter optimization
 */

const HAVWAPParameterOptimizer = require('./optimization/havwap-parameter-optimizer');

async function main() {
  try {
    console.log('🎯 HAVWAP Strategy Parameter Optimization');
    console.log('=========================================');
    
    // Optimization configuration
    const config = {
      // Optimization type: 'grid' or 'random'
      optimizationType: 'grid',
      maxIterations: 50, // Start with 50 combinations for testing
      
      // Multi-week test period
      startDate: '2024-10-15', // Reduced period for initial testing
      endDate: '2024-10-25',
      
      // Liquid symbols
      symbols: ['SPY'], // Start with SPY only for speed
      
      // Backtest settings
      initialCapital: 10000,
      maxPositions: 1,
      contracts: 1,
      
      // Target metric
      primaryMetric: 'sharpe_ratio', // Focus on risk-adjusted returns
      
      // Risk constraints
      maxDrawdown: 0.15, // 15% max drawdown
      minTrades: 8 // Minimum trades for validity
    };
    
    console.log(`📊 Configuration:`);
    console.log(`   Type: ${config.optimizationType.toUpperCase()}`);
    console.log(`   Max Iterations: ${config.maxIterations}`);
    console.log(`   Period: ${config.startDate} to ${config.endDate}`);
    console.log(`   Symbols: ${config.symbols.join(', ')}`);
    console.log(`   Target: ${config.primaryMetric}`);
    
    // Create optimizer
    const optimizer = new HAVWAPParameterOptimizer(config);
    
    // Run optimization
    const results = await optimizer.runOptimization();
    
    console.log(`\n🎉 OPTIMIZATION SUMMARY:`);
    console.log(`   Best Score: ${results.best_score.toFixed(4)}`);
    console.log(`   Total Tests: ${results.all_results.length}`);
    
    // Show top 5 results
    const sortedResults = results.all_results
      .filter(r => r.score > -1000)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    
    console.log(`\n🏆 TOP 5 PARAMETER SETS:`);
    sortedResults.forEach((result, index) => {
      console.log(`\n   ${index + 1}. Score: ${result.score.toFixed(4)}`);
      console.log(`      Return: ${(result.metrics.total_return * 100).toFixed(2)}%`);
      console.log(`      Sharpe: ${result.metrics.sharpe_ratio.toFixed(3)}`);
      console.log(`      Trades: ${result.metrics.total_trades}`);
      console.log(`      d_entry: ${result.parameters.d_entry.toFixed(4)}`);
      console.log(`      d_near: ${result.parameters.d_near.toFixed(4)}`);
      console.log(`      PT/SL: ${(result.parameters.profitTargetReversion*100).toFixed(0)}%/${(result.parameters.stopLossReversion*100).toFixed(0)}%`);
    });
    
    return results;
    
  } catch (error) {
    console.error(`❌ Optimization failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error(`💥 Fatal error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { main };