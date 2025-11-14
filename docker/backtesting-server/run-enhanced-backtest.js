/**
 * Run Enhanced Strategy Backtest and Optimization
 *
 * This script will:
 * 1. Test the enhanced strategy on the week of data
 * 2. Compare results to original strategy
 * 3. Run parameter optimization if needed
 */

const { Pool } = require('pg');
const BacktestEngine = require('./engine/backtest-engine');
const HAVWAPEnhancedStrategy = require('./strategies/havwap-enhanced');
const alpacaClient = require('./utils/alpaca-client');

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'database',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'trading_system',
  user: process.env.DB_USER || 'trader',
  password: process.env.DB_PASSWORD || 'trading123'
});

const engine = new BacktestEngine(pool, alpacaClient);

/**
 * Run single backtest with enhanced strategy
 */
async function runEnhancedBacktest(date) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`TESTING ENHANCED STRATEGY: ${date}`);
  console.log(`${'='.repeat(80)}\n`);

  const strategy = new HAVWAPEnhancedStrategy({
    // Use data-driven parameters
    priceVwapThreshold: 0.0015,
    minVwapDistance: 0.0010,
    profitTarget: 0.25,
    stopLoss: 0.20,
    maxHoldingPeriod: 45,
    maxPositions: 3,
    capitalPerPosition: 0.25,
    enableThetaAdjustment: true,
    enablePortfolioLimits: true,
    enableTimeFilter: true,
    avoidOpenMinutes: 15,
    avoidCloseMinutes: 30
  });

  try {
    const result = await engine.runBacktest({
      strategy: strategy,
      symbol: 'SPY',
      startDate: date,
      endDate: date,
      initialCapital: 100000,
      mode: 'backtest'
    });

    console.log(`\n✅ Backtest Results for ${date}:`);
    console.log(`   Final Capital: $${result.performance.totalReturn >= 0 ? '' : ''}${(100000 * (1 + result.performance.totalReturn)).toLocaleString()}`);
    console.log(`   Total Return: ${(result.performance.totalReturn * 100).toFixed(2)}%`);
    console.log(`   Sharpe Ratio: ${result.performance.sharpeRatio.toFixed(3)}`);
    console.log(`   Win Rate: ${(result.performance.winRate * 100).toFixed(1)}%`);
    console.log(`   Total Trades: ${result.performance.totalTrades}`);
    console.log(`   Profit Factor: ${result.performance.profitFactor.toFixed(2)}`);
    console.log(`   Max Drawdown: ${(result.performance.maxDrawdown * 100).toFixed(2)}%`);

    return result;

  } catch (error) {
    console.error(`\n❌ Backtest failed for ${date}:`, error.message);
    console.error(error.stack);
    return null;
  }
}

/**
 * Run optimization targeting 2.0+ Sharpe
 */
async function runOptimization() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`RUNNING PARAMETER OPTIMIZATION FOR 2.0+ SHARPE`);
  console.log(`${'='.repeat(80)}\n`);

  const config = {
    strategyName: 'HAVWAP-Enhanced',
    symbols: ['SPY'],
    startDate: '2025-01-27',
    endDate: '2025-01-31',
    initialCapital: 100000,
    maxIterations: 50, // Reduced for faster testing
    primaryMetric: 'sharpe_ratio',
    maxPositions: 3,
    contracts: 1
  };

  try {
    const result = await engine.runOptimization(config);

    console.log(`\n🏆 OPTIMIZATION COMPLETE!`);
    console.log(`   Best Sharpe: ${result.bestScore.toFixed(3)}`);
    console.log(`   Method: ${result.optimizationMethod}`);
    console.log(`   Iterations: ${result.totalIterations}`);
    console.log(`   Duration: ${result.duration.toFixed(1)} minutes`);
    console.log(`\n   📄 Results saved to: ${result.resultsFile}`);
    if (result.strategyFile) {
      console.log(`   📄 Optimized strategy: ${result.strategyFile}`);
    }

    console.log(`\n   🎯 Best Parameters:`);
    Object.entries(result.bestParams).forEach(([key, value]) => {
      console.log(`      ${key}: ${typeof value === 'number' ? value.toFixed(4) : value}`);
    });

    return result;

  } catch (error) {
    console.error(`\n❌ Optimization failed:`, error.message);
    console.error(error.stack);
    return null;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log(`\n🚀 ENHANCED STRATEGY TESTING & OPTIMIZATION\n`);

  const testDates = ['2025-01-31']; // Start with one day for quick test

  // Phase 1: Test enhanced strategy
  console.log(`\n📊 PHASE 1: Testing Enhanced Strategy on ${testDates.length} day(s)\n`);

  const backtestResults = [];
  for (const date of testDates) {
    const result = await runEnhancedBacktest(date);
    if (result) {
      backtestResults.push(result);
    }
  }

  if (backtestResults.length === 0) {
    console.error(`\n❌ No successful backtests. Cannot proceed with optimization.`);
    await pool.end();
    process.exit(1);
  }

  // Calculate aggregate performance
  const avgSharpe = backtestResults.reduce((sum, r) => sum + r.performance.sharpeRatio, 0) / backtestResults.length;
  const avgReturn = backtestResults.reduce((sum, r) => sum + r.performance.totalReturn, 0) / backtestResults.length;
  const avgWinRate = backtestResults.reduce((sum, r) => sum + r.performance.winRate, 0) / backtestResults.length;

  console.log(`\n📈 AGGREGATE PERFORMANCE:`);
  console.log(`   Avg Sharpe: ${avgSharpe.toFixed(3)}`);
  console.log(`   Avg Return: ${(avgReturn * 100).toFixed(2)}%`);
  console.log(`   Avg Win Rate: ${(avgWinRate * 100).toFixed(1)}%`);

  // Phase 2: Optimization if Sharpe < 2.0
  if (avgSharpe < 2.0) {
    console.log(`\n⚠️  Sharpe ratio (${avgSharpe.toFixed(3)}) below target of 2.0`);
    console.log(`📊 PHASE 2: Running Parameter Optimization...\n`);

    const optimizationResult = await runOptimization();

    if (optimizationResult && optimizationResult.bestScore >= 2.0) {
      console.log(`\n🎯 SUCCESS! Achieved target Sharpe of ${optimizationResult.bestScore.toFixed(3)}`);
    } else if (optimizationResult) {
      console.log(`\n⚠️  Best Sharpe found: ${optimizationResult.bestScore.toFixed(3)} (below 2.0 target)`);
      console.log(`   Consider: Longer optimization, different date range, or strategy adjustments`);
    }
  } else {
    console.log(`\n🎯 SUCCESS! Already achieved ${avgSharpe.toFixed(3)} Sharpe (target: 2.0)`);
  }

  await pool.end();
  console.log(`\n✅ All done!\n`);
}

// Run
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
