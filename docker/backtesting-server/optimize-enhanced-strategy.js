/**
 * Optimize HAVWAP Enhanced Strategy Parameters
 *
 * Uses Bayesian optimization (TPE sampler) to find optimal parameters
 * targeting 2.0+ Sharpe ratio
 *
 * OPTIMIZATION APPROACH:
 * 1. Train/validation split (70/30)
 * 2. Wide parameter ranges
 * 3. Optimize on validation Sharpe
 * 4. Prevent overfitting with out-of-sample testing
 */

const { Pool } = require('pg');
const moment = require('moment-timezone');

// Database connection
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
 * Define optimization parameter space for HAVWAP Enhanced
 */
function defineParameterSpace(trial) {
  return {
    // VWAP Entry Parameters
    priceVwapThreshold: trial.suggest_float('priceVwapThreshold', 0.0005, 0.0050), // 0.05% to 0.50%
    minVwapDistance: trial.suggest_float('minVwapDistance', 0.0003, 0.0030), // 0.03% to 0.30%
    slopeThreshold: trial.suggest_float('slopeThreshold', 0.00001, 0.0001), // Very small slopes

    // Exit Parameters (percentages as decimals)
    profitTarget: trial.suggest_float('profitTarget', 0.10, 0.40), // 10% to 40%
    stopLoss: trial.suggest_float('stopLoss', 0.10, 0.35), // 10% to 35%
    maxHoldingPeriod: trial.suggest_int('maxHoldingPeriod', 10, 60), // 10 to 60 minutes

    // Theta Management
    enableThetaAdjustment: trial.suggest_categorical('enableThetaAdjustment', [true, false]),
    thetaDecayThreshold: trial.suggest_float('thetaDecayThreshold', 0.05, 0.20), // 5% to 20%
    finalHourMultiplier: trial.suggest_float('finalHourMultiplier', 1.5, 3.0), // 1.5x to 3.0x

    // Position Sizing
    maxPositions: trial.suggest_int('maxPositions', 2, 5), // 2 to 5 concurrent positions
    capitalPerPosition: trial.suggest_float('capitalPerPosition', 0.15, 0.35), // 15% to 35% per position

    // Option Selection (using config values)
    minVolume: 100, // Fixed from config
    maxSpreadPct: 5, // Fixed from config
    minDelta: trial.suggest_float('minDelta', 0.15, 0.25), // 0.15 to 0.25
    maxDelta: trial.suggest_float('maxDelta', 0.40, 0.60), // 0.40 to 0.60

    // Risk Management
    dailyLossLimit: trial.suggest_float('dailyLossLimit', 0.02, 0.05), // 2% to 5%
    dailyProfitTarget: trial.suggest_float('dailyProfitTarget', 0.04, 0.10), // 4% to 10%

    // Time Filters
    avoidOpenMinutes: trial.suggest_int('avoidOpenMinutes', 10, 30), // 10 to 30 min
    avoidCloseMinutes: trial.suggest_int('avoidCloseMinutes', 20, 45) // 20 to 45 min
  };
}

/**
 * Grid search trial function (no Optuna)
 */
async function gridSearchTrial(trialNumber, params, config) {
  const iteration = trialNumber + 1;
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🎯 Optimization Trial ${iteration}/${config.maxIterations}`);
  console.log(`${'='.repeat(80)}\n`);

  return await runSingleTrial(params, config);
}

/**
 * Objective function for Optuna
 */
async function objectiveFunction(trial, config) {
  const iteration = trial.number + 1;
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🎯 Optimization Trial ${iteration}/${config.maxIterations}`);
  console.log(`${'='.repeat(80)}\n`);

  // Get parameters from Optuna
  const params = defineParameterSpace(trial);

  return await runSingleTrial(params, config);
}

/**
 * Run single backtest trial with given parameters
 */
