/**
 * Quick Parameter Testing (Single Day)
 *
 * Tests different parameter combinations on Jan 31, 2025 data
 * Note: Not a true optimization (no train/test split) but finds best params for available data
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'database',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'trading_system',
  user: process.env.DB_USER || 'trader',
  password: process.env.DB_PASSWORD || 'trading123'
});

const BacktestEngine = require('./engine/backtest-engine');
const alpacaClient = require('./utils/alpaca-client');
const HAVWAPEnhancedStrategy = require('./strategies/havwap-enhanced');

const engine = new BacktestEngine(pool, alpacaClient);

/**
 * Parameter combinations to test
 */
const parameterSets = [
  {
    name: "Conservative",
    priceVwapThreshold: 0.0020,
    profitTarget: 0.15,
    stopLoss: 0.15,
    maxHoldingPeriod: 30,
    maxPositions: 2,
    enableThetaAdjustment: true
  },
  {
    name: "Balanced",
    priceVwapThreshold: 0.0015,
    profitTarget: 0.20,
    stopLoss: 0.18,
    maxHoldingPeriod: 45,
    maxPositions: 3,
    enableThetaAdjustment: true
  },
  {
    name: "Aggressive",
    priceVwapThreshold: 0.0010,
    profitTarget: 0.25,
    stopLoss: 0.20,
    maxHoldingPeriod: 60,
    maxPositions: 4,
    enableThetaAdjustment: false
  },
  {
    name: "Tight Theta-Aware",
    priceVwapThreshold: 0.0015,
    profitTarget: 0.18,
    stopLoss: 0.16,
    maxHoldingPeriod: 30,
    maxPositions: 3,
    enableThetaAdjustment: true,
    thetaDecayThreshold: 0.08,
    finalHourMultiplier: 2.5
  },
  {
    name: "Wide Range",
    priceVwapThreshold: 0.0025,
    profitTarget: 0.22,
    stopLoss: 0.20,
    maxHoldingPeriod: 45,
    maxPositions: 3,
    enableThetaAdjustment: true
  }
];