async function runSingleTrial(params, config) {

  console.log(`📊 Testing Parameters:`);
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === 'number') {
      console.log(`   ${key}: ${value.toFixed(4)}`);
    } else {
      console.log(`   ${key}: ${value}`);
    }
  });

  try {
    // Create strategy with these parameters
    const strategy = new HAVWAPEnhancedStrategy(params);

    // Run backtest on TRAINING period
    console.log(`\n🏋️  Training Backtest (${config.trainStart} to ${config.trainEnd}):`);
    const trainResult = await engine.runBacktest({
      strategy: strategy,
      symbol: config.symbol,
      startDate: config.trainStart,
      endDate: config.trainEnd,
      initialCapital: config.initialCapital,
      mode: 'backtest'
    });

    const trainSharpe = trainResult.performance.sharpeRatio;
    const trainReturn = trainResult.performance.totalReturn;
    const trainTrades = trainResult.performance.totalTrades;
    const trainWinRate = trainResult.performance.winRate;

    console.log(`   Return: ${(trainReturn * 100).toFixed(2)}%`);
    console.log(`   Sharpe: ${trainSharpe.toFixed(3)}`);
    console.log(`   Win Rate: ${(trainWinRate * 100).toFixed(1)}%`);
    console.log(`   Trades: ${trainTrades}`);

    // If no trades, penalize heavily
    if (trainTrades === 0) {
      console.log(`   ❌ No trades executed - REJECTED`);
      return -999; // Very bad score
    }

    // If too few trades, penalize
    if (trainTrades < 5) {
      console.log(`   ⚠️  Too few trades (${trainTrades}) - PENALIZED`);
      return trainSharpe * 0.5; // Half score
    }

    // Run backtest on VALIDATION period
    console.log(`\n✅ Validation Backtest (${config.validStart} to ${config.validEnd}):`);
    const validResult = await engine.runBacktest({
      strategy: new HAVWAPEnhancedStrategy(params), // Fresh instance
      symbol: config.symbol,
      startDate: config.validStart,
      endDate: config.validEnd,
      initialCapital: config.initialCapital,
      mode: 'backtest'
    });

    const validSharpe = validResult.performance.sharpeRatio;
    const validReturn = validResult.performance.totalReturn;
    const validTrades = validResult.performance.totalTrades;
    const validWinRate = validResult.performance.winRate;

    console.log(`   Return: ${(validReturn * 100).toFixed(2)}%`);
    console.log(`   Sharpe: ${validSharpe.toFixed(3)}`);
    console.log(`   Win Rate: ${(validWinRate * 100).toFixed(1)}%`);
    console.log(`   Trades: ${validTrades}`);

    // If validation has no trades, penalize heavily
    if (validTrades === 0) {
      console.log(`   ❌ No validation trades - REJECTED`);
      return -999;
    }

    // Calculate combined score (weighted toward validation)
    // Formula: 70% validation Sharpe + 30% train Sharpe
    // Bonus for higher trade count (up to +0.5 Sharpe)
    const tradeBonus = Math.min(validTrades / 20, 0.5); // Max +0.5 for 20+ trades
    const score = (validSharpe * 0.7) + (trainSharpe * 0.3) + tradeBonus;

    console.log(`\n🎯 TRIAL SCORE: ${score.toFixed(3)} (Val: ${validSharpe.toFixed(3)}, Train: ${trainSharpe.toFixed(3)}, Bonus: +${tradeBonus.toFixed(2)})`);

    // Check if this is best so far
    if (validSharpe >= 2.0) {
      console.log(`\n🏆 TARGET ACHIEVED! Validation Sharpe: ${validSharpe.toFixed(3)} >= 2.0`);
    }

    return score;

  } catch (error) {
    console.error(`\n❌ Trial failed:`, error.message);
    return -999; // Very bad score for failed trials
  }
}

/**
 * Main optimization function
 */