async function testParameters() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔬 QUICK PARAMETER TESTING`);
  console.log(`   Date Range: 2024-10-01 to 2024-10-31 (October 2024 - 23 trading days)`);
  console.log(`   Testing: ${parameterSets.length} parameter combinations`);
  console.log(`${'='.repeat(80)}\n`);

  const results = [];

  for (let i = 0; i < parameterSets.length; i++) {
    const paramSet = parameterSets[i];
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🎯 Test ${i + 1}/${parameterSets.length}: ${paramSet.name}`);
    console.log(`${'='.repeat(80)}\n`);

    // Merge with default parameters
    const fullParams = {
      ...paramSet,
      minVwapDistance: paramSet.priceVwapThreshold * 0.6,
      minVolume: 100,
      maxSpreadPct: 5,
      minDelta: 0.20,
      maxDelta: 0.45,
      capitalPerPosition: 0.25,
      dailyLossLimit: 0.03,
      dailyProfitTarget: 0.06,
      avoidOpenMinutes: 15,
      avoidCloseMinutes: 30,
      enablePortfolioLimits: true,
      enableTimeFilter: true
    };

    console.log(`📊 Parameters:`);
    console.log(`   VWAP Threshold: ${(fullParams.priceVwapThreshold * 100).toFixed(2)}%`);
    console.log(`   Profit Target: ${(fullParams.profitTarget * 100).toFixed(0)}%`);
    console.log(`   Stop Loss: ${(fullParams.stopLoss * 100).toFixed(0)}%`);
    console.log(`   Max Hold: ${fullParams.maxHoldingPeriod} min`);
    console.log(`   Max Positions: ${fullParams.maxPositions}`);
    console.log(`   Theta Adjust: ${fullParams.enableThetaAdjustment ? 'ON' : 'OFF'}\n`);

    try {
      const strategy = new HAVWAPEnhancedStrategy(fullParams);

      const result = await engine.runBacktest({
        strategy: strategy,
        symbol: 'SPY',
        startDate: '2024-10-01',
        endDate: '2024-10-31',
        initialCapital: 100000,
        mode: 'backtest'
      });

      const perf = result.performance;

      console.log(`\n📈 Results:`);
      console.log(`   Return: ${(perf.totalReturn * 100).toFixed(2)}%`);
      console.log(`   Sharpe: ${perf.sharpeRatio.toFixed(3)}`);
      console.log(`   Win Rate: ${(perf.winRate * 100).toFixed(1)}%`);
      console.log(`   Trades: ${perf.totalTrades}`);
      console.log(`   Profit Factor: ${perf.profitFactor.toFixed(2)}`);
      console.log(`   Max Drawdown: ${(perf.maxDrawdown * 100).toFixed(2)}%`);

      results.push({
        name: paramSet.name,
        params: fullParams,
        performance: perf,
        score: perf.sharpeRatio + (perf.totalTrades >= 10 ? 0.2 : 0) // Bonus for sufficient trades
      });

    } catch (error) {
      console.error(`\n❌ Test failed:`, error.message);
      results.push({
        name: paramSet.name,
        params: fullParams,
        performance: null,
        score: -999,
        error: error.message
      });
    }
  }

  // Sort by score
  results.sort((a, b) => b.score - a.score);

  console.log(`\n\n${'='.repeat(80)}`);
  console.log(`🏆 RESULTS SUMMARY`);
  console.log(`${'='.repeat(80)}\n`);

  console.log(`Rank | Strategy            | Return | Sharpe | Win% | Trades | Score`);
  console.log(`-----|---------------------|--------|--------|------|--------|-------`);

  results.forEach((result, index) => {
    if (result.performance) {
      const p = result.performance;
      console.log(`${(index + 1).toString().padStart(4)} | ${result.name.padEnd(19)} | ${(p.totalReturn * 100).toFixed(1).padStart(5)}% | ${p.sharpeRatio.toFixed(2).padStart(6)} | ${(p.winRate * 100).toFixed(0).padStart(3)}% | ${p.totalTrades.toString().padStart(6)} | ${result.score.toFixed(2)}`);
    } else {
      console.log(`${(index + 1).toString().padStart(4)} | ${result.name.padEnd(19)} | FAILED`);
    }
  });

  console.log(`\n🥇 BEST STRATEGY: ${results[0].name}`);

  if (results[0].performance) {
    const best = results[0];
    console.log(`\n✨ Best Parameters:`);
    Object.entries(best.params).slice(0, 10).forEach(([key, value]) => {
      if (typeof value === 'number') {
        console.log(`   ${key}: ${value.toFixed(4)}`);
      } else {
        console.log(`   ${key}: ${value}`);
      }
    });

    console.log(`\n📊 Performance:`);
    console.log(`   Return: ${(best.performance.totalReturn * 100).toFixed(2)}%`);
    console.log(`   Sharpe: ${best.performance.sharpeRatio.toFixed(3)}`);
    console.log(`   Win Rate: ${(best.performance.winRate * 100).toFixed(1)}%`);
    console.log(`   Total Trades: ${best.performance.totalTrades}`);
    console.log(`   Profit Factor: ${best.performance.profitFactor.toFixed(2)}`);

    if (best.performance.sharpeRatio >= 2.0) {
      console.log(`\n🎯🎯🎯 TARGET ACHIEVED! Sharpe = ${best.performance.sharpeRatio.toFixed(3)} >= 2.0`);
    } else {
      console.log(`\n⚠️  Best Sharpe: ${best.performance.sharpeRatio.toFixed(3)} (target: 2.0)`);
      console.log(`   Note: Testing on single day - need more data for robust optimization`);
    }

    // Save results
    const fs = require('fs').promises;
    await fs.writeFile('/app/quick-test-results.json', JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to: /app/quick-test-results.json`);
  }

  await pool.end();
}

testParameters()
  .then(() => {
    console.log(`\n✅ Testing complete!\n`);
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