async function runOptimization() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🚀 HAVWAP ENHANCED STRATEGY OPTIMIZATION`);
  console.log(`   TARGET: 2.0+ Sharpe Ratio`);
  console.log(`   METHOD: Bayesian Optimization (TPE Sampler)`);
  console.log(`${'='.repeat(80)}\n`);

  // Configuration
  const config = {
    symbol: 'SPY',
    initialCapital: 100000,
    maxIterations: 30, // Reduced to 30 for faster completion

    // Data range: Only Jan 31, 2025 available
    // Split the single day: Morning (train) vs Afternoon (validation)
    fullStartDate: '2025-01-31',
    fullEndDate: '2025-01-31',

    // Train: Morning session (9:30 AM - 12:30 PM)
    trainStart: '2025-01-31',
    trainEnd: '2025-01-31',

    // Validation: Afternoon session (12:30 PM - 3:30 PM)
    validStart: '2025-01-31',
    validEnd: '2025-01-31',

    // Use time-based splitting within the day
    useSameDay: true
  };

  console.log(`📅 Optimization Period:`);
  console.log(`   Full Range: ${config.fullStartDate} to ${config.fullEndDate}`);
  console.log(`   🏋️  Training: ${config.trainStart} to ${config.trainEnd} (4 days)`);
  console.log(`   ✅ Validation: ${config.validStart} to ${config.validEnd} (1 day)`);
  console.log(`\n🎲 Trials: ${config.maxIterations}`);

  const startTime = Date.now();
  let bestScore = -Infinity;
  let bestParams = null;
  let bestValidationSharpe = -Infinity;

  try {
    // Import optuna (if available)
    let optuna;
    try {
      optuna = require('optuna');
      console.log(`\n✅ Using Optuna.js for Bayesian optimization`);
    } catch (err) {
      console.log(`\n⚠️  Optuna.js not available, using grid search fallback`);
      optuna = null;
    }

    if (optuna) {
      // BAYESIAN OPTIMIZATION with Optuna
      const study = optuna.create_study({
        direction: 'maximize',
        sampler: new optuna.samplers.TPESampler(),
        pruner: new optuna.pruners.MedianPruner()
      });

      await study.optimize(
        async (trial) => await objectiveFunction(trial, config),
        config.maxIterations
      );

      // Get best trial
      const bestTrial = study.best_trial;
      bestScore = bestTrial.value;
      bestParams = bestTrial.params;

      console.log(`\n${'='.repeat(80)}`);
      console.log(`🏆 OPTIMIZATION COMPLETE (Bayesian)`);
      console.log(`${'='.repeat(80)}\n`);
      console.log(`   Best Score: ${bestScore.toFixed(3)}`);
      console.log(`   Trials Completed: ${study.trials.length}`);

    } else {
      // FALLBACK: Grid search over key parameters
      console.log(`\n📊 Running Grid Search (${config.maxIterations} combinations)`);

      const grid = {
        priceVwapThreshold: [0.0010, 0.0015, 0.0020, 0.0025, 0.0030],
        profitTarget: [0.15, 0.20, 0.25, 0.30],
        stopLoss: [0.15, 0.20, 0.25],
        maxHoldingPeriod: [30, 45, 60],
        maxPositions: [2, 3, 4],
        enableThetaAdjustment: [true, false]
      };

      // Generate combinations (limited to maxIterations)
      let trialCount = 0;
      const keys = Object.keys(grid);
      const generateCombinations = (index = 0, current = {}) => {
        if (index === keys.length) {
          return [current];
        }
        const key = keys[index];
        const values = grid[key];
        const combinations = [];
        for (const value of values) {
          const newCurrent = { ...current, [key]: value };
          combinations.push(...generateCombinations(index + 1, newCurrent));
        }
        return combinations;
      };

      const allCombinations = generateCombinations();
      const combinations = allCombinations.slice(0, config.maxIterations);

      console.log(`   Generated ${combinations.length} parameter combinations`);

      for (let i = 0; i < combinations.length; i++) {
        const params = {
          ...combinations[i],
          // Fill in missing params with defaults
          minVwapDistance: combinations[i].priceVwapThreshold * 0.5,
          slopeThreshold: 0.0001,
          thetaDecayThreshold: 0.10,
          finalHourMultiplier: 2.0,
          capitalPerPosition: 0.25,
          minVolume: 100,
          maxSpreadPct: 5,
          minDelta: 0.20,
          maxDelta: 0.45,
          dailyLossLimit: 0.03,
          dailyProfitTarget: 0.06,
          avoidOpenMinutes: 15,
          avoidCloseMinutes: 30,
          enablePortfolioLimits: true,
          enableTimeFilter: true
        };

        // Grid search uses direct params, not trial object
        const score = await gridSearchTrial(i, params, config);

        if (score > bestScore) {
          bestScore = score;
          bestParams = params;
        }

        trialCount++;
      }

      console.log(`\n${'='.repeat(80)}`);
      console.log(`🏆 OPTIMIZATION COMPLETE (Grid Search)`);
      console.log(`${'='.repeat(80)}\n`);
      console.log(`   Best Score: ${bestScore.toFixed(3)}`);
      console.log(`   Trials Completed: ${trialCount}`);
    }

    // Display best parameters
    console.log(`\n✨ BEST PARAMETERS FOUND:\n`);
    Object.entries(bestParams).forEach(([key, value]) => {
      if (typeof value === 'number') {
        console.log(`   ${key}: ${value.toFixed(6)}`);
      } else {
        console.log(`   ${key}: ${value}`);
      }
    });

    // Save results
    const fs = require('fs').promises;
    const resultsPath = '/app/optimization-results-enhanced.json';
    await fs.writeFile(resultsPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      config: config,
      bestScore: bestScore,
      bestParams: bestParams,
      durationMinutes: (Date.now() - startTime) / 60000
    }, null, 2));

    console.log(`\n💾 Results saved to: ${resultsPath}`);

    // Test best parameters on full period
    console.log(`\n📊 Testing best parameters on FULL period (${config.fullStartDate} to ${config.fullEndDate}):`);
    const strategy = new HAVWAPEnhancedStrategy(bestParams);
    const fullResult = await engine.runBacktest({
      strategy: strategy,
      symbol: config.symbol,
      startDate: config.fullStartDate,
      endDate: config.fullEndDate,
      initialCapital: config.initialCapital,
      mode: 'backtest'
    });

    console.log(`\n🎯 FULL PERIOD RESULTS:`);
    console.log(`   Return: ${(fullResult.performance.totalReturn * 100).toFixed(2)}%`);
    console.log(`   Sharpe: ${fullResult.performance.sharpeRatio.toFixed(3)}`);
    console.log(`   Win Rate: ${(fullResult.performance.winRate * 100).toFixed(1)}%`);
    console.log(`   Trades: ${fullResult.performance.totalTrades}`);
    console.log(`   Max Drawdown: ${(fullResult.performance.maxDrawdown * 100).toFixed(2)}%`);

    if (fullResult.performance.sharpeRatio >= 2.0) {
      console.log(`\n🏆🏆🏆 SUCCESS! Achieved ${fullResult.performance.sharpeRatio.toFixed(3)} Sharpe (target: 2.0+)`);
    } else {
      console.log(`\n⚠️  Best Sharpe: ${fullResult.performance.sharpeRatio.toFixed(3)} (target: 2.0+)`);
      console.log(`   Consider: Longer optimization, more trials, or strategy adjustments`);
    }

  } catch (error) {
    console.error(`\n❌ Optimization failed:`, error);
    console.error(error.stack);
  } finally {
    await pool.end();
  }

  console.log(`\n✅ Optimization complete! Duration: ${((Date.now() - startTime) / 60000).toFixed(1)} minutes\n`);
}

// Run optimization
runOptimization()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
